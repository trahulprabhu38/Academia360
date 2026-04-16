import pool from '../config/db.js';

/**
 * COMBINED CIA CO ATTAINMENT CALCULATOR
 *
 * Matches the spreadsheet formula exactly:
 *
 *   CIE_CO = SUM(Theory_CO_att, Lab_CO_att, Quiz1_CO_att, Quiz2_CO_att)
 *            / COUNT_NON_ZERO(same)
 *
 * Where each "group attainment" (Theory, Lab) is the FLAT AVERAGE of all
 * per-question co_attainment_percent values within that category:
 *   Theory CIA = avg(q1_att, q2_att, ..., AAT_att, Quiz_att)  ← all questions equal weight
 *   Lab CIA    = avg(lab_q1_att, lab_q2_att, ...)
 * This matches the spreadsheet's SUMIF/COUNTIFS formula on the Theory sheet row 89.
 *
 * Assessment categories (marksheet_category column):
 *   THEORY  → CIE tests + AAT + QUIZ uploaded under the theory marksheet
 *   LAB     → Lab CIA marksheets
 *   QUIZ1   → Optional separate Quiz 1 sheet (usually 0)
 *   QUIZ2   → Optional separate Quiz 2 sheet (usually 0)
 *
 * Formula per CO:
 *   theory_att = avg(all THEORY questions for this CO)
 *   lab_att    = avg(all LAB questions for this CO)
 *   groups     = [theory_att, lab_att, quiz1_att, quiz2_att] filtered to > 0
 *   CIE_CO     = avg(groups)          ← assessment-group-level average
 */

class CombinedCOAttainmentService {

  async calculateCombinedCOAttainment(courseId) {
    console.log(`\n=== CALCULATING CIA CO ATTAINMENT (assessment-group formula) ===`);

    const cosQuery = await pool.query(
      'SELECT id, co_number, description FROM course_outcomes WHERE course_id = $1 ORDER BY co_number',
      [courseId]
    );

    const combinedResults = [];

    for (const co of cosQuery.rows) {
      const { id: coId, co_number: coNumber } = co;

      // Step 1: Compute per-category CO attainment using the spreadsheet formula exactly.
      //
      // The spreadsheet (Theory sheet row 89) stores per-COLUMN attainments.
      // Theory CIA = SUMIF(co_row,"=*CO*", att_row) / COUNTIFS(...,"<>0")
      //            = FLAT AVERAGE of all per-question attainments for that CO
      //              across ALL theory marksheets (CIE1, CIE2, CIE3, AAT, Quiz).
      //
      // CIE = avg(Theory_CIA, Lab_CIA) — non-zero groups only.
      //
      // This is a FLAT average within each category — NOT a two-level per-marksheet average.
      // Every question/column contributes equally regardless of which CIE test it belongs to.
      const groupRows = await pool.query(`
        SELECT
          CASE WHEN LOWER(m.assessment_name) LIKE '%lab%' THEN 'LAB' ELSE 'THEORY' END AS marksheet_category,
          AVG(qva.co_attainment_percent) AS group_att,
          COUNT(*)                        AS q_count
        FROM question_vertical_analysis qva
        JOIN marksheets m ON qva.marksheet_id = m.id
        WHERE qva.course_id = $1
          AND qva.co_number  = $2
          AND m.course_id    = $1
          AND qva.attempts_count > 0
        GROUP BY CASE WHEN LOWER(m.assessment_name) LIKE '%lab%' THEN 'LAB' ELSE 'THEORY' END
      `, [courseId, coNumber]);

      if (groupRows.rows.length === 0) {
        console.log(`  CO${coNumber}: no CIA questions found`);
        combinedResults.push({ courseId, coId, coNumber, attainmentPercent: 0, questionCount: 0, totalAttempts: 0 });
        continue;
      }

      // Step 2: CIE = average of the non-zero group attainments
      const nonZeroGroups = groupRows.rows.filter(r => parseFloat(r.group_att) > 0);
      const attainmentPercent = nonZeroGroups.length > 0
        ? nonZeroGroups.reduce((s, r) => s + parseFloat(r.group_att), 0) / nonZeroGroups.length
        : 0;

      const totalAttempts = 0; // not used downstream, kept for schema compat
      const questionCount  = groupRows.rows.reduce((s, r) => s + parseInt(r.q_count), 0);

      const groupSummary = groupRows.rows
        .map(r => `${r.marksheet_category}=${parseFloat(r.group_att).toFixed(2)}`)
        .join(', ');
      console.log(`  CO${coNumber}: groups=[${groupSummary}] → CIE=${attainmentPercent.toFixed(4)}%`);

      combinedResults.push({ courseId, coId, coNumber, attainmentPercent, questionCount, totalAttempts });
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
        threshold DECIMAL(10,2) DEFAULT 60.0,
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(course_id, co_id)
      )
    `);

    await pool.query('DELETE FROM combined_co_attainment_calculated WHERE course_id = $1', [courseId]);

    for (const r of results) {
      await pool.query(`
        INSERT INTO combined_co_attainment_calculated
          (course_id, co_id, co_number, total_max_marks, total_attempts,
           students_above_threshold, attainment_percent, threshold)
        VALUES ($1, $2, $3, 0, $4, 0, $5, 60.0)
        ON CONFLICT (course_id, co_id) DO UPDATE SET
          total_max_marks            = 0,
          total_attempts             = EXCLUDED.total_attempts,
          students_above_threshold   = 0,
          attainment_percent         = EXCLUDED.attainment_percent,
          calculated_at              = CURRENT_TIMESTAMP
      `, [r.courseId, r.coId, r.coNumber, r.totalAttempts, r.attainmentPercent]);
    }
    console.log(`✅ Stored ${results.length} CIA CO attainment results`);
  }

  async getCIAAttainmentMap(courseId) {
    const rows = await pool.query(
      `SELECT co_number, co_id, attainment_percent
       FROM combined_co_attainment_calculated WHERE course_id = $1`,
      [courseId]
    );
    const map = {};
    rows.rows.forEach(r => { map[r.co_number] = parseFloat(r.attainment_percent || 0); });
    return map;
  }
}

export default new CombinedCOAttainmentService();
