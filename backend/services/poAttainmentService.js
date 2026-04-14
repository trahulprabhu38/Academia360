import pool from '../config/db.js';

/**
 * PO ATTAINMENT SERVICE
 *
 * Formula (NBA document):
 *   PO_x = Σ(CO_i_final × derived_level_i_x) / Σ(derived_level_i_x for all COs mapped to PO_x)
 *
 * Uses co_po_mapping_derived (not raw co_po_mapping).
 *
 * Attainment level:
 *   PO_x >= 80% → Level 3
 *   PO_x >= 60% → Level 2
 *   PO_x <  60% → Level 1
 */

class POAttainmentService {
  _classifyLevel(pct, target = 60) {
    if (pct >= 80)     return 3;
    if (pct >= target) return 2;
    return 1;
  }

  async calculate(courseId) {
    console.log(`\n=== CALCULATING PO ATTAINMENT ===`);

    // Get final CO attainment values
    const coAtt = await pool.query(
      'SELECT co_id, co_number, final_attainment FROM co_attainment_final WHERE course_id = $1',
      [courseId]
    );
    const coAttMap = {};
    coAtt.rows.forEach(r => { coAttMap[r.co_id] = parseFloat(r.final_attainment || 0); });

    // Get all POs
    const posRes = await pool.query('SELECT id, po_number FROM program_outcomes ORDER BY po_number');

    // Get derived CO-PO mappings for this course
    const mappings = await pool.query(
      `SELECT co_id, po_id, derived_level
       FROM co_po_mapping_derived
       WHERE course_id = $1 AND derived_level > 0`,
      [courseId]
    );

    // Group by PO
    const byPO = {};
    mappings.rows.forEach(m => {
      if (!byPO[m.po_id]) byPO[m.po_id] = [];
      byPO[m.po_id].push({ co_id: m.co_id, level: parseInt(m.derived_level) });
    });

    const results = [];

    for (const po of posRes.rows) {
      const coList = byPO[po.id] || [];
      if (coList.length === 0) continue;

      let weightedSum = 0;
      let totalWeight = 0;

      for (const { co_id, level } of coList) {
        const attainment = coAttMap[co_id] || 0;
        weightedSum += attainment * level;
        totalWeight += level;
      }

      const poAtt  = totalWeight > 0 ? weightedSum / totalWeight : 0;
      const level  = this._classifyLevel(poAtt);

      console.log(`  PO${po.po_number}: ${coList.length} COs mapped, attainment=${poAtt.toFixed(2)}%, Level ${level}`);

      await pool.query(`
        INSERT INTO po_attainment_final
          (course_id, po_id, direct_attainment, indirect_attainment, final_attainment, attainment_level)
        VALUES ($1, $2, $3, 0, $3, $4)
        ON CONFLICT (course_id, po_id) DO UPDATE SET
          direct_attainment  = EXCLUDED.direct_attainment,
          final_attainment   = EXCLUDED.final_attainment,
          attainment_level   = EXCLUDED.attainment_level,
          calculated_at      = CURRENT_TIMESTAMP
      `, [courseId, po.id, poAtt, level]);

      results.push({ po_number: po.po_number, attainment: poAtt, level });
    }

    console.log(`✅ PO attainment stored for ${results.length} POs`);
    return results;
  }

  async getDetail(courseId) {
    const res = await pool.query(`
      SELECT
        po.po_number,
        po.description,
        paf.direct_attainment,
        paf.indirect_attainment,
        paf.final_attainment,
        paf.attainment_level,
        paf.calculated_at
      FROM po_attainment_final paf
      JOIN program_outcomes po ON paf.po_id = po.id
      WHERE paf.course_id = $1
      ORDER BY po.po_number
    `, [courseId]);
    return res.rows;
  }
}

export default new POAttainmentService();
