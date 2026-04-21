import express from 'express';
import pool from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import cgpaCalculationService from '../services/cgpaCalculationService.js';

const router = express.Router();

/**
 * Semester Subject Management Routes
 * Handles dynamic CRUD operations for semester subjects with real-time CGPA calculation
 * VTU Regulation: Each semester must have exactly 20 credits total
 */

/**
 * GET /api/semester-subjects/students/:studentId/semester/:semester
 * Get all subjects for a specific semester
 *
 * Returns: List of subjects with credits, grade points, and validation status
 * Access: Teacher/Student (own data)
 */
router.get('/students/:studentId/semester/:semester', authenticateToken, async (req, res) => {
  try {
    const { studentId, semester } = req.params;

    // Authorization
    if (req.user.role === 'student' && req.user.userId !== studentId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own subjects'
      });
    }

    const semesterNum = parseInt(semester);
    if (isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8) {
      return res.status(400).json({
        success: false,
        message: 'Semester must be between 1 and 8'
      });
    }

    // Get subjects for the semester
    const query = `
      SELECT
        ss.id,
        ss.subject_name,
        ss.subject_code,
        ss.credits,
        ss.grade_point,
        ss.letter_grade,
        ss.semester,
        ss.academic_year,
        ss.is_passed,
        ss.created_at,
        ss.updated_at
      FROM semester_subjects ss
      WHERE ss.student_id = $1 AND ss.semester = $2
      ORDER BY ss.subject_code ASC
    `;

    const result = await pool.query(query, [studentId, semesterNum]);
    const subjects = result.rows;

    // Calculate total credits
    const totalCredits = subjects.reduce((sum, sub) => sum + parseInt(sub.credits || 0), 0);
    const isFinal = totalCredits === 20;
    const canAddMore = totalCredits < 20;

    // Calculate provisional SGPA if subjects exist
    let provisionalSGPA = null;
    if (subjects.length > 0 && totalCredits > 0) {
      const totalWeightedGP = subjects.reduce((sum, sub) => {
        const gp = parseFloat(sub.grade_point) || 0;
        const credits = parseInt(sub.credits) || 0;
        return sum + (gp * credits);
      }, 0);
      provisionalSGPA = (totalWeightedGP / totalCredits).toFixed(2);
    }

    return res.status(200).json({
      success: true,
      data: {
        subjects,
        metadata: {
          totalSubjects: subjects.length,
          totalCredits,
          remainingCredits: 20 - totalCredits,
          isFinal,
          canAddMore,
          provisionalSGPA,
          status: isFinal ? 'FINAL' : 'PROVISIONAL'
        }
      }
    });

  } catch (error) {
    console.error('Error getting semester subjects:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to get semester subjects'
    });
  }
});

/**
 * POST /api/semester-subjects/students/:studentId/semester/:semester
 * Add a new subject to a semester
 *
 * Body: {
 *   subject_name: "Data Structures",
 *   subject_code: "CS301",
 *   credits: 4,
 *   grade_point: 9.5,
 *   letter_grade: "S",
 *   academic_year: 2024
 * }
 *
 * Validation: Total credits must not exceed 20
 * Access: Teacher
 */
