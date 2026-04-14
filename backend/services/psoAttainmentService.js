import pool from '../config/db.js';

/**
 * PSO ATTAINMENT SERVICE
 *
 * Same formula as PO attainment but uses co_pso_mapping_derived:
 *   PSO_x = Σ(CO_i_final × derived_level_i_x) / Σ(derived_level_i_x)
 */

class PSOAttainmentService {
  _classifyLevel(pct, target = 60) {
    if (pct >= 80)     return 3;
    if (pct >= target) return 2;
    return 1;
  }

  async calculate(courseId) {
    console.log(`\n=== CALCULATING PSO ATTAINMENT ===`);

    // Final CO attainment
    const coAtt = await pool.query(
      'SELECT co_id, final_attainment FROM co_attainment_final WHERE course_id = $1',
      [courseId]
    );
    const coAttMap = {};
    coAtt.rows.forEach(r => { coAttMap[r.co_id] = parseFloat(r.final_attainment || 0); });

    // All PSOs
    const psosRes = await pool.query('SELECT id, pso_number FROM pso_outcomes ORDER BY pso_number');

    // Derived CO-PSO mappings
    const mappings = await pool.query(
      `SELECT co_id, pso_id, derived_level
       FROM co_pso_mapping_derived
       WHERE course_id = $1 AND derived_level > 0`,
      [courseId]
    );

    const byPSO = {};
    mappings.rows.forEach(m => {
      if (!byPSO[m.pso_id]) byPSO[m.pso_id] = [];
      byPSO[m.pso_id].push({ co_id: m.co_id, level: parseInt(m.derived_level) });
    });

    const results = [];

    for (const pso of psosRes.rows) {
      const coList = byPSO[pso.id] || [];
      if (coList.length === 0) continue;

      let weightedSum = 0;
      let totalWeight = 0;

      for (const { co_id, level } of coList) {
        const att = coAttMap[co_id] || 0;
        weightedSum += att * level;
        totalWeight += level;
      }

      const psoAtt = totalWeight > 0 ? weightedSum / totalWeight : 0;
      const level  = this._classifyLevel(psoAtt);

      console.log(`  PSO${pso.pso_number}: ${coList.length} COs mapped, attainment=${psoAtt.toFixed(2)}%, Level ${level}`);

      await pool.query(`
        INSERT INTO pso_attainment
          (course_id, pso_id, direct_attainment, final_attainment, attainment_level)
        VALUES ($1, $2, $3, $3, $4)
        ON CONFLICT (course_id, pso_id) DO UPDATE SET
          direct_attainment = EXCLUDED.direct_attainment,
          final_attainment  = EXCLUDED.final_attainment,
          attainment_level  = EXCLUDED.attainment_level,
          calculated_at     = CURRENT_TIMESTAMP
      `, [courseId, pso.id, psoAtt, level]);

      results.push({ pso_number: pso.pso_number, attainment: psoAtt, level });
    }

    console.log(`✅ PSO attainment stored for ${results.length} PSOs`);
    return results;
  }

  async getDetail(courseId) {
    const res = await pool.query(`
      SELECT
        pso.pso_number,
        pso.description,
        pa.direct_attainment,
        pa.final_attainment,
        pa.attainment_level,
        pa.calculated_at
      FROM pso_attainment pa
      JOIN pso_outcomes pso ON pa.pso_id = pso.id
      WHERE pa.course_id = $1
      ORDER BY pso.pso_number
    `, [courseId]);
    return res.rows;
  }
}

export default new PSOAttainmentService();
