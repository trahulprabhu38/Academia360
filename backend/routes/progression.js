import express from 'express';
import semesterProgressionService from '../services/semesterProgressionService.js';
import cgpaCalculationService from '../services/cgpaCalculationService.js';
import gradeCalculationService from '../services/gradeCalculationService.js';
import detailedCalculationsService from '../services/detailedCalculations.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Semester Progression Routes
 * Handles student progression tracking and visualization data
 */

/**
 * GET /api/progression/students/:studentId
 * Get complete semester progression for a student
 * Returns structured data for visualization (8-semester timeline)
 *
 * Access: Teacher/Student (own data)
 */
router.get('/students/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Authorization: Students can only view their own progression
    if (req.user.role === 'student' && req.user.userId !== studentId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own progression data'
      });
    }

    const progression = await semesterProgressionService.getStudentProgression(studentId);

    return res.status(200).json({
      success: true,
      data: progression
    });

  } catch (error) {
    console.error('Error in GET /students/:studentId:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve student progression'
    });
  }
});

/**
 * GET /api/progression/students/:studentId/semester/:semester
 * Get detailed information for a specific semester
 *
 * Access: Teacher/Student (own data)
 */
router.get('/students/:studentId/semester/:semester', authenticateToken, async (req, res) => {
  try {
    const { studentId, semester } = req.params;

    // Authorization: Students can only view their own data
    if (req.user.role === 'student' && req.user.userId !== studentId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own semester details'
      });
    }

    const semesterNum = parseInt(semester);
    if (isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8) {
      return res.status(400).json({
        success: false,
        message: 'Semester must be between 1 and 8'
      });
    }

    const details = await semesterProgressionService.getSemesterDetails(studentId, semesterNum);

    if (!details) {
      return res.status(404).json({
        success: false,
        message: `No data found for semester ${semesterNum}`
      });
    }

    return res.status(200).json({
      success: true,
      data: details
    });

  } catch (error) {
    console.error('Error in GET /students/:studentId/semester/:semester:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve semester details'
    });
  }
});

/**
 * GET /api/progression/courses/:courseId/students
 * Get progression summary for all students in a course
 * Used by teachers to see class performance
 *
 * Access: Teacher
 */
router.get('/courses/:courseId/students', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const progression = await semesterProgressionService.getCourseStudentsProgression(courseId);

    return res.status(200).json({
      success: true,
      data: progression
    });

  } catch (error) {
    console.error('Error in GET /courses/:courseId/students:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve course students progression'
    });
  }
});

/**
 * GET /api/progression/semester/:semester/statistics
 * Get semester-wise statistics for a department
 *
 * Query params:
 *   - department (required): Department name
 *
 * Access: Teacher
 */
router.get('/semester/:semester/statistics', authenticateToken, async (req, res) => {
  try {
    const { semester } = req.params;
    const { department } = req.query;

    if (!department) {
      return res.status(400).json({
        success: false,
        message: 'department query parameter is required'
      });
    }

    const semesterNum = parseInt(semester);
    if (isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8) {
      return res.status(400).json({
        success: false,
        message: 'Semester must be between 1 and 8'
      });
    }

    const statistics = await semesterProgressionService.getSemesterStatistics(semesterNum, department);

    return res.status(200).json({
      success: true,
      data: statistics
    });

  } catch (error) {
    console.error('Error in GET /semester/:semester/statistics:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to get semester statistics'
    });
  }
});

/**
 * GET /api/progression/students/:studentId/export
 * Export student progression to PDF/JSON
 *
 * Query params:
 *   - format (optional, default 'json'): 'json' or 'pdf'
 *
 * Access: Teacher/Student (own data)
 */
