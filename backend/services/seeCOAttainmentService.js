import pool from '../config/db.js';

/**
 * SEE CO ATTAINMENT SERVICE
 *
 * Priority order for SEE attainment calculation:
 *
 * 1. Grade-based (preferred, NBA-standard):
 *    If see_marks has grade data → use VTU letter-grade formula:
 *    att = (S_count×10 + A_count×9 + B_count×8 + C_count×7 + D_count×5 + E_count×4)
 *          / (10 × total_students) × 100
 *    Applied uniformly to all COs (grade sheet is per-course, not per-CO).
 *
 * 2. Manual override (fallback):
 *    If see_attainment_override is set in course_attainment_config,
 *    use that value for all COs (allows teacher to enter externally computed value).
 *
 * 3. Question-wise (detailed):
 *    If see_question_co_mapping + see_question_scores exists, compute per-CO
 *    using the same NBA B/A formula as CIA.
 *
 * 4. Overall marks fallback:
 *    If only see_marks (no grades, no question mapping) → sum-based NBA formula
 *    on total marks.
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
   * VTU grade → weight mapping (NBA formula)
   * Only these specific codes contribute to the numerator.
   * All other grades (A+, B+, O, P, F) count toward total only.
   */
  _gradeWeight(grade) {
    const weights = { S: 10, A: 9, B: 8, C: 7, D: 5, E: 4 };
    return weights[grade] || 0;
  }

  /**
   * Calculate SEE CO attainment for a course.
   * Returns a map: { co_number: attainment_percent }
   *
   * Priority:
   *  1. Grade-based — if any see_marks rows for this course have see_grade set
   *  2. Manual override — if see_attainment_override is set in config
   *  3. Question-wise — if see_question_co_mapping exists
   *  4. Overall marks fallback
   */
  async calculate(courseId) {
    console.log(`\n=== CALCULATING SEE CO ATTAINMENT ===`);

    const cosQuery = await pool.query(
      'SELECT id, co_number FROM course_outcomes WHERE course_id = $1 ORDER BY co_number',
      [courseId]
    );
    const results = {};

    // ── Priority 1: Grade-based formula ─────────────────────────────────────
    const gradeRes = await pool.query(
      `SELECT see_grade FROM see_marks WHERE course_id = $1 AND see_grade IS NOT NULL AND see_grade <> ''`,
      [courseId]
    );

    if (gradeRes.rows.length > 0) {
      // All students in this course (denominator = total students with SEE data)
      const totalRes = await pool.query(
        'SELECT COUNT(*) FROM see_marks WHERE course_id = $1',
        [courseId]
      );
      const total = parseInt(totalRes.rows[0].count);

      // Numerator: sum of grade weights for students with a known grade
      const numerator = gradeRes.rows.reduce((sum, r) => {
        return sum + this._gradeWeight(r.see_grade.trim().toUpperCase());
      }, 0);

      const gradeAtt = total > 0 ? (numerator / (10 * total)) * 100 : 0;
      console.log(`  SEE grade-based: numerator=${numerator}, total=${total}, att=${gradeAtt.toFixed(4)}%`);

      cosQuery.rows.forEach(co => { results[co.co_number] = gradeAtt; });
      return results;
    }

    // ── Priority 2: Manual override ──────────────────────────────────────────
    const cfgRes = await pool.query(
      'SELECT see_attainment_override FROM course_attainment_config WHERE course_id = $1',
      [courseId]
    );
    if (cfgRes.rows.length > 0 && cfgRes.rows[0].see_attainment_override != null) {
      const override = parseFloat(cfgRes.rows[0].see_attainment_override);
      console.log(`  SEE manual override: ${override}% (applied uniformly to all COs)`);
      cosQuery.rows.forEach(co => { results[co.co_number] = override; });
      return results;
    }

    // ── Priority 3: Question-wise calculation ────────────────────────────────
    const mappingCount = await pool.query(
      'SELECT COUNT(*) FROM see_question_co_mapping WHERE course_id = $1',
      [courseId]
    );
    const hasQuestionMapping = parseInt(mappingCount.rows[0].count) > 0;
    const thresholdPct = 60.0;

    if (hasQuestionMapping) {
      const qMaps = await pool.query(
        'SELECT question_label, co_number, max_marks FROM see_question_co_mapping WHERE course_id = $1',
        [courseId]
      );

      const byco = {};
      qMaps.rows.forEach(q => {
        if (!byco[q.co_number]) byco[q.co_number] = [];
        byco[q.co_number].push(q);
      });

      for (const co of cosQuery.rows) {
        const qs = byco[co.co_number] || [];
        if (qs.length === 0) { results[co.co_number] = 0; continue; }

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
          qAttainments.push(((B / A) / parseFloat(q.max_marks)) * 100);
        }

        const coAtt = qAttainments.length > 0
          ? qAttainments.reduce((s, v) => s + v, 0) / qAttainments.length : 0;
        console.log(`  CO${co.co_number} (SEE): ${qAttainments.length} Qs, attainment=${coAtt.toFixed(2)}%`);
        results[co.co_number] = coAtt;
      }
      return results;
    }

    // ── Priority 4: Overall marks fallback ───────────────────────────────────
    console.log('  No SEE grades or question mapping — using overall SEE marks fallback');
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
    const B = marks.filter(m => m >= threshold).reduce((s, m) => s + m, 0);
    const overallAtt = A > 0 ? (B / A) / maxMarks * 100 : 0;

    console.log(`  Overall SEE attainment (fallback): B=${B}, A=${A}, max=${maxMarks}, att=${overallAtt.toFixed(2)}%`);
    cosQuery.rows.forEach(co => { results[co.co_number] = overallAtt; });
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
