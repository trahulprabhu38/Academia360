import pool from '../config/db.js';

/**
 * COMBINED CIA CO ATTAINMENT CALCULATOR
 *
 * NBA document formula (per question):
 *   A = students who attempted the question (excluding AB / NA / blank)
 *   B = SUM of marks of students who scored >= 65% of max marks
 *   CO_attainment_q = ((B / A) / max_marks) * 100
 *
 * Per CO: average of all question-level attainments for that CO across CIAs.
 */

class CombinedCOAttainmentService {
  /**
   * Calculate CIA CO attainment for a course from question_vertical_analysis.
   * The table already stores per-question attainment using the correct formula
   * (fixed in detailedCalculations.js).
   */
  async calculateCombinedCOAttainment(courseId) {
    console.log(`\n=== CALCULATING CIA CO ATTAINMENT (NBA formula) ===`);

    const cosQuery = await pool.query(
      'SELECT id, co_number, description FROM course_outcomes WHERE course_id = $1 ORDER BY co_number',
      [courseId]
    );

    const combinedResults = [];

    for (const co of cosQuery.rows) {
      const { id: coId, co_number: coNumber } = co;

      // Aggregate per-question attainment for this CO across all CIA marksheets.
      // Use the stored co_attainment_percent (already computed with correct formula).
      const qva = await pool.query(`
        SELECT
          qva.co_attainment_percent,
          qva.attempts_count,
          qva.max_marks,
          qva.sum_marks_above_threshold,
          qva.threshold_pct
        FROM question_vertical_analysis qva
        JOIN marksheets m ON qva.marksheet_id = m.id
        WHERE qva.course_id = $1
          AND qva.co_number = $2
          AND m.course_id = $1
          AND qva.attempts_count > 0
      `, [courseId, coNumber]);

      if (qva.rows.length === 0) {
        console.log(`  CO${coNumber}: no CIA questions found`);
        combinedResults.push({
          courseId, coId, coNumber,
          attainmentPercent: 0,
          questionCount: 0,
          totalAttempts: 0
        });
        continue;
      }

      // CO attainment = average of per-question attainments
      const attainmentPercent =
        qva.rows.reduce((sum, r) => sum + parseFloat(r.co_attainment_percent || 0), 0) /
        qva.rows.length;

      const totalAttempts = qva.rows.reduce((s, r) => s + parseInt(r.attempts_count || 0), 0);

      console.log(`  CO${coNumber}: ${qva.rows.length} questions, avg attainment=${attainmentPercent.toFixed(2)}%`);

      combinedResults.push({
        courseId, coId, coNumber,
        attainmentPercent,
        questionCount: qva.rows.length,
        totalAttempts
      });
    }

    await this._store(courseId, combinedResults);
    return combinedResults;
  }

  async _store(courseId, results) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS combined_co_attainment_calculated (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        co_id UUID NOT NULL REFERENCES course_outcomes(id) ON DELETE CASCADE,
        co_number INTEGER NOT NULL,
        total_max_marks DECIMAL(10,2) DEFAULT 0,
        total_attempts INTEGER NOT NULL,
        students_above_threshold INTEGER DEFAULT 0,
        attainment_percent DECIMAL(7,4) NOT NULL,
        threshold DECIMAL(10,2) DEFAULT 65.0,
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(course_id, co_id)
      )
    `);

    await pool.query('DELETE FROM combined_co_attainment_calculated WHERE course_id = $1', [courseId]);

    for (const r of results) {
      await pool.query(`
        INSERT INTO combined_co_attainment_calculated
          (course_id, co_id, co_number, total_max_marks, total_attempts, students_above_threshold, attainment_percent, threshold)
        VALUES ($1, $2, $3, 0, $4, 0, $5, 65.0)
        ON CONFLICT (course_id, co_id) DO UPDATE SET
          total_max_marks = 0,
          total_attempts = EXCLUDED.total_attempts,
          students_above_threshold = 0,
          attainment_percent = EXCLUDED.attainment_percent,
          calculated_at = CURRENT_TIMESTAMP
      `, [r.courseId, r.coId, r.coNumber, r.totalAttempts, r.attainmentPercent]);
    }
    console.log(`✅ Stored ${results.length} CIA CO attainment results`);
  }

  /** Convenience getter for downstream services. */
  async getCIAAttainmentMap(courseId) {
    const rows = await pool.query(
      `SELECT co_number, co_id, attainment_percent
       FROM combined_co_attainment_calculated
       WHERE course_id = $1`,
      [courseId]
    );
    const map = {};
    rows.rows.forEach(r => { map[r.co_number] = parseFloat(r.attainment_percent || 0); });
    return map;
  }
}

export default new CombinedCOAttainmentService();
