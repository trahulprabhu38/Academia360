import pool from '../config/db.js';
import combinedCOAttainment from './combinedCOAttainment.js';
import labCOAttainmentService from './labCOAttainmentService.js';
import seeCOAttainmentService from './seeCOAttainmentService.js';
import cesService from './cesService.js';

/**
 * FINAL CO ATTAINMENT SERVICE
 *
 * Integrates CIE (theory + lab baked in), SEE, and CES into a single final CO attainment.
 *
 * Lab marks are NOT a separate averaging component. They are uploaded as marksheets and
 * processed through question_vertical_analysis alongside theory marks. The combined CIA
 * map already reflects all assessment marks (theory + lab) per CO via per-question averages.
 *
 * Final formula (NBA / spreadsheet standard):
 *   CIE_CO  = combinedCIAMap[co]   ← already includes lab questions for IPCC/LAB courses
 *   Direct  = (cie_w/100) × CIE + (see_w/100) × SEE
 *   Final   = Direct + (ces_w/100) × CES         ← flat, not two-level
 *   (if no CES: Final = Direct / (cie_w+see_w) × 100  — normalized to full scale)
 *
 *   Defaults: cie=70, see=20, ces=10  (70:20:10 split, sums to 100%)
 *
 * Attainment levels (target = 60%):
 *   final >= 80 → Level 3
 *   final >= 60 → Level 2
 *   final <  60 → Level 1
 *
 * Lab CIA attainment is stored for display purposes only (lab_cia_attainment column).
 */

class FinalCOAttainmentService {
  async _getConfig(courseId) {
    let res = await pool.query(
      'SELECT * FROM course_attainment_config WHERE course_id = $1',
      [courseId]
    );
    if (res.rows.length === 0) {
      // Insert with NBA-standard defaults: CIE=70%, SEE=20%, CES=10%
      await pool.query(`
        INSERT INTO course_attainment_config
          (course_id, cie_weightage, see_weightage, ces_weightage, direct_weightage, target_attainment)
        VALUES ($1, 70, 20, 10, 90, 60)
        ON CONFLICT (course_id) DO NOTHING
      `, [courseId]);
      res = await pool.query(
        'SELECT * FROM course_attainment_config WHERE course_id = $1',
        [courseId]
      );
    }
    return res.rows[0];
  }

  async _getCourseType(courseId) {
    const res = await pool.query('SELECT course_type FROM courses WHERE id = $1', [courseId]);
    return res.rows[0]?.course_type || 'STANDALONE_THEORY';
  }

  _classifyLevel(finalPct, target) {
    if (finalPct >= 80) return 3;
    if (finalPct >= target) return 2;
    return 1;
  }