router.post('/students/:studentId/semester/:semester', authenticateToken, authorizeRoles('teacher', 'admin'), async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { studentId, semester } = req.params;
    const { subject_name, subject_code, credits, grade_point, letter_grade, academic_year } = req.body;

    // Validate input
    if (!subject_name || !subject_code || !credits) {
      return res.status(400).json({
        success: false,
        message: 'subject_name, subject_code, and credits are required'
      });
    }

    const semesterNum = parseInt(semester);
    if (isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8) {
      return res.status(400).json({
        success: false,
        message: 'Semester must be between 1 and 8'
      });
    }

    const creditsNum = parseInt(credits);
    if (isNaN(creditsNum) || creditsNum < 1 || creditsNum > 4) {
      return res.status(400).json({
        success: false,
        message: 'Credits must be between 1 and 4'
      });
    }

    // Check current total credits
    const creditCheck = await client.query(
      'SELECT COALESCE(SUM(credits), 0) as total_credits FROM semester_subjects WHERE student_id = $1 AND semester = $2',
      [studentId, semesterNum]
    );

    const currentTotal = parseInt(creditCheck.rows[0].total_credits);
    const newTotal = currentTotal + creditsNum;

    if (newTotal > 20) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot add subject. Total credits would be ${newTotal}, exceeding the limit of 20. Current total: ${currentTotal}, trying to add: ${creditsNum}.`
      });
    }

    // Validate grade point if provided
    let gradePointValue = null;
    let letterGradeValue = null;
    let isPassed = null;

    if (grade_point !== undefined && grade_point !== null) {
      gradePointValue = parseFloat(grade_point);
      if (isNaN(gradePointValue) || gradePointValue < 0 || gradePointValue > 10) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Grade point must be between 0 and 10'
        });
      }
      letterGradeValue = letter_grade || null;
      isPassed = gradePointValue >= 4; // VTU passing grade is 4
    }

    // Insert subject
    const insertQuery = `
      INSERT INTO semester_subjects
      (student_id, semester, subject_name, subject_code, credits, grade_point, letter_grade, academic_year, is_passed)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await client.query(insertQuery, [
      studentId,
      semesterNum,
      subject_name,
      subject_code,
      creditsNum,
      gradePointValue,
      letterGradeValue,
      academic_year || new Date().getFullYear(),
      isPassed
    ]);

    const newSubject = result.rows[0];

    // Recalculate SGPA whenever grades are present (not just at 20 credits)
    if (gradePointValue !== null) {
      try {
        await cgpaCalculationService.calculateSGPAFromSubjects(studentId, semesterNum);
        await cgpaCalculationService.calculateCGPA(studentId);
        console.log(`✅ SGPA/CGPA recalculated for semester ${semesterNum}`);
      } catch (sgpaError) {
        console.error('Failed to calculate SGPA from subjects:', sgpaError.message);
      }
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Subject added successfully',
      data: {
        subject: newSubject,
        totalCredits: newTotal,
        remainingCredits: 20 - newTotal,
        isFinal: newTotal === 20,
        status: newTotal === 20 ? 'FINAL' : 'PROVISIONAL'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding subject:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to add subject'
    });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/semester-subjects/:subjectId
 * Update an existing subject
 *
 * Body: Same as POST (any fields can be updated)
 *
 * Validation: Total credits must not exceed 20 after update
 * Access: Teacher
 */
router.put('/:subjectId', authenticateToken, authorizeRoles('teacher', 'admin'), async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { subjectId } = req.params;
    const { subject_name, subject_code, credits, grade_point, letter_grade } = req.body;

    // Get current subject
    const current = await client.query('SELECT * FROM semester_subjects WHERE id = $1', [subjectId]);
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }

    const currentSubject = current.rows[0];
    const studentId = currentSubject.student_id;
    const semester = currentSubject.semester;

    // If credits are being updated, validate
    let newCredits = currentSubject.credits;
    if (credits !== undefined) {
      newCredits = parseInt(credits);
      if (isNaN(newCredits) || newCredits < 1 || newCredits > 4) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Credits must be between 1 and 4'
        });
      }

      // Check if new total exceeds 20
      const creditCheck = await client.query(
        'SELECT COALESCE(SUM(credits), 0) as total_credits FROM semester_subjects WHERE student_id = $1 AND semester = $2 AND id != $3',
        [studentId, semester, subjectId]
      );

      const otherCredits = parseInt(creditCheck.rows[0].total_credits);
      const newTotal = otherCredits + newCredits;

      if (newTotal > 20) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Cannot update credits. Total would be ${newTotal}, exceeding limit of 20.`
        });
      }
    }

    // Validate and process grade point
    let gradePointValue = currentSubject.grade_point;
    let letterGradeValue = currentSubject.letter_grade;
    let isPassed = currentSubject.is_passed;

    if (grade_point !== undefined) {
      if (grade_point === null) {
        gradePointValue = null;
        letterGradeValue = null;
        isPassed = null;
      } else {
        gradePointValue = parseFloat(grade_point);
        if (isNaN(gradePointValue) || gradePointValue < 0 || gradePointValue > 10) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: 'Grade point must be between 0 and 10'
          });
        }
        letterGradeValue = letter_grade || currentSubject.letter_grade;
        isPassed = gradePointValue >= 4;
      }
    }

    // Update subject
    const updateQuery = `
      UPDATE semester_subjects
      SET
        subject_name = COALESCE($1, subject_name),
        subject_code = COALESCE($2, subject_code),
        credits = COALESCE($3, credits),
        grade_point = $4,
        letter_grade = $5,
        is_passed = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `;

    const result = await client.query(updateQuery, [
      subject_name,
      subject_code,
      newCredits !== currentSubject.credits ? newCredits : null,
      gradePointValue,
      letterGradeValue,
      isPassed,
      subjectId
    ]);

    const updatedSubject = result.rows[0];

    // Get new total credits
    const totalCheck = await client.query(
      'SELECT COALESCE(SUM(credits), 0) as total_credits FROM semester_subjects WHERE student_id = $1 AND semester = $2',
      [studentId, semester]
    );
    const totalCredits = parseInt(totalCheck.rows[0].total_credits);

    // Recalculate SGPA/CGPA whenever a grade is present
    if (gradePointValue !== null) {
      try {
        await cgpaCalculationService.calculateSGPAFromSubjects(studentId, semester);
        await cgpaCalculationService.calculateCGPA(studentId);
        console.log(`✅ SGPA/CGPA recalculated for semester ${semester}`);
      } catch (sgpaError) {
        console.error('Failed to recalculate SGPA from subjects:', sgpaError.message);
      }
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Subject updated successfully',
      data: {
        subject: updatedSubject,
        totalCredits,
        remainingCredits: 20 - totalCredits,
        isFinal: totalCredits === 20,
        status: totalCredits === 20 ? 'FINAL' : 'PROVISIONAL'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating subject:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update subject'
    });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/semester-subjects/:subjectId
 * Delete a subject from a semester
 *
 * Access: Teacher
 */
router.delete('/:subjectId', authenticateToken, authorizeRoles('teacher', 'admin'), async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { subjectId } = req.params;

    // Get subject details before deletion
    const subjectQuery = await client.query('SELECT * FROM semester_subjects WHERE id = $1', [subjectId]);

    if (subjectQuery.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }

    const subject = subjectQuery.rows[0];
    const studentId = subject.student_id;
    const semester = subject.semester;

    // Delete subject
    await client.query('DELETE FROM semester_subjects WHERE id = $1', [subjectId]);

    // Get remaining credits
    const creditCheck = await client.query(
      'SELECT COALESCE(SUM(credits), 0) as total_credits FROM semester_subjects WHERE student_id = $1 AND semester = $2',
      [studentId, semester]
    );
    const remainingCredits = parseInt(creditCheck.rows[0].total_credits);

    // If credits dropped below 20, delete semester_results entry if exists
    if (remainingCredits < 20) {
      await client.query(
        'DELETE FROM semester_results WHERE student_id = $1 AND semester = $2',
        [studentId, semester]
      );
      console.log(`🔄 Semester results cleared for semester ${semester} (credits < 20)`);
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Subject deleted successfully',
      data: {
        deletedSubject: subject,
        totalCredits: remainingCredits,
        remainingCredits: 20 - remainingCredits,
        isFinal: remainingCredits === 20,
        status: remainingCredits === 20 ? 'FINAL' : 'PROVISIONAL'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting subject:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete subject'
    });
  } finally {
    client.release();
  }
});

export default router;
