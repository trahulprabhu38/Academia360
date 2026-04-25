import pool from '../config/db.js';

/**
 * Grade Calculation Service
 * Calculates final grades from CIE + SEE marks using the formula:
 * Final Marks = (CIE Total / 2) + (SEE Marks / 2) = 100 max
 * Then assigns letter grade and maps to grade points (10-point scale)
 */
class GradeCalculationService {
  /**
   * Calculate final grade for a student in a course
   * @param {UUID} studentId - Student ID
   * @param {UUID} courseId - Course ID
   * @returns {Object} Grade data
   */
  async calculateFinalGrade(studentId, courseId) {
    const client = await pool.connect();

    try {
      console.log(`\n=== CALCULATING FINAL GRADE ===`);
      console.log(`Student ID: ${studentId}, Course ID: ${courseId}`);

      // 1. Get course credits and type — both drive which calculation path to use
      const courseQuery = await client.query(
        'SELECT credits, course_type FROM courses WHERE id = $1',
        [courseId]
      );
      if (courseQuery.rows.length === 0) throw new Error('Course not found');
      const credits    = parseInt(courseQuery.rows[0].credits) || 3;
      const courseType = courseQuery.rows[0].course_type || 'STANDALONE_THEORY';
      console.log(`Course Credits: ${credits}, Type: ${courseType}`);

      // 2. Get uploaded final marks (stored in see_marks table for all course types)
      const seeQuery = await client.query(
        'SELECT see_marks_obtained, see_max_marks FROM see_marks WHERE student_id = $1 AND course_id = $2',
        [studentId, courseId]
      );
      if (seeQuery.rows.length === 0) {
        throw new Error('Final marks not found. Please upload marks first.');
      }
      const seeMarksObtained = parseFloat(seeQuery.rows[0].see_marks_obtained) || 0;
      const seeMaxMarks = parseFloat(seeQuery.rows[0].see_max_marks) || 100;
      console.log(`Uploaded marks: ${seeMarksObtained}/${seeMaxMarks}`);

      // 3. Check CIE composition for ALL courses before deciding the formula path.
      //    A 2-credit course that has CIE data (e.g. Research Methodology 21RM56)
      //    must use CIE+SEE, not the ×2 shortcut.
      const cieQuery = await client.query(
        'SELECT final_cie_total, final_cie_max FROM final_cie_composition WHERE student_id = $1 AND course_id = $2',
        [studentId, courseId]
      );
      const hasCIE = cieQuery.rows.length > 0 && parseFloat(cieQuery.rows[0].final_cie_total) > 0;

      // ×2 path applies only when the course has ≤2 credits AND no CIE composition data.
      const useLowCreditFormula = credits <= 2 && !hasCIE;
      console.log(`Path: ${useLowCreditFormula ? 'low-credit ×2' : hasCIE ? 'CIE+SEE' : 'SEE-only'}`);

      // 4. Calculate final marks
      //
      //   Low-credit (≤2cr, no CIE): Final = uploaded × 2 (teacher enters on ~50-pt scale)
      //   Any course WITH CIE: CIE/50 + SEE scaled to 50 = 100
      //   Standard (≥3cr) WITHOUT CIE: SEE/seeMax × 100
      let finalTotal, finalMax, finalPercentage;
      let cieTotalOutOf50 = 0;
      let seeTotalForStore = 0;

      if (useLowCreditFormula) {
        // Low-credit lab/activity with no CIE: marks entered on ~50-pt scale; ×2 → 100
        finalMax = 100.00;
        finalTotal = Math.min(seeMarksObtained * 2, 100);
        finalPercentage = finalTotal;
        seeTotalForStore = seeMarksObtained;
        console.log(`Low-credit ×2 path: ${seeMarksObtained} × 2 = ${finalTotal.toFixed(2)}/100`);
      } else if (!hasCIE) {
        // No CIE data yet — SEE-only fallback
        finalMax = 100.00;
        finalTotal = (seeMarksObtained / seeMaxMarks) * 100;
        finalPercentage = finalTotal;
        seeTotalForStore = (seeMarksObtained / seeMaxMarks) * 50;
        console.log(`SEE-only path: ${seeMarksObtained}/${seeMaxMarks} → ${finalTotal.toFixed(2)}/100`);
      } else {
        // CIE+SEE path (all courses with CIE data, including 2-credit courses like RM56)
        const cieTotal = parseFloat(cieQuery.rows[0].final_cie_total);
        const cieMax   = parseFloat(cieQuery.rows[0].final_cie_max);
        if (isNaN(cieTotal) || isNaN(cieMax)) throw new Error('Invalid CIE data. Please recalculate CIE marks.');
        console.log(`CIE Total: ${cieTotal}/${cieMax}`);

        cieTotalOutOf50 = cieMax === 100 ? cieTotal / 2 : cieTotal;
        seeTotalForStore = (seeMarksObtained / seeMaxMarks) * 50;
        finalTotal = cieTotalOutOf50 + seeTotalForStore;
        finalMax = 100.00;
        finalPercentage = (finalTotal / finalMax) * 100;
        console.log(`CIE+SEE path: CIE ${cieTotalOutOf50.toFixed(2)}/50 + SEE ${seeTotalForStore.toFixed(2)}/50 = ${finalTotal.toFixed(2)}/100`);
      }

      console.log(`Final: ${finalTotal.toFixed(2)}/${finalMax} (${finalPercentage.toFixed(2)}%)`);

      // 4. Assign letter grade based on percentage
      const letterGrade = this.assignLetterGrade(finalPercentage);
      console.log(`Letter Grade: ${letterGrade}`);

      // 5. Map letter grade to grade points (10-point scale)
      const gradePoints = this.getGradePoints(letterGrade);
      console.log(`Grade Points: ${gradePoints}/10`);

      // 7. Determine pass/fail status
      const isPassed = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'].includes(letterGrade);
      console.log(`Pass Status: ${isPassed ? 'PASSED' : 'FAILED'}`);

      // 8. Store in student_final_grades table
      const upsertQuery = `
        INSERT INTO student_final_grades (
          student_id, course_id,
          cie_total, cie_max,
          see_total, see_max,
          final_total, final_max, final_percentage,
          letter_grade, grade_points, credits, is_passed,
          calculated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
        ON CONFLICT (student_id, course_id)
        DO UPDATE SET
          cie_total = EXCLUDED.cie_total,
          cie_max = EXCLUDED.cie_max,
          see_total = EXCLUDED.see_total,
          see_max = EXCLUDED.see_max,
          final_total = EXCLUDED.final_total,
          final_max = EXCLUDED.final_max,
          final_percentage = EXCLUDED.final_percentage,
          letter_grade = EXCLUDED.letter_grade,
          grade_points = EXCLUDED.grade_points,
          credits = EXCLUDED.credits,
          is_passed = EXCLUDED.is_passed,
          calculated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await client.query(upsertQuery, [
        studentId,
        courseId,
        useLowCreditFormula ? 0 : cieTotalOutOf50,
        useLowCreditFormula ? null : 50.00,
        useLowCreditFormula ? seeMarksObtained : seeTotalForStore,
        useLowCreditFormula ? seeMaxMarks : 50.00,
        finalTotal,
        finalMax,
        finalPercentage,
        letterGrade,
        gradePoints,
        credits,
        isPassed
      ]);

      console.log(`✅ Final grade calculated and stored successfully`);

      return result.rows[0];

    } catch (error) {
      console.error('Error in calculateFinalGrade:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Assign letter grade based on percentage
   * Uses VTU 10-point grading scale
   * @param {Number} percentage - Final percentage (0-100)
   * @returns {String} Letter grade (A+, A, B+, B, C+, C, D, E, F)
   */
  assignLetterGrade(percentage) {
    if (percentage >= 91) return 'A+';
    if (percentage >= 81) return 'A';
    if (percentage >= 71) return 'B+';
    if (percentage >= 61) return 'B';
    if (percentage >= 51) return 'C+';
    if (percentage >= 41) return 'C';
    if (percentage >= 40) return 'D';
    if (percentage >= 35) return 'E';
    return 'F';
  }

  /**
   * Get grade points for a letter grade (10-point scale)
   * @param {String} letterGrade - Letter grade
   * @returns {Number} Grade points (0-10)
   */
  getGradePoints(letterGrade) {
    const gradeMap = {
      'A+': 10.0,
      'A': 9.0,
      'B+': 8.0,
      'B': 7.0,
      'C+': 6.0,
      'C': 5.0,
      'D': 4.0,
      'E': 0.0,
      'F': 0.0
    };

    return gradeMap[letterGrade] || 0.0;
  }

  /**
   * Recalculate grades for all students in a course
   * @param {UUID} courseId - Course ID
   * @returns {Object} Summary of calculation
   */
  async recalculateAllGrades(courseId) {
    try {
      console.log(`\n=== RECALCULATING ALL GRADES FOR COURSE ${courseId} ===`);

      // Get all students enrolled in the course who have SEE marks uploaded
      // (low-credit courses have no CIE records, so we must not require fcc join)
      const query = `
        SELECT DISTINCT
          sc.student_id,
          u.usn,
          u.name
        FROM students_courses sc
        JOIN users u ON sc.student_id = u.id
        JOIN see_marks sm ON sc.student_id = sm.student_id AND sc.course_id = sm.course_id
        WHERE sc.course_id = $1
        ORDER BY u.usn
      `;

      const studentsResult = await pool.query(query, [courseId]);
      const students = studentsResult.rows;

      console.log(`Found ${students.length} students with SEE marks`);

      const results = {
        total: students.length,
        calculated: 0,
        failed: 0,
        errors: []
      };

      for (const student of students) {
        try {
          await this.calculateFinalGrade(student.student_id, courseId);
          results.calculated++;
          console.log(`  ✓ Calculated grade for ${student.usn} (${student.name})`);
        } catch (err) {
          const errorCode = err.code || 'UNKNOWN_ERROR';
          console.error(`  ✗ Failed for ${student.usn} [${errorCode}]:`, err.message);
          results.errors.push({
            studentId: student.student_id,
            usn: student.usn,
            name: student.name,
            error: err.message,
            errorCode: errorCode
          });
          results.failed++;
        }
      }

      // If all students failed, throw an error with detailed information
      if (results.calculated === 0 && results.failed > 0) {
        const errorSummary = results.errors
          .slice(0, 3)
          .map(e => `${e.usn}: ${e.error}`)
          .join('; ');

        throw new Error(
          `Failed to calculate grades for all ${results.failed} students. ` +
          `Common errors: ${errorSummary}.`
        );
      }

      console.log(`\n✅ GRADE CALCULATION COMPLETE`);
      console.log(`   Calculated: ${results.calculated}, Failed: ${results.failed}`);

      return results;

    } catch (error) {
      console.error('Error in recalculateAllGrades:', error);
      throw error;
    }
  }

  /**
   * Get final grade for a student in a course
   * @param {UUID} studentId - Student ID
   * @param {UUID} courseId - Course ID
   * @returns {Object} Grade data or null
   */
  async getFinalGrade(studentId, courseId) {
    try {
      const query = `
        SELECT
          sfg.*,
          c.code AS course_code,
          c.name AS course_name,
          u.usn,
          u.name AS student_name
        FROM student_final_grades sfg
        JOIN courses c ON sfg.course_id = c.id
        JOIN users u ON sfg.student_id = u.id
        WHERE sfg.student_id = $1 AND sfg.course_id = $2
      `;

      const result = await pool.query(query, [studentId, courseId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('Error in getFinalGrade:', error);
      throw error;
    }
  }

  /**
   * Get all final grades for a course
   * @param {UUID} courseId - Course ID
   * @returns {Array} Array of grade data
   */
  async getCourseGrades(courseId) {
    try {
      const query = `
        SELECT
          sfg.*,
          u.usn,
          u.name AS student_name,
          u.department
        FROM student_final_grades sfg
        JOIN users u ON sfg.student_id = u.id
        WHERE sfg.course_id = $1
        ORDER BY sfg.final_percentage DESC, u.usn ASC
      `;

      const result = await pool.query(query, [courseId]);

      console.log(`Retrieved ${result.rows.length} grades for course ${courseId}`);

      return result.rows;

    } catch (error) {
      console.error('Error in getCourseGrades:', error);
      throw error;
    }
  }

  /**
   * Get grade distribution for a course
   * @param {UUID} courseId - Course ID
   * @returns {Object} Grade distribution statistics
   */
  async getGradeDistribution(courseId) {
    try {
      const query = `
        SELECT
          letter_grade,
          COUNT(*) as count,
          ROUND(AVG(final_percentage), 2) as avg_percentage
        FROM student_final_grades
        WHERE course_id = $1
        GROUP BY letter_grade
        ORDER BY
          CASE letter_grade
            WHEN 'A+' THEN 1
            WHEN 'A' THEN 2
            WHEN 'B+' THEN 3
            WHEN 'B' THEN 4
            WHEN 'C+' THEN 5
            WHEN 'C' THEN 6
            WHEN 'D' THEN 7
            WHEN 'E' THEN 8
            WHEN 'F' THEN 9
          END
      `;

      const result = await pool.query(query, [courseId]);

      // Calculate totals
      const totalStudents = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
      const passCount = result.rows
        .filter(row => !['E', 'F'].includes(row.letter_grade))
        .reduce((sum, row) => sum + parseInt(row.count), 0);

      const passPercentage = totalStudents > 0 ? (passCount / totalStudents) * 100 : 0;

      return {
        distribution: result.rows,
        totalStudents,
        passCount,
        failCount: totalStudents - passCount,
        passPercentage: Math.round(passPercentage * 100) / 100
      };

    } catch (error) {
      console.error('Error in getGradeDistribution:', error);
      throw error;
    }
  }
}

export default new GradeCalculationService();
