import pool from '../config/db.js';

/**
 * COURSE EXIT SURVEY (CES) SERVICE
 *
 * CES is the indirect attainment tool as per NBA / document spec.
 * Students rate each CO on a 5-point Likert scale.
 *
 * Formulas:
 *   weighted_avg = Σ(count_i × i) / total_responses       [i = 1..5]
 *   ces_1to3     = (((weighted_avg - 1) / 4) × 2) + 1     [normalize to 1–3]
 *   ces_pct      = ((ces_1to3 - 1) / 2) × 100             [convert to %, 0–100]
 */

class CESService {
  /** Create or update survey questions for a course (one per CO). */
  async upsertQuestions(courseId, questions) {
    const saved = [];
    for (const q of questions) {
      const res = await pool.query(`
        INSERT INTO ces_questions (course_id, co_id, co_number, question_text, question_order, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (course_id, co_id) DO UPDATE SET
          question_text = EXCLUDED.question_text,
          question_order = EXCLUDED.question_order,
          is_active = EXCLUDED.is_active,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [courseId, q.co_id, q.co_number, q.question_text, q.question_order || q.co_number, q.is_active ?? false]);
      saved.push(res.rows[0]);
    }
    return saved;
  }

  /** Toggle survey open/closed for a course. */
  async setActive(courseId, isActive) {
    await pool.query(
      'UPDATE ces_questions SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE course_id = $2',
      [isActive, courseId]
    );
    return { courseId, isActive };
  }

  /** Get survey questions (only active ones for students). */
  async getQuestions(courseId, activeOnly = false) {
    const whereActive = activeOnly ? 'AND cq.is_active = TRUE' : '';
    const res = await pool.query(`
      SELECT cq.id, cq.co_id, cq.co_number, cq.question_text, cq.question_order, cq.is_active,
             co.description AS co_description
      FROM ces_questions cq
      JOIN course_outcomes co ON cq.co_id = co.id
      WHERE cq.course_id = $1 ${whereActive}
      ORDER BY cq.question_order
    `, [courseId]);
    return res.rows;
  }

  /** Check if student has already submitted. */
  async hasStudentSubmitted(courseId, studentId) {
    const res = await pool.query(
      'SELECT COUNT(*) FROM ces_responses WHERE course_id = $1 AND student_id = $2',
      [courseId, studentId]
    );
    return parseInt(res.rows[0].count) > 0;
  }

  /**
   * Submit student responses.
   * @param {string} courseId
   * @param {string} studentId
   * @param {Array<{co_id, co_number, rating}>} responses
   */
  async submitResponses(courseId, studentId, responses) {
    // Validate all questions are active
    const activeQs = await this.getQuestions(courseId, true);
    const activeCoIds = new Set(activeQs.map(q => q.co_id));

    const toInsert = responses.filter(r => activeCoIds.has(r.co_id));
    if (toInsert.length === 0) throw new Error('No active CES questions to respond to');

    for (const r of toInsert) {
      await pool.query(`
        INSERT INTO ces_responses (course_id, student_id, co_id, co_number, rating)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (course_id, student_id, co_id) DO UPDATE SET
          rating = EXCLUDED.rating,
          submitted_at = CURRENT_TIMESTAMP
      `, [courseId, studentId, r.co_id, r.co_number, r.rating]);
    }
    return { submitted: toInsert.length };
  }

  /**
   * Compute and store CES attainment for all COs of a course.
   * Returns map: { co_number: { weighted_avg, ces_attainment_1to3, ces_pct } }
   */
  async calculateAndStore(courseId) {
    console.log(`\n=== CALCULATING CES ATTAINMENT ===`);

    const cosRes = await pool.query(
      'SELECT id, co_number FROM course_outcomes WHERE course_id = $1 ORDER BY co_number',
      [courseId]
    );

    const result = {};

    for (const co of cosRes.rows) {
      // Count responses per rating for this CO
      const ratingsRes = await pool.query(`
        SELECT rating, COUNT(*) AS cnt
        FROM ces_responses
        WHERE course_id = $1 AND co_id = $2
        GROUP BY rating
      `, [courseId, co.id]);

      const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      ratingsRes.rows.forEach(r => { counts[parseInt(r.rating)] = parseInt(r.cnt); });
      const total = Object.values(counts).reduce((s, c) => s + c, 0);

      if (total === 0) {
        result[co.co_number] = { weighted_avg: null, ces_attainment_1to3: null, ces_pct: null };
        continue;
      }

      // Check existing stored response_count — never overwrite richer data with fewer responses.
      // Manual uploads from spreadsheets typically have many more responses than a live survey
      // with only a few submissions; preserving the larger dataset keeps attainment accurate.
      const existingRes = await pool.query(
        'SELECT response_count FROM ces_attainment WHERE course_id = $1 AND co_id = $2',
        [courseId, co.id]
      );
      const existingCount = parseInt(existingRes.rows[0]?.response_count || 0);
      if (total < existingCount) {
        console.log(`  CO${co.co_number}: keeping existing data (${existingCount} responses > ${total} survey responses)`);
        const existing = await pool.query(
          'SELECT weighted_avg, ces_attainment FROM ces_attainment WHERE course_id = $1 AND co_id = $2',
          [courseId, co.id]
        );
        const e = existing.rows[0];
        const ces1to3e = parseFloat(e?.ces_attainment || 0);
        result[co.co_number] = {
          weighted_avg: parseFloat(e?.weighted_avg || 0),
          ces_attainment_1to3: ces1to3e,
          ces_pct: ces1to3e > 0 ? ((ces1to3e - 1) / 2) * 100 : 0
        };
        continue;
      }

      // Weighted average (1–5 scale)
      const weightedAvg =
        (counts[5] * 5 + counts[4] * 4 + counts[3] * 3 + counts[2] * 2 + counts[1] * 1) / total;

      // Normalize to 1–3 scale
      const ces1to3 = ((weightedAvg - 1) / 4) * 2 + 1;

      // Convert to percentage (0–100) for combination with CIE/SEE
      const cesPct = ((ces1to3 - 1) / 2) * 100;

      console.log(`  CO${co.co_number}: responses=${total}, wavg=${weightedAvg.toFixed(3)}, 1-3=${ces1to3.toFixed(3)}, pct=${cesPct.toFixed(2)}%`);

      // Upsert into ces_attainment
      await pool.query(`
        INSERT INTO ces_attainment
          (course_id, co_id, co_number, response_count,
           rating_5_count, rating_4_count, rating_3_count, rating_2_count, rating_1_count,
           weighted_avg, ces_attainment)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (course_id, co_id) DO UPDATE SET
          response_count = EXCLUDED.response_count,
          rating_5_count = EXCLUDED.rating_5_count,
          rating_4_count = EXCLUDED.rating_4_count,
          rating_3_count = EXCLUDED.rating_3_count,
          rating_2_count = EXCLUDED.rating_2_count,
          rating_1_count = EXCLUDED.rating_1_count,
          weighted_avg   = EXCLUDED.weighted_avg,
          ces_attainment = EXCLUDED.ces_attainment,
          calculated_at  = CURRENT_TIMESTAMP
      `, [courseId, co.id, co.co_number, total,
          counts[5], counts[4], counts[3], counts[2], counts[1],
          weightedAvg, ces1to3]);

      result[co.co_number] = { weighted_avg: weightedAvg, ces_attainment_1to3: ces1to3, ces_pct: cesPct };
    }

    return result;
  }

  /** Get CES attainment map for downstream use. */
  async getAttainmentMap(courseId) {
    const res = await pool.query(
      `SELECT co_number, ces_attainment, weighted_avg, response_count
       FROM ces_attainment WHERE course_id = $1`,
      [courseId]
    );
    const map = {};
    res.rows.forEach(r => {
      // Convert 1-3 scale to % for combination formula
      const ces1to3 = parseFloat(r.ces_attainment || 0);
      map[r.co_number] = {
        ces1to3,
        ces_pct: ces1to3 > 0 ? ((ces1to3 - 1) / 2) * 100 : 0,
        response_count: parseInt(r.response_count || 0),
        has_data: parseInt(r.response_count || 0) > 0
      };
    });
    return map;
  }

  /** Get response summary per CO for teacher dashboard. */
  async getResponseSummary(courseId) {
    const res = await pool.query(`
      SELECT
        ca.co_number,
        ca.response_count,
        ca.rating_5_count, ca.rating_4_count, ca.rating_3_count,
        ca.rating_2_count, ca.rating_1_count,
        ca.weighted_avg,
        ca.ces_attainment,
        co.description AS co_description
      FROM ces_attainment ca
      JOIN course_outcomes co ON ca.co_id = co.id
      WHERE ca.course_id = $1
      ORDER BY ca.co_number
    `, [courseId]);
    return res.rows;
  }
}

export default new CESService();
