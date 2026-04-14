import pool from '../config/db.js';

/**
 * CO-PO-PSO DERIVED MAPPING LEVEL SERVICE
 *
 * The raw CO-PO mapping strength (1–3) entered by the teacher is validated.
 * The final mapping level also depends on the % of total course marks attributed to that CO:
 *
 *   marks_pct = (total max marks for CO_x) / (total max marks for course) * 100
 *
 *   IF raw_mapping >= 1:
 *     0 < marks_pct <= 10  → derived_level = 1
 *     10 < marks_pct <= 20 → derived_level = 2
 *     marks_pct > 20       → derived_level = 3
 *   ELSE → derived_level = 0 (no mapping)
 */

class MappingDerivedService {
  /**
   * Compute and store derived CO-PO and CO-PSO mapping levels.
   */
  async derive(courseId) {
    console.log(`\n=== DERIVING CO-PO-PSO MAPPING LEVELS ===`);

    // 1. Compute marks % per CO from question_vertical_analysis + see_question_co_mapping
    const marksPctMap = await this._computeMarksPct(courseId);

    // 2. Derive CO-PO levels
    await this._deriveCOPO(courseId, marksPctMap);

    // 3. Derive CO-PSO levels
    await this._deriveCOPSO(courseId, marksPctMap);

    return marksPctMap;
  }

  async _computeMarksPct(courseId) {
    // Total max marks from CIA marksheets
    const ciaRes = await pool.query(`
      SELECT qva.co_number, SUM(qva.max_marks) AS co_max
      FROM question_vertical_analysis qva
      JOIN marksheets m ON qva.marksheet_id = m.id
      WHERE qva.course_id = $1
      GROUP BY qva.co_number
    `, [courseId]);

    // Total max marks from SEE question mapping
    const seeRes = await pool.query(`
      SELECT co_number, SUM(max_marks) AS co_max
      FROM see_question_co_mapping
      WHERE course_id = $1
      GROUP BY co_number
    `, [courseId]);

    // Merge: CO → total max marks
    const coMaxMap = {};
    ciaRes.rows.forEach(r => {
      coMaxMap[r.co_number] = (coMaxMap[r.co_number] || 0) + parseFloat(r.co_max || 0);
    });
    seeRes.rows.forEach(r => {
      coMaxMap[r.co_number] = (coMaxMap[r.co_number] || 0) + parseFloat(r.co_max || 0);
    });

    const totalMax = Object.values(coMaxMap).reduce((s, v) => s + v, 0);

    const marksPctMap = {};
    if (totalMax > 0) {
      Object.entries(coMaxMap).forEach(([coNum, coMax]) => {
        marksPctMap[parseInt(coNum)] = (coMax / totalMax) * 100;
      });
    }

    console.log('  Marks % per CO:', marksPctMap);
    return marksPctMap;
  }

  _derivedLevel(rawStrength, marksPct) {
    if (!rawStrength || rawStrength < 1) return 0;
    if (marksPct <= 0)   return 0;
    if (marksPct <= 10)  return 1;
    if (marksPct <= 20)  return 2;
    return 3;
  }

  async _deriveCOPO(courseId, marksPctMap) {
    // Get all COs for this course with their raw CO-PO mappings
    const mappings = await pool.query(`
      SELECT cpm.co_id, cpm.po_id, cpm.correlation_level,
             co.co_number
      FROM co_po_mapping cpm
      JOIN course_outcomes co ON cpm.co_id = co.id
      WHERE co.course_id = $1
    `, [courseId]);

    // Clear previous derived
    await pool.query('DELETE FROM co_po_mapping_derived WHERE course_id = $1', [courseId]);

    for (const m of mappings.rows) {
      const marksPct = marksPctMap[m.co_number] || 0;
      const derived  = this._derivedLevel(m.correlation_level, marksPct);

      await pool.query(`
        INSERT INTO co_po_mapping_derived
          (course_id, co_id, po_id, raw_mapping_strength, marks_pct, derived_level)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (course_id, co_id, po_id) DO UPDATE SET
          raw_mapping_strength = EXCLUDED.raw_mapping_strength,
          marks_pct            = EXCLUDED.marks_pct,
          derived_level        = EXCLUDED.derived_level,
          calculated_at        = CURRENT_TIMESTAMP
      `, [courseId, m.co_id, m.po_id, m.correlation_level, marksPct, derived]);
    }
    console.log(`  CO-PO derived levels: ${mappings.rows.length} pairs`);
  }

  async _deriveCOPSO(courseId, marksPctMap) {
    const mappings = await pool.query(`
      SELECT cpm.co_id, cpm.pso_id, cpm.correlation_level,
             co.co_number
      FROM co_pso_mapping cpm
      JOIN course_outcomes co ON cpm.co_id = co.id
      WHERE co.course_id = $1
    `, [courseId]);

    await pool.query('DELETE FROM co_pso_mapping_derived WHERE course_id = $1', [courseId]);

    for (const m of mappings.rows) {
      const marksPct = marksPctMap[m.co_number] || 0;
      const derived  = this._derivedLevel(m.correlation_level, marksPct);

      await pool.query(`
        INSERT INTO co_pso_mapping_derived
          (course_id, co_id, pso_id, raw_mapping_strength, marks_pct, derived_level)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (course_id, co_id, pso_id) DO UPDATE SET
          raw_mapping_strength = EXCLUDED.raw_mapping_strength,
          marks_pct            = EXCLUDED.marks_pct,
          derived_level        = EXCLUDED.derived_level,
          calculated_at        = CURRENT_TIMESTAMP
      `, [courseId, m.co_id, m.pso_id, m.correlation_level, marksPct, derived]);
    }
    console.log(`  CO-PSO derived levels: ${mappings.rows.length} pairs`);
  }
}

export default new MappingDerivedService();
