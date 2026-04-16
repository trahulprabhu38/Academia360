import pool from '../config/db.js';
import cesService from './cesService.js';

/**
 * STUDENT ATTAINMENT SERVICE
 *
 * Computes per-student CO / PO / PSO attainment from raw marksheet data.
 *
 * Individual CO attainment formula (per assessment):
 *   student_co_pct = sum(student_marks_on_CO_questions) /
 *                    sum(max_marks_for_CO_questions) × 100
 *
 * Then the same weighting as the batch pipeline:
 *   CIE   = avg(theory_cia, lab_cia)  [IPCC] or theory/lab alone
 *   Direct = cie_weight × CIE + see_weight × SEE
 *   Final  = direct_weight × Direct + ces_weight × CES
 */
class StudentAttainmentService {
  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * For a single marksheet (dynamic table), return per-student per-CO
   * aggregated marks:  { usn: { co_number: { marks, max } } }
   */
  async _getStudentCoMarksForMarksheet(marksheetId, tableName) {
    // CO mappings for this marksheet
    const mappingsRes = await pool.query(`
      SELECT question_column, co_number, max_marks
      FROM question_co_mappings
      WHERE marksheet_id = $1 AND max_marks > 0
    `, [marksheetId]);

    if (mappingsRes.rows.length === 0) return {};

    // Build: coNum -> [{ col, maxMarks }]
    const coQuestions = {};
    for (const row of mappingsRes.rows) {
      const n = String(row.co_number);
      if (!coQuestions[n]) coQuestions[n] = [];
      coQuestions[n].push({
        col: row.question_column,
        maxMarks: parseFloat(row.max_marks)
      });
    }

    // Read all rows from the dynamic table
    let dataRows;
    try {
      const dataRes = await pool.query(`SELECT * FROM "${tableName}"`);
      dataRows = dataRes.rows;
    } catch {
      console.warn(`  ⚠️  Could not read table ${tableName}`);
      return {};
    }

    // Result: { usn: { coNum: { marks, max } } }
    const result = {};

    for (const row of dataRows) {
      // Try common USN column names (case-insensitive)
      const usn = (
        row['USN'] || row['usn'] || row['Usn'] ||
        row['Roll No'] || row['roll no'] || row['ROLL NO'] || ''
      ).toString().trim().toUpperCase();

      if (!usn || usn === 'NAN' || usn === '') continue;
      if (!result[usn]) result[usn] = {};

      for (const [coNum, questions] of Object.entries(coQuestions)) {
        let totalMarks = 0;
        let totalMax   = 0;

        for (const q of questions) {
          // Column name matching is case-insensitive
          const colKey = Object.keys(row).find(
            k => k.toLowerCase() === q.col.toLowerCase()
          );
          if (!colKey) continue;

          const raw = row[colKey];
          if (raw === null || raw === undefined ||
              String(raw).trim() === '' ||
              String(raw).toUpperCase() === 'NAN') continue;

          const marks = parseFloat(raw);
          if (!isNaN(marks)) {
            totalMarks += marks;
            totalMax   += q.maxMarks;
          }
        }

        if (totalMax > 0) {
          // Accumulate across multiple entries (for averaging later)
          if (!result[usn][coNum]) {
            result[usn][coNum] = { marks: 0, max: 0 };
          }
          result[usn][coNum].marks += totalMarks;
          result[usn][coNum].max   += totalMax;
        }
      }
    }

    return result;
  }

  /**
   * Merge marksheet student data into a running accumulator.
   * accumulator: { usn: { coNum: [ {marks, max} ] } }
   */
  _merge(accumulator, marksheetData) {
    for (const [usn, coMap] of Object.entries(marksheetData)) {
      if (!accumulator[usn]) accumulator[usn] = {};
      for (const [coNum, vals] of Object.entries(coMap)) {
        if (!accumulator[usn][coNum]) accumulator[usn][coNum] = [];
        accumulator[usn][coNum].push(vals);
      }
    }
  }

  /** Compute pct from list of {marks, max} entries */
  _pct(entries) {
    if (!entries || entries.length === 0) return 0;
    const totalMarks = entries.reduce((s, e) => s + e.marks, 0);
    const totalMax   = entries.reduce((s, e) => s + e.max,   0);
    return totalMax > 0 ? (totalMarks / totalMax) * 100 : 0;
  }