router.get('/students/:studentId/export', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { format = 'json' } = req.query;

    // Authorization: Students can only export their own data
    if (req.user.role === 'student' && req.user.userId !== studentId) {
      return res.status(403).json({
        success: false,
        message: 'You can only export your own progression data'
      });
    }

    const progression = await semesterProgressionService.getStudentProgression(studentId);

    if (format === 'pdf') {
      // TODO: Implement PDF generation using a library like pdfkit or puppeteer
      return res.status(501).json({
        success: false,
        message: 'PDF export not yet implemented. Use format=json for now.'
      });
    }

    // JSON export
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="progression_${progression.student.usn}.json"`);

    return res.status(200).json({
      success: true,
      exportedAt: new Date().toISOString(),
      data: progression
    });

  } catch (error) {
    console.error('Error in GET /students/:studentId/export:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to export progression data'
    });
  }
});

/**
 * GET /api/progression/students/:studentId/summary
 * Get a quick summary of student progression
 * Returns only key metrics without full course details
 *
 * Access: Teacher/Student (own data)
 */
router.get('/students/:studentId/summary', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Authorization: Students can only view their own summary
    if (req.user.role === 'student' && req.user.userId !== studentId) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own progression summary'
      });
    }

    const progression = await semesterProgressionService.getStudentProgression(studentId);

    // Build summary (no course details, just semester-level metrics)
    const summary = {
      student: progression.student,
      currentSemester: progression.currentSemester,
      cgpa: progression.cgpa,
      totalCredits: progression.totalCredits,
      semestersCompleted: progression.semestersCompleted,
      totalCoursesCompleted: progression.totalCoursesCompleted,
      totalCoursesFailed: progression.totalCoursesFailed,
      semesters: progression.semesters.map(sem => ({
        semester: sem.semester,
        year: sem.year,
        sgpa: sem.sgpa,
        credits: sem.credits,
        creditsEarned: sem.creditsEarned,
        status: sem.status,
        coursesRegistered: sem.coursesRegistered,
        coursesPassed: sem.coursesPassed,
        coursesFailed: sem.coursesFailed
      })),
      cgpaHistory: progression.cgpaHistory
    };

    return res.status(200).json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('Error in GET /students/:studentId/summary:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve progression summary'
    });
  }
});

/**
 * GET /api/progression/department/:department/overview
 * Get department-wide progression overview
 * Shows statistics across all semesters
 *
 * Access: Teacher
 */
router.get('/department/:department/overview', authenticateToken, async (req, res) => {
  try {
    const { department } = req.params;

    const pool = (await import('../config/db.js')).default;

    // Get overall department statistics
    const query = `
      SELECT
        COUNT(DISTINCT sc.student_id) as total_students,
        AVG(sc.cgpa) as avg_cgpa,
        MAX(sc.cgpa) as max_cgpa,
        MIN(sc.cgpa) as min_cgpa,
        AVG(sc.current_semester) as avg_current_semester
      FROM student_cgpa sc
      JOIN users u ON sc.student_id = u.id
      WHERE u.department = $1
    `;

    const result = await pool.query(query, [department]);
    const stats = result.rows[0];

    // Get semester-wise breakdown
    const semesterBreakdown = [];
    for (let sem = 1; sem <= 8; sem++) {
      const semStats = await semesterProgressionService.getSemesterStatistics(sem, department);
      if (semStats.totalStudents > 0) {
        semesterBreakdown.push(semStats);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        department,
        overview: {
          totalStudents: parseInt(stats.total_students) || 0,
          avgCGPA: parseFloat(stats.avg_cgpa) || 0,
          maxCGPA: parseFloat(stats.max_cgpa) || 0,
          minCGPA: parseFloat(stats.min_cgpa) || 0,
          avgCurrentSemester: parseFloat(stats.avg_current_semester) || 0
        },
        semesterBreakdown
      }
    });

  } catch (error) {
    console.error('Error in GET /department/:department/overview:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to get department overview'
    });
  }
});

/**
 * POST /api/progression/students/:studentId/recalculate
 * Run the FULL pipeline for a student:
 *   1. CIE composition → final_cie_composition (per course)
 *   2. Final grades    → student_final_grades  (per course)
 *   3. SGPA            → semester_results       (per semester)
 *   4. CGPA            → student_cgpa
 * Access: Teacher
 */
router.post('/students/:studentId/recalculate', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const pool = (await import('../config/db.js')).default;

    // Get all courses the student is enrolled in
    const enrolledCoursesQuery = await pool.query(`
      SELECT DISTINCT sc.course_id, c.semester, c.year
      FROM students_courses sc
      JOIN courses c ON sc.course_id = c.id
      WHERE sc.student_id = $1
      ORDER BY c.semester ASC, c.year ASC
    `, [studentId]);

    const enrolledCourses = enrolledCoursesQuery.rows;
    const results = {
      cieComposition: { done: [], failed: [] },
      grades: { done: [], failed: [] },
      sgpa: { done: [], failed: [] },
    };

    // Step 1 & 2: per course — CIE composition then final grade
    for (const row of enrolledCourses) {
      const { course_id: courseId, semester, year } = row;

      // 1. Recalculate CIE composition for this course (all students)
      try {
        await detailedCalculationsService.calculateFinalCIEComposition(courseId);
        results.cieComposition.done.push(`Course ${courseId} Sem ${semester}`);
      } catch (err) {
        results.cieComposition.failed.push(`Sem ${semester}: ${err.message}`);
      }

      // 2. Calculate this student's final grade for this course
      try {
        await gradeCalculationService.calculateFinalGrade(studentId, courseId);
        results.grades.done.push(`Sem ${semester}`);
      } catch (err) {
        // Grade calc fails silently when SEE marks aren't uploaded yet — that's fine
        results.grades.failed.push(`Sem ${semester}: ${err.message}`);
      }
    }

    // Step 3a: SGPA from students_courses (enrolled courses with final grades)
    const semesterGroups = {};
    for (const row of enrolledCourses) {
      const key = `${row.semester}_${row.year}`;
      semesterGroups[key] = { semester: row.semester, year: row.year };
    }
    for (const { semester, year } of Object.values(semesterGroups)) {
      try {
        await cgpaCalculationService.calculateSGPA(studentId, semester, year);
        results.sgpa.done.push(`Semester ${semester} (${year}) [courses]`);
      } catch (err) {
        results.sgpa.failed.push(`Semester ${semester} [courses]: ${err.message}`);
      }
    }

    // Step 3b: SGPA from semester_subjects (manually entered grades)
    const subjectSemQuery = await pool.query(`
      SELECT DISTINCT semester FROM semester_subjects WHERE student_id = $1
    `, [studentId]);
    for (const { semester } of subjectSemQuery.rows) {
      // Only calculate if not already calculated from courses
      const alreadyDone = results.sgpa.done.some(d => d.startsWith(`Semester ${semester} `));
      if (!alreadyDone) {
        try {
          await cgpaCalculationService.calculateSGPAFromSubjects(studentId, semester);
          results.sgpa.done.push(`Semester ${semester} [subjects]`);
        } catch (err) {
          results.sgpa.failed.push(`Semester ${semester} [subjects]: ${err.message}`);
        }
      }
    }

    // Step 4: CGPA
    try {
      await cgpaCalculationService.calculateCGPA(studentId);
    } catch (err) {
      console.error('CGPA calculation failed:', err.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Full pipeline recalculated',
      data: results
    });

  } catch (error) {
    console.error('Error in recalculate:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
