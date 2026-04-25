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

// Grade/letter helpers used by the direct low-credit fix path
function _assignGrade(pct) {
  if (pct >= 91) return 'A+';
  if (pct >= 81) return 'A';
  if (pct >= 71) return 'B+';
  if (pct >= 61) return 'B';
  if (pct >= 51) return 'C+';
  if (pct >= 41) return 'C';
  if (pct >= 40) return 'D';
  if (pct >= 35) return 'E';
  return 'F';
}
const _GP_MAP = { 'A+': 10, 'A': 9, 'B+': 8, 'B': 7, 'C+': 6, 'C': 5, 'D': 4, 'E': 0, 'F': 0 };

/**
 * POST /api/progression/students/:studentId/recalculate
 * Recalculates grades → SGPA → CGPA for a student.
 *
 * For low-credit courses (≤2 cr) the ×2 formula is applied directly from
 * see_marks so the result is correct regardless of what CIE composition data
 * exists.  The slow calculateFinalCIEComposition step is skipped here — it
 * only needs to run when CIE attainment reports are regenerated.
 *
 * Access: Teacher
 */
router.post('/students/:studentId/recalculate', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const pool = (await import('../config/db.js')).default;

    // Fetch all enrolled courses with their credits
    const enrolledCoursesQuery = await pool.query(`
      SELECT DISTINCT sc.course_id, c.semester, c.year,
                      COALESCE(c.credits, 3) AS credits
      FROM students_courses sc
      JOIN courses c ON sc.course_id = c.id
      WHERE sc.student_id = $1
      ORDER BY c.semester ASC, c.year ASC
    `, [studentId]);

    const enrolledCourses = enrolledCoursesQuery.rows;
    const results = {
      grades:    { done: [], failed: [] },
      directFix: { done: [], failed: [] },
      sgpa:      { done: [], failed: [] },
    };

    for (const row of enrolledCourses) {
      const { course_id: courseId, semester } = row;
      const credits = parseInt(row.credits) || 3;

      // Determine formula path: ×2 only for ≤2-credit courses with NO CIE data.
      // Courses like RM56 (2cr WITH CIE) must use the CIE+SEE path.
      let useLowCreditX2 = false;
      if (credits <= 2) {
        const cieCheck = await pool.query(
          'SELECT 1 FROM final_cie_composition WHERE student_id=$1 AND course_id=$2 AND final_cie_total > 0 LIMIT 1',
          [studentId, courseId]
        );
        useLowCreditX2 = cieCheck.rows.length === 0;
      }

      if (useLowCreditX2) {
        // ── Low-credit lab/activity (≤2 cr, no CIE): apply ×2 from see_marks ──
        try {
          const seeRes = await pool.query(
            'SELECT see_marks_obtained FROM see_marks WHERE student_id = $1 AND course_id = $2',
            [studentId, courseId]
          );
          if (seeRes.rows.length === 0) {
            results.grades.failed.push(`Sem ${semester} (${credits}cr): no SEE marks uploaded yet`);
            continue;
          }
          const raw      = parseFloat(seeRes.rows[0].see_marks_obtained);
          const finalPct = Math.min(raw * 2, 100);
          const grade    = _assignGrade(finalPct);
          const gp       = _GP_MAP[grade] ?? 0;
          const passed   = !['E', 'F'].includes(grade);

          await pool.query(`
            INSERT INTO student_final_grades
              (student_id, course_id,
               cie_total, cie_max, see_total, see_max,
               final_total, final_max, final_percentage,
               letter_grade, grade_points, credits, is_passed, calculated_at)
            VALUES ($1,$2, NULL,NULL, $3,100, $4,100,$5, $6,$7,$8,$9, CURRENT_TIMESTAMP)
            ON CONFLICT (student_id, course_id) DO UPDATE SET
              cie_total=NULL, cie_max=NULL,
              see_total=EXCLUDED.see_total, see_max=EXCLUDED.see_max,
              final_total=EXCLUDED.final_total, final_max=EXCLUDED.final_max,
              final_percentage=EXCLUDED.final_percentage,
              letter_grade=EXCLUDED.letter_grade, grade_points=EXCLUDED.grade_points,
              credits=EXCLUDED.credits, is_passed=EXCLUDED.is_passed,
              calculated_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
          `, [studentId, courseId, raw, finalPct, finalPct, grade, gp, credits, passed]);

          results.grades.done.push(`Sem ${semester} (${credits}cr): ${raw}×2=${finalPct}% → ${grade}`);
        } catch (err) {
          results.grades.failed.push(`Sem ${semester} (${credits}cr): ${err.message}`);
        }
      } else {
        // ── Standard course or low-credit WITH CIE: use grade calculation service ──
        try {
          await gradeCalculationService.calculateFinalGrade(studentId, courseId);
          results.grades.done.push(`Sem ${semester} (${credits}cr)`);
        } catch (err) {
          results.grades.failed.push(`Sem ${semester} (${credits}cr): ${err.message}`);
        }
      }
    }

    // ── Step 3a: SGPA from enrolled courses (no year split) ─────────────────
    const semesterSet = new Set(enrolledCourses.map(r => parseInt(r.semester)));
    for (const semester of semesterSet) {
      try {
        await cgpaCalculationService.calculateSGPA(studentId, semester, null);
        results.sgpa.done.push(`Semester ${semester} [courses]`);
      } catch (err) {
        results.sgpa.failed.push(`Semester ${semester} [courses]: ${err.message}`);
      }
    }

    // ── Step 3b: SGPA from manually-entered semester_subjects ───────────────
    const subjectSemQuery = await pool.query(
      'SELECT DISTINCT semester FROM semester_subjects WHERE student_id = $1',
      [studentId]
    );
    for (const { semester } of subjectSemQuery.rows) {
      if (results.sgpa.done.some(d => d.startsWith(`Semester ${semester} `))) continue;
      try {
        await cgpaCalculationService.calculateSGPAFromSubjects(studentId, semester);
        results.sgpa.done.push(`Semester ${semester} [subjects]`);
      } catch (err) {
        results.sgpa.failed.push(`Semester ${semester} [subjects]: ${err.message}`);
      }
    }

    // ── Step 4: CGPA ────────────────────────────────────────────────────────
    try {
      await cgpaCalculationService.calculateCGPA(studentId);
    } catch (err) {
      console.error('CGPA calculation failed:', err.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Recalculation complete',
      data: results
    });

  } catch (error) {
    console.error('Error in recalculate:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