  _classifyLevel(pct, target) {
    if (pct >= 80)     return 3;
    if (pct >= target) return 2;
    return 1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main pipeline
  // ─────────────────────────────────────────────────────────────────────────

  async calculateForCourse(courseId) {
    console.log(`\n=== CALCULATING STUDENT ATTAINMENT ===`);

    // 1. Config + course type
    let cfgRes = await pool.query(
      'SELECT * FROM course_attainment_config WHERE course_id = $1', [courseId]
    );
    const cfg = cfgRes.rows[0] || {};
    const cieW    = parseFloat(cfg.cie_weightage    || 60) / 100;
    const seeW    = parseFloat(cfg.see_weightage    || 40) / 100;
    const directW = parseFloat(cfg.direct_weightage || 90) / 100;
    const cesW    = parseFloat(cfg.ces_weightage    || 10) / 100;
    const target  = parseFloat(cfg.target_attainment || 60);

    const courseRes = await pool.query('SELECT course_type FROM courses WHERE id = $1', [courseId]);
    const courseType = courseRes.rows[0]?.course_type || 'STANDALONE_THEORY';

    // 2. All marksheets for the course
    const msRes = await pool.query(`
      SELECT id, assessment_name, table_name
      FROM marksheets
      WHERE course_id = $1
        AND processing_status = 'completed'
        AND table_name IS NOT NULL
    `, [courseId]);

    const theoryMarksheets = msRes.rows.filter(m =>
      !m.assessment_name.toLowerCase().includes('lab') &&
      !m.assessment_name.toLowerCase().includes('see')
    );
    const labMarksheets = msRes.rows.filter(m =>
      m.assessment_name.toLowerCase().includes('lab')
    );

    // 3. Accumulate per-student CIA data
    const theoryAcc = {}; // { usn: { coNum: [{marks,max}] } }
    const labAcc    = {};

    for (const ms of theoryMarksheets) {
      const d = await this._getStudentCoMarksForMarksheet(ms.id, ms.table_name);
      this._merge(theoryAcc, d);
    }
    for (const ms of labMarksheets) {
      const d = await this._getStudentCoMarksForMarksheet(ms.id, ms.table_name);
      this._merge(labAcc, d);
    }

    // 4. COs + enrolled students
    const cosRes = await pool.query(
      'SELECT id, co_number FROM course_outcomes WHERE course_id = $1 ORDER BY co_number',
      [courseId]
    );

    const usersRes = await pool.query(`
      SELECT u.id, u.usn, u.name
      FROM users u
      JOIN students_courses sc ON u.id = sc.student_id
      WHERE sc.course_id = $1
    `, [courseId]);

    // USN → user map (case-insensitive)
    const userByUsn = {};
    for (const u of usersRes.rows) {
      if (u.usn) userByUsn[u.usn.toUpperCase()] = u;
    }

    // 5. CES map (same for all students, keyed by co_number)
    const cesMap = await cesService.getAttainmentMap(courseId);

    // 5b. SEE marks — per student, same value across all COs
    const seeMarksRes = await pool.query(`
      SELECT sm.student_id, sm.see_marks_obtained, sm.see_max_marks, u.usn
      FROM see_marks sm
      JOIN users u ON sm.student_id = u.id
      WHERE sm.course_id = $1
    `, [courseId]);
    const seePctByUsn = {};
    for (const row of seeMarksRes.rows) {
      const maxM = parseFloat(row.see_max_marks) || 100;
      seePctByUsn[row.usn.toUpperCase()] =
        (parseFloat(row.see_marks_obtained) / maxM) * 100;
    }

    // 6. Collect all USNs that appear in marks data
    const allUsns = new Set([
      ...Object.keys(theoryAcc),
      ...Object.keys(labAcc)
    ]);

    const coResults = []; // will be used later for PO/PSO

    for (const usn of allUsns) {
      const user = userByUsn[usn];
      if (!user) {
        console.log(`  ⚠️  USN ${usn} not found in enrolled students — skipping`);
        continue;
      }

      for (const co of cosRes.rows) {
        const n = String(co.co_number);

        const theoryCIA = this._pct(theoryAcc[usn]?.[n]);
        const labCIA    = this._pct(labAcc[usn]?.[n]);

        // CIE
        let cie;
        const hasTheory = (theoryAcc[usn]?.[n] || []).length > 0;
        const hasLab    = (labAcc[usn]?.[n]    || []).length > 0;

        if (courseType === 'STANDALONE_LAB') {
          cie = labCIA;
        } else if (courseType === 'IPCC') {
          if (hasTheory && hasLab) cie = (theoryCIA + labCIA) / 2;
          else if (hasTheory)      cie = theoryCIA;
          else                     cie = labCIA;
        } else {
          cie = theoryCIA;
        }

        const see = seePctByUsn[usn] ?? 0;

        const cesInfo = cesMap[co.co_number] || { ces_pct: 0, has_data: false };
        const direct  = cieW * cie + seeW * see;
        // Normalize to 100% scale when no CES (same formula as finalCOAttainmentService)
        const final   = cesInfo.has_data
          ? direct + cesW * cesInfo.ces_pct
          : (cieW + seeW) > 0 ? direct / (cieW + seeW) : 0;

        const level = this._classifyLevel(final, target);

        coResults.push({
          courseId,
          studentId: user.id,
          usn,
          studentName: user.name,
          coId: co.id,
          coNumber: co.co_number,
          theoryCIA, labCIA, cie, see,
          cesPct: cesInfo.ces_pct,
          direct, final, level,
          isAttained: final >= target
        });
      }
    }

    // 7. Persist CO attainment
    let inserted = 0;
    for (const r of coResults) {
      await pool.query(`
        INSERT INTO student_co_attainment
          (course_id, student_id, co_id, co_number, usn, student_name,
           theory_cia_pct, lab_cia_pct, cie_pct, see_pct, ces_pct,
           direct_pct, final_pct, attainment_level, is_attained)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (course_id, student_id, co_id) DO UPDATE SET
          theory_cia_pct  = EXCLUDED.theory_cia_pct,
          lab_cia_pct     = EXCLUDED.lab_cia_pct,
          cie_pct         = EXCLUDED.cie_pct,
          see_pct         = EXCLUDED.see_pct,
          ces_pct         = EXCLUDED.ces_pct,
          direct_pct      = EXCLUDED.direct_pct,
          final_pct       = EXCLUDED.final_pct,
          attainment_level = EXCLUDED.attainment_level,
          is_attained     = EXCLUDED.is_attained,
          calculated_at   = CURRENT_TIMESTAMP
      `, [
        r.courseId, r.studentId, r.coId, r.coNumber,
        r.usn, r.studentName,
        r.theoryCIA, r.labCIA, r.cie, r.see, r.cesPct,
        r.direct, r.final, r.level, r.isAttained
      ]);
      inserted++;
    }
    console.log(`✅ Student CO attainment: ${inserted} rows for ${allUsns.size} students`);

    // 8. PO + PSO attainment
    await this._calculateStudentPOAttainment(courseId, coResults, target);
    await this._calculateStudentPSOAttainment(courseId, coResults, target);

    return coResults;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PO / PSO helpers
  // ─────────────────────────────────────────────────────────────────────────

  async _calculateStudentPOAttainment(courseId, coResults, target) {
    const derivedRes = await pool.query(`
      SELECT cpd.co_id, cpd.po_id, cpd.derived_level, co.co_number, po.po_number
      FROM co_po_mapping_derived cpd
      JOIN course_outcomes co ON cpd.co_id = co.id
      JOIN program_outcomes po ON cpd.po_id = po.id
      WHERE cpd.course_id = $1
    `, [courseId]);

    if (derivedRes.rows.length === 0) return;

    const posRes = await pool.query('SELECT id, po_number FROM program_outcomes ORDER BY po_number');

    // Group coResults by studentId
    const byStudent = {};
    for (const r of coResults) {
      if (!byStudent[r.studentId]) byStudent[r.studentId] = {};
      byStudent[r.studentId][r.coNumber] = r.final;
    }

    for (const [studentId, coAttMap] of Object.entries(byStudent)) {
      for (const po of posRes.rows) {
        const mappings = derivedRes.rows.filter(r => r.po_number === po.po_number);
        if (mappings.length === 0) continue;

        let num = 0, den = 0;
        for (const m of mappings) {
          const coAtt = coAttMap[m.co_number] || 0;
          const level = parseFloat(m.derived_level);
          if (level > 0) { num += coAtt * level; den += level; }
        }
        if (den === 0) continue;

        const poPct = num / den;
        const level = this._classifyLevel(poPct, target);

        await pool.query(`
          INSERT INTO student_po_attainment
            (course_id, student_id, po_id, po_number, po_attainment_pct, attainment_level)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (course_id, student_id, po_id) DO UPDATE SET
            po_attainment_pct = EXCLUDED.po_attainment_pct,
            attainment_level  = EXCLUDED.attainment_level,
            calculated_at     = CURRENT_TIMESTAMP
        `, [courseId, studentId, po.id, po.po_number, poPct, level]);
      }
    }
    console.log(`✅ Student PO attainment stored`);
  }

  async _calculateStudentPSOAttainment(courseId, coResults, target) {
    const derivedRes = await pool.query(`
      SELECT cpd.co_id, cpd.pso_id, cpd.derived_level, co.co_number, pso.pso_number
      FROM co_pso_mapping_derived cpd
      JOIN course_outcomes co ON cpd.co_id = co.id
      JOIN pso_outcomes pso ON cpd.pso_id = pso.id
      WHERE cpd.course_id = $1
    `, [courseId]);

    if (derivedRes.rows.length === 0) return;

    const psosRes = await pool.query('SELECT id, pso_number FROM pso_outcomes ORDER BY pso_number');

    const byStudent = {};
    for (const r of coResults) {
      if (!byStudent[r.studentId]) byStudent[r.studentId] = {};
      byStudent[r.studentId][r.coNumber] = r.final;
    }

    for (const [studentId, coAttMap] of Object.entries(byStudent)) {
      for (const pso of psosRes.rows) {
        const mappings = derivedRes.rows.filter(r => r.pso_number === pso.pso_number);
        if (mappings.length === 0) continue;

        let num = 0, den = 0;
        for (const m of mappings) {
          const coAtt = coAttMap[m.co_number] || 0;
          const level = parseFloat(m.derived_level);
          if (level > 0) { num += coAtt * level; den += level; }
        }
        if (den === 0) continue;

        const psoPct = num / den;
        const level  = this._classifyLevel(psoPct, target);

        await pool.query(`
          INSERT INTO student_pso_attainment
            (course_id, student_id, pso_id, pso_number, pso_attainment_pct, attainment_level)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (course_id, student_id, pso_id) DO UPDATE SET
            pso_attainment_pct = EXCLUDED.pso_attainment_pct,
            attainment_level   = EXCLUDED.attainment_level,
            calculated_at      = CURRENT_TIMESTAMP
        `, [courseId, studentId, pso.id, pso.pso_number, psoPct, level]);
      }
    }
    console.log(`✅ Student PSO attainment stored`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Read methods
  // ─────────────────────────────────────────────────────────────────────────

  /** All students × all COs (teacher view — the big grid) */
  async getAllStudentsCoAttainment(courseId) {
    const res = await pool.query(`
      SELECT
        sca.student_id,
        u.usn,
        u.name          AS student_name,
        sca.co_number,
        co.description  AS co_description,
        sca.theory_cia_pct,
        sca.lab_cia_pct,
        sca.cie_pct,
        sca.see_pct,
        sca.ces_pct,
        sca.direct_pct,
        sca.final_pct,
        sca.attainment_level,
        sca.is_attained
      FROM student_co_attainment sca
      JOIN users u          ON sca.student_id = u.id
      JOIN course_outcomes co ON sca.co_id    = co.id
      WHERE sca.course_id = $1
      ORDER BY u.usn, sca.co_number
    `, [courseId]);
    return res.rows;
  }

  /** Single student full CO breakdown */
  async getStudentCoAttainment(courseId, studentId) {
    const res = await pool.query(`
      SELECT sca.*, co.description AS co_description
      FROM student_co_attainment sca
      JOIN course_outcomes co ON sca.co_id = co.id
      WHERE sca.course_id = $1 AND sca.student_id = $2
      ORDER BY sca.co_number
    `, [courseId, studentId]);
    return res.rows;
  }

  /** Single student PO attainment */
  async getStudentPoAttainment(courseId, studentId) {
    const res = await pool.query(`
      SELECT spa.*, po.description AS po_description, po.category
      FROM student_po_attainment spa
      JOIN program_outcomes po ON spa.po_id = po.id
      WHERE spa.course_id = $1 AND spa.student_id = $2
      ORDER BY spa.po_number
    `, [courseId, studentId]);
    return res.rows;
  }

  /** Single student PSO attainment */
  async getStudentPsoAttainment(courseId, studentId) {
    const res = await pool.query(`
      SELECT spsa.*, pso.description AS pso_description
      FROM student_pso_attainment spsa
      JOIN pso_outcomes pso ON spsa.pso_id = pso.id
      WHERE spsa.course_id = $1 AND spsa.student_id = $2
      ORDER BY spsa.pso_number
    `, [courseId, studentId]);
    return res.rows;
  }

  /** Full breakdown for a single student (CO + PO + PSO) */
  async getStudentFullAttainment(courseId, studentId) {
    const [co, po, pso] = await Promise.all([
      this.getStudentCoAttainment(courseId, studentId),
      this.getStudentPoAttainment(courseId, studentId),
      this.getStudentPsoAttainment(courseId, studentId)
    ]);
    return { co, po, pso };
  }
}

export default new StudentAttainmentService();
