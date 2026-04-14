import pool from '../config/db.js';

/**
 * SEE CO ATTAINMENT SERVICE
 *
 * Uses see_question_co_mapping + see_question_scores to compute
 * CO-wise attainment for the Semester End Examination.
 *
 * Formula (same as CIA per-question formula):
 *   threshold = max_marks * 0.65
 *   A = students attempted (non-null score)
 *   B = sum of marks of students who scored >= threshold
 *   SEE_CO_attainment_q = ((B / A) / max_marks) * 100
 *
 * CO attainment = average over all questions mapped to that CO.
 *
 * Fallback: if no question-wise mapping exists, use the overall
 * see_marks (out of 100) to approximate SEE CO attainment uniformly.
 */

class SeeCOAttainmentService {
  /**
   * Save SEE question → CO mapping (bulk upsert).
   * @param {string} courseId
   * @param {Array<{question_label, co_number, max_marks}>} mappings
   */
  async saveSEEQuestionMapping(courseId, mappings) {
    await pool.query('DELETE FROM see_question_co_mapping WHERE course_id = $1', [courseId]);
    for (const m of mappings) {
      await pool.query(`
        INSERT INTO see_question_co_mapping (course_id, question_label, co_number, max_marks)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (course_id, question_label) DO UPDATE SET
          co_number = EXCLUDED.co_number,
          max_marks = EXCLUDED.max_marks
      `, [courseId, m.question_label.trim().toLowerCase(), m.co_number, m.max_marks]);
    }
    return { saved: mappings.length };
  }

  /**
   * Save SEE question-wise scores (bulk upsert).
   * @param {string} courseId
   * @param {Array<{usn, question_label, marks_obtained}>} scoresData
   */
  async saveSEEQuestionScores(courseId, scoresData) {
    // Resolve USN → student_id
    const usnList = [...new Set(scoresData.map(s => s.usn.trim().toUpperCase()))];
    const usersRes = await pool.query(
      `SELECT id, usn FROM users WHERE UPPER(usn) = ANY($1)`,
      [usnList]
    );
    const usnMap = {};
    usersRes.rows.forEach(u => { usnMap[u.usn.toUpperCase()] = u.id; });

    // Get question mappings for max_marks and co_number
    const qMaps = await pool.query(
      'SELECT question_label, co_number, max_marks FROM see_question_co_mapping WHERE course_id = $1',
      [courseId]
    );
    const qMapByLabel = {};
    qMaps.rows.forEach(q => { qMapByLabel[q.question_label.toLowerCase()] = q; });

    let saved = 0, failed = 0;
    for (const s of scoresData) {
      const studentId = usnMap[s.usn.trim().toUpperCase()];
      if (!studentId) { failed++; continue; }
      const qInfo = qMapByLabel[s.question_label.trim().toLowerCase()];
      if (!qInfo) { failed++; continue; }

      await pool.query(`
        INSERT INTO see_question_scores
          (student_id, course_id, question_label, co_number, marks_obtained, max_marks)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (student_id, course_id, question_label) DO UPDATE SET
          marks_obtained = EXCLUDED.marks_obtained,
          max_marks = EXCLUDED.max_marks
      `, [studentId, courseId, s.question_label.trim().toLowerCase(), qInfo.co_number, s.marks_obtained, qInfo.max_marks]);
      saved++;
    }
    return { saved, failed };
  }

  /**
   * Calculate SEE CO attainment for a course.
   * Returns a map: { co_number: attainment_percent }
   */
  async calculate(courseId) {
    console.log(`\n=== CALCULATING SEE CO ATTAINMENT ===`);

    const cosQuery = await pool.query(
      'SELECT id, co_number FROM course_outcomes WHERE course_id = $1 ORDER BY co_number',
      [courseId]
    );

    // Check if question-wise mapping exists
    const mappingCount = await pool.query(
      'SELECT COUNT(*) FROM see_question_co_mapping WHERE course_id = $1',
      [courseId]
    );
    const hasQuestionMapping = parseInt(mappingCount.rows[0].count) > 0;

    const results = {};
    const thresholdPct = 65.0;

    if (hasQuestionMapping) {
      // Question-wise calculation
      const qMaps = await pool.query(
        'SELECT question_label, co_number, max_marks FROM see_question_co_mapping WHERE course_id = $1',
        [courseId]
      );

      // Group questions by CO
      const byco = {};
      qMaps.rows.forEach(q => {
        if (!byco[q.co_number]) byco[q.co_number] = [];
        byco[q.co_number].push(q);
      });

      for (const co of cosQuery.rows) {
        const qs = byco[co.co_number] || [];
        if (qs.length === 0) {
          results[co.co_number] = 0;
          continue;
        }

        let qAttainments = [];
        for (const q of qs) {
          const threshold = parseFloat(q.max_marks) * (thresholdPct / 100);
          const scoresRes = await pool.query(`
            SELECT marks_obtained FROM see_question_scores
            WHERE course_id = $1 AND question_label = $2 AND marks_obtained IS NOT NULL
          `, [courseId, q.question_label]);

          const marks = scoresRes.rows.map(r => parseFloat(r.marks_obtained));
          const A = marks.length;
          if (A === 0) continue;
          const B = marks.filter(m => m >= threshold).reduce((s, m) => s + m, 0);
          const qAtt = ((B / A) / parseFloat(q.max_marks)) * 100;
          qAttainments.push(qAtt);
        }

        const coAtt = qAttainments.length > 0
          ? qAttainments.reduce((s, v) => s + v, 0) / qAttainments.length
          : 0;

        console.log(`  CO${co.co_number} (SEE): ${qAttainments.length} Qs, attainment=${coAtt.toFixed(2)}%`);
        results[co.co_number] = coAtt;
      }
    } else {
      // Fallback: use overall SEE marks (no question-level mapping available).
      // Each student's SEE total is treated as applying equally to all COs.
      // Attainment = percentage of students who scored >= threshold on the SEE.
      console.log('  No SEE question mapping — using overall SEE pass-rate as fallback');
      const seeRes = await pool.query(
        'SELECT see_marks_obtained, see_max_marks FROM see_marks WHERE course_id = $1',
        [courseId]
      );

      if (seeRes.rows.length === 0) {
        cosQuery.rows.forEach(co => { results[co.co_number] = 0; });
        return results;
      }

      const marks = seeRes.rows.map(r => parseFloat(r.see_marks_obtained));
      const maxMarks = parseFloat(seeRes.rows[0].see_max_marks) || 100;
      const threshold = maxMarks * (thresholdPct / 100);
      const A = marks.length;
      // Count-based attainment: % of students who scored >= threshold
      const studentsAbove = marks.filter(m => m >= threshold).length;
      const overallAtt = A > 0 ? (studentsAbove / A) * 100 : 0;

      console.log(`  Overall SEE attainment (fallback): ${studentsAbove}/${A} >= ${threshold.toFixed(0)} = ${overallAtt.toFixed(2)}%`);
      cosQuery.rows.forEach(co => { results[co.co_number] = overallAtt; });
    }

    return results;
  }

  async getSEEQuestionMapping(courseId) {
    const res = await pool.query(
      'SELECT question_label, co_number, max_marks FROM see_question_co_mapping WHERE course_id = $1 ORDER BY co_number, question_label',
      [courseId]
    );
    return res.rows;
  }
}

export default new SeeCOAttainmentService();
