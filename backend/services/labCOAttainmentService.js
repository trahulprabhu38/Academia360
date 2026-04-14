import pool from '../config/db.js';

/**
 * LAB CO ATTAINMENT SERVICE
 *
 * For each rubric column in lab marksheets, grouped by CO:
 *   attainment_col = ((sum_marks >=65%) / attempts / max_marks) * 100
 *   CO_lab = average of attainments across all columns for that CO
 *
 * Lab marksheets are identified by assessment_name containing 'lab' (case-insensitive)
 * or by the assessment type stored alongside the marksheet.
 */

class LabCOAttainmentService {
  async calculate(courseId) {
    console.log(`\n=== CALCULATING LAB CO ATTAINMENT ===`);

    const cosQuery = await pool.query(
      'SELECT id, co_number FROM course_outcomes WHERE course_id = $1 ORDER BY co_number',
      [courseId]
    );

    // Get lab marksheets — identified by name/type
    const labMarksheets = await pool.query(`
      SELECT m.id, m.assessment_name
      FROM marksheets m
      WHERE m.course_id = $1
        AND (LOWER(m.assessment_name) LIKE '%lab%'
             OR LOWER(m.assessment_name) LIKE '%cie lab%'
             OR LOWER(m.assessment_name) LIKE '%lab test%')
    `, [courseId]);

    if (labMarksheets.rows.length === 0) {
      console.log('  No lab marksheets found — skipping lab CO attainment');
      return {};
    }

    const marksheetIds = labMarksheets.rows.map(r => r.id);
    const results = {};

    for (const co of cosQuery.rows) {
      const { id: coId, co_number: coNumber } = co;

      // Pull all question-level vertical analysis rows for this CO from lab marksheets
      const qva = await pool.query(`
        SELECT
          qva.co_attainment_percent,
          qva.attempts_count,
          qva.max_marks
        FROM question_vertical_analysis qva
        WHERE qva.course_id = $1
          AND qva.co_number = $2
          AND qva.marksheet_id = ANY($3::uuid[])
          AND qva.attempts_count > 0
      `, [courseId, coNumber, marksheetIds]);

      let attainmentPct = 0;
      if (qva.rows.length > 0) {
        attainmentPct =
          qva.rows.reduce((s, r) => s + parseFloat(r.co_attainment_percent || 0), 0) /
          qva.rows.length;
      }

      console.log(`  CO${coNumber} (lab): ${qva.rows.length} cols, attainment=${attainmentPct.toFixed(2)}%`);
      results[coNumber] = { coId, coNumber, attainmentPct, cols: qva.rows.length };
    }

    await this._store(courseId, cosQuery.rows, results);
    return results;
  }

  async _store(courseId, cos, results) {
    await pool.query('DELETE FROM lab_co_attainment WHERE course_id = $1', [courseId]);
    for (const co of cos) {
      const r = results[co.co_number] || { attainmentPct: 0 };
      await pool.query(`
        INSERT INTO lab_co_attainment (course_id, co_id, co_number, attainment_pct, attempts_count)
        VALUES ($1, $2, $3, $4, 0)
        ON CONFLICT (course_id, co_id) DO UPDATE SET
          attainment_pct = EXCLUDED.attainment_pct,
          calculated_at = CURRENT_TIMESTAMP
      `, [courseId, co.id, co.co_number, r.attainmentPct]);
    }
    console.log(`✅ Stored lab CO attainment for ${cos.length} COs`);
  }

  async getAttainmentMap(courseId) {
    const rows = await pool.query(
      'SELECT co_number, attainment_pct FROM lab_co_attainment WHERE course_id = $1',
      [courseId]
    );
    const map = {};
    rows.rows.forEach(r => { map[r.co_number] = parseFloat(r.attainment_pct || 0); });
    return map;
  }
}

export default new LabCOAttainmentService();