  /**
   * Run the full final CO attainment pipeline.
   * @returns {Array} array of per-CO results
   */
  async calculate(courseId) {
    console.log(`\n=== CALCULATING FINAL CO ATTAINMENT ===`);

    const [cfg, courseType] = await Promise.all([
      this._getConfig(courseId),
      this._getCourseType(courseId)
    ]);

    // Flat formula weights (must sum to 100): CIE=70, SEE=20, CES=10
    const cieW   = parseFloat(cfg.cie_weightage) / 100;  // e.g. 0.70
    const seeW   = parseFloat(cfg.see_weightage) / 100;  // e.g. 0.20
    const cesW   = parseFloat(cfg.ces_weightage) / 100;  // e.g. 0.10
    const target = parseFloat(cfg.target_attainment);

    // 1. Gather all source attainments
    //    combinedCIAMap: reads question_vertical_analysis for ALL marksheets (theory + lab).
    //    Lab marks are already folded into per-question averages, so no separate lab averaging.
    //    labMap: used ONLY for the display column; NOT used in the CIE formula.
    const [combinedCIAMap, labMap, seeMap, cesMap] = await Promise.all([
      combinedCOAttainment.getCIAAttainmentMap(courseId),
      labCOAttainmentService.getAttainmentMap(courseId),
      seeCOAttainmentService.calculate(courseId),
      cesService.getAttainmentMap(courseId)    // reads existing ces_attainment rows
    ]);

    // 2. Get all COs
    const cosRes = await pool.query(
      'SELECT id, co_number FROM course_outcomes WHERE course_id = $1 ORDER BY co_number',
      [courseId]
    );

    const output = [];

    for (const co of cosRes.rows) {
      const n = co.co_number;

      // combinedCIAMap already integrates theory + lab question-level attainments.
      // Use it directly as CIE regardless of course type — lab marks were uploaded
      // as marksheets and processed in question_vertical_analysis alongside theory.
      const cie     = combinedCIAMap[n] || 0;
      const labCIA  = labMap[n]         || 0;   // for display only
      const see     = seeMap[n]         || 0;
      const cesInfo = cesMap[n]         || { ces_pct: 0, has_data: false };

      // Flat formula: Direct = cieW*CIE + seeW*SEE  (contributes cieW+seeW of the total scale)
      const direct = cieW * cie + seeW * see;

      // Final = Direct + cesW*CES  (flat sum, all weights sum to 100%)
      // If no CES data: normalize direct to full 100% scale (divide by cieW+seeW)
      let final;
      if (cesInfo.has_data) {
        final = direct + cesW * cesInfo.ces_pct;  // e.g. 0.7*CIE + 0.2*SEE + 0.1*CES
      } else {
        const directWeightSum = cieW + seeW;  // e.g. 0.9
        final = directWeightSum > 0 ? direct / directWeightSum : 0;
      }

      const level     = this._classifyLevel(final, target);
      const isAttained = final >= target;

      console.log(`  CO${n}: CIE=${cie.toFixed(2)}, SEE=${see.toFixed(2)}, CES=${cesInfo.ces_pct.toFixed(2)}, Direct=${direct.toFixed(2)}, Final=${final.toFixed(2)}, L${level}`);

      output.push({
        co_id: co.id,
        co_number: n,
        theory_cia: cie,    // combined CIA (theory+lab baked in) stored in both columns for display
        lab_cia: labCIA,    // standalone lab attainment for the display column only
        cie,
        see,
        ces_pct: cesInfo.ces_pct,
        direct,
        final,
        level,
        isAttained
      });
    }

    // 3. Persist
    for (const r of output) {
      await pool.query(`
        INSERT INTO co_attainment_final
          (course_id, co_id, co_number,
           theory_cia_attainment, lab_cia_attainment, cie_attainment,
           see_attainment, ces_attainment, direct_attainment, final_attainment,
           attainment_level, is_attained)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (course_id, co_id) DO UPDATE SET
          theory_cia_attainment = EXCLUDED.theory_cia_attainment,
          lab_cia_attainment    = EXCLUDED.lab_cia_attainment,
          cie_attainment        = EXCLUDED.cie_attainment,
          see_attainment        = EXCLUDED.see_attainment,
          ces_attainment        = EXCLUDED.ces_attainment,
          direct_attainment     = EXCLUDED.direct_attainment,
          final_attainment      = EXCLUDED.final_attainment,
          attainment_level      = EXCLUDED.attainment_level,
          is_attained           = EXCLUDED.is_attained,
          calculated_at         = CURRENT_TIMESTAMP
      `, [
        courseId, r.co_id, r.co_number,
        r.theory_cia, r.lab_cia, r.cie,
        r.see, r.ces_pct, r.direct, r.final,
        r.level, r.isAttained
      ]);
    }

    console.log(`✅ Final CO attainment stored for ${output.length} COs`);
    return output;
  }

  /** Return final CO attainment map: { co_number: final_attainment_pct } */
  async getAttainmentMap(courseId) {
    const res = await pool.query(
      'SELECT co_number, final_attainment FROM co_attainment_final WHERE course_id = $1',
      [courseId]
    );
    const map = {};
    res.rows.forEach(r => { map[r.co_number] = parseFloat(r.final_attainment || 0); });
    return map;
  }

  /** Full attainment detail for display. */
  async getDetail(courseId) {
    const res = await pool.query(`
      SELECT
        caf.*,
        co.description,
        co.bloom_level,
        co.co_number AS display_co_number
      FROM co_attainment_final caf
      JOIN course_outcomes co ON caf.co_id = co.id
      WHERE caf.course_id = $1
      ORDER BY caf.co_number
    `, [courseId]);
    return res.rows;
  }
}

export default new FinalCOAttainmentService();
