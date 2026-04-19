import express from 'express';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import detailedCalculationsService from '../services/detailedCalculations.js';

const router = express.Router();

/**
 * @route   POST /api/detailed-calculations/course/:courseId/calculate
 * @desc    Run complete detailed calculations for a course
 * @access  Private (Teacher)
 */
router.post('/course/:courseId/calculate', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    console.log(`API: Starting detailed calculations for course ${courseId}`);

    const result = await detailedCalculationsService.runFullCalculation(courseId);

    res.json({
      success: true,
      message: 'Detailed calculations completed successfully',
      data: result
    });
  } catch (error) {
    console.error('Error in detailed calculations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run detailed calculations',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/detailed-calculations/course/:courseId/vertical-analysis
 * @desc    Get per-question vertical analysis results
 * @access  Private
 */
router.get('/course/:courseId/vertical-analysis', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const result = await pool.query(`
      SELECT
        qva.*,
        m.assessment_name,
        m.file_name,
        fls.assessment_type
      FROM question_vertical_analysis qva
      JOIN marksheets m ON qva.marksheet_id = m.id
      JOIN file_level_summary fls ON qva.marksheet_id = fls.marksheet_id
      WHERE qva.course_id = $1
      ORDER BY fls.assessment_type, qva.co_number, qva.question_column
    `, [courseId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching vertical analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vertical analysis',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/detailed-calculations/course/:courseId/horizontal-analysis
 * @desc    Get per-student horizontal analysis results
 * @access  Private
 */
router.get('/course/:courseId/horizontal-analysis', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const result = await pool.query(`
      SELECT
        sha.*,
        m.assessment_name,
        fls.assessment_type
      FROM student_horizontal_analysis sha
      JOIN marksheets m ON sha.marksheet_id = m.id
      JOIN file_level_summary fls ON sha.marksheet_id = fls.marksheet_id
      WHERE sha.course_id = $1
      ORDER BY sha.usn, fls.assessment_type
    `, [courseId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching horizontal analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch horizontal analysis',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/detailed-calculations/course/:courseId/file-summary
 * @desc    Get file-level summary statistics
 * @access  Private
 */
router.get('/course/:courseId/file-summary', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const result = await pool.query(`
      SELECT * FROM file_level_summary
      WHERE course_id = $1
      ORDER BY assessment_type
    `, [courseId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching file summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch file summary',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/detailed-calculations/course/:courseId/co-level-analysis
 * @desc    Get CO-level aggregated analysis
 * @access  Private
 */
router.get('/course/:courseId/co-level-analysis', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const result = await pool.query(`
      SELECT
        cla.*,
        co.description as co_description,
        co.bloom_level,
        fls.assessment_name,
        fls.assessment_type
      FROM co_level_analysis cla
      JOIN course_outcomes co ON cla.co_id = co.id
      JOIN file_level_summary fls ON cla.marksheet_id = fls.marksheet_id
      WHERE cla.course_id = $1
      ORDER BY fls.assessment_type, cla.co_number
    `, [courseId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching CO-level analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch CO-level analysis',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/detailed-calculations/course/:courseId/final-cie
 * @desc    Get final CIE composition for all students
 * @access  Private
 */
router.get('/course/:courseId/final-cie', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const result = await pool.query(`
      SELECT * FROM final_cie_composition
      WHERE course_id = $1
      ORDER BY final_cie_percentage DESC, usn
    `, [courseId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching final CIE:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch final CIE composition',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/detailed-calculations/course/:courseId/combined-co-attainment
 * @desc    Get combined CO attainment across all CIE assessments
 * @access  Private
 */
router.get('/course/:courseId/combined-co-attainment', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    // Use the calculated table instead of the view
    const result = await pool.query(`
      SELECT
        cca.co_number,
        cca.total_max_marks as "Total Max Marks",
        cca.total_attempts as "Total Attempts",
        cca.students_above_threshold as "Above Threshold",
        cca.attainment_percent as "CO Attainment %",
        co.description,
        co.bloom_level as "Bloom Level"
      FROM combined_co_attainment_calculated cca
      JOIN course_outcomes co ON cca.co_id = co.id
      WHERE cca.course_id = $1
      ORDER BY cca.co_number
    `, [courseId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching combined CO attainment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch combined CO attainment',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/detailed-calculations/course/:courseId/students
 * @desc    Get list of students enrolled in course
 * @access  Private
 */
router.get('/course/:courseId/students', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const result = await pool.query(`
      SELECT DISTINCT u.id, u.usn, u.name
      FROM users u
      JOIN students_courses sc ON u.id = sc.student_id
      WHERE sc.course_id = $1 AND u.role = 'student'
      ORDER BY u.usn
    `, [courseId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch students',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/detailed-calculations/course/:courseId/student/:studentId/performance
 * @desc    Get individual student performance across all COs
 * @access  Private
 */
router.get('/course/:courseId/student/:studentId/performance', authenticateToken, async (req, res) => {
  try {
    const { courseId, studentId } = req.params;

    // Get student info
    const studentResult = await pool.query(
      'SELECT id, usn, name FROM users WHERE id = $1',
      [studentId]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    const student = studentResult.rows[0];
    const studentUSN = student.usn;

    // Get all course outcomes
    const cosResult = await pool.query(`
      SELECT id, co_number, description, bloom_level
      FROM course_outcomes
      WHERE course_id = $1
      ORDER BY co_number
    `, [courseId]);

    // Get all marksheets for this course
    const marksheetsResult = await pool.query(`
      SELECT m.id, m.assessment_name, m.table_name, fls.assessment_type
      FROM marksheets m
      LEFT JOIN file_level_summary fls ON m.id = fls.marksheet_id
      WHERE m.course_id = $1 AND m.processing_status = 'completed'
      ORDER BY fls.assessment_type, m.created_at
    `, [courseId]);

    // Build CO performance data
    const coPerformance = [];

    for (const co of cosResult.rows) {
      const coNumber = co.co_number;

      const coData = {
        co_number: coNumber,
        co_id: co.id,
        description: co.description,
        bloom_level: co.bloom_level,
        total_marks_obtained: 0,
        total_max_marks: 0,
        percentage: 0,
        assessments: []
      };

      // Get student's marks for this CO across all assessments
      for (const marksheet of marksheetsResult.rows) {
        // Get CO mappings for this marksheet
        const mappingsResult = await pool.query(`
          SELECT question_column, co_number, max_marks
          FROM question_co_mappings
          WHERE marksheet_id = $1 AND co_number = $2
        `, [marksheet.id, coNumber]);

        if (mappingsResult.rows.length === 0) continue;

        // Get student's marks from the dynamic table (keep original case — columns were renamed to lowercase)
        const questionColumns = mappingsResult.rows.map(m => `"${m.question_column}"`).join(', ');

        if (!questionColumns) continue;

        const marksQuery = `
          SELECT ${questionColumns}
          FROM "${marksheet.table_name}"
          WHERE UPPER("USN") = UPPER($1)
          LIMIT 1
        `;

        try {
          const studentMarksResult = await pool.query(marksQuery, [studentUSN]);

          if (studentMarksResult.rows.length === 0) continue;

          const marksRow = studentMarksResult.rows[0];
          let assessmentObtained = 0;
          let assessmentMax = 0;
          const allQuestions = [];

          // CRITICAL: Determine which questions this student actually attempted
          // Import the service class temporarily for this calculation
          const detailedCalcService = (await import('../services/detailedCalculations.js')).default;
          // Extract just the question column names (function expects array of strings or objects with columnName)
          const questionNames = mappingsResult.rows.map(m => m.question_column);
          const attemptedQuestions = detailedCalcService.getAttemptedQuestions(marksRow, questionNames);

          for (const mapping of mappingsResult.rows) {
            const questionCol = mapping.question_column; // lowercase, matches renamed table column
            const rawMarks = marksRow[questionCol];
            const maxMarks = parseFloat(mapping.max_marks || 0);

            // Skip questions with 0 max marks (not part of assessment)
            if (maxMarks === 0) continue;

            // Check if this question was attempted by the student
            const wasAttempted = attemptedQuestions.has(mapping.question_column);

            let obtainedMarks = 0;
            let isAttempted = false;
            if (rawMarks !== null && rawMarks !== undefined && rawMarks !== '' && rawMarks !== 'NaN') {
              const parsed = parseFloat(rawMarks);
              if (!isNaN(parsed) && isFinite(parsed)) {
                obtainedMarks = parsed;
                isAttempted = true;
              }
            }

            // ONLY count marks from questions the student attempted
            if (wasAttempted) {
              assessmentObtained += obtainedMarks;
              assessmentMax += maxMarks;
            }

            // Calculate percentage
            const questionPercentage = maxMarks > 0 ? (obtainedMarks / maxMarks) * 100 : 0;

            // Add ALL questions to the list with attempt status
            allQuestions.push({
              question: mapping.question_column,
              obtained: obtainedMarks,
              max: maxMarks,
              percentage: questionPercentage,
              isAttempted: isAttempted,
              wasSelectedByStudent: wasAttempted, // NEW: indicates if this was the chosen question from optional pair
              status: questionPercentage >= 80 ? 'excellent' :
                      questionPercentage >= 60 ? 'good' :
                      questionPercentage >= 40 ? 'average' : 'needs_improvement'
            });
          }

          const assessmentPercentage = assessmentMax > 0 ? (assessmentObtained / assessmentMax) * 100 : 0;

          // Only add assessment if it has actual data (max marks > 0)
          if (assessmentMax > 0) {
            coData.assessments.push({
              assessment_name: marksheet.assessment_name,
              assessment_type: marksheet.assessment_type || 'OTHER',
              marks_obtained: assessmentObtained,
              max_marks: assessmentMax,
              percentage: assessmentPercentage,
              all_questions: allQuestions // All questions with their status
            });

            coData.total_marks_obtained += assessmentObtained;
            coData.total_max_marks += assessmentMax;
          }
        } catch (err) {
          console.error(`Error fetching marks for ${marksheet.assessment_name}:`, err.message);
          continue;
        }
      }

      coData.percentage = coData.total_max_marks > 0
        ? (coData.total_marks_obtained / coData.total_max_marks) * 100
        : 0;

      // Only include COs that have actual data (assessments with marks)
      if (coData.total_max_marks > 0) {
        coPerformance.push(coData);
      }
    }

    // Get final CIE composition
    const finalCIEResult = await pool.query(`
      SELECT *
      FROM final_cie_composition
      WHERE course_id = $1 AND student_id = $2
    `, [courseId, studentId]);

    // Calculate overall stats
    const overallStats = {
      total_cos: coPerformance.length,
      cos_above_60: coPerformance.filter(co => co.percentage >= 60).length,
      cos_below_60: coPerformance.filter(co => co.percentage < 60).length,
      avg_performance: coPerformance.length > 0
        ? coPerformance.reduce((sum, co) => sum + co.percentage, 0) / coPerformance.length
        : 0,
      weakest_co: coPerformance.length > 0
        ? coPerformance.reduce((min, co) => co.percentage < min.percentage ? co : min)
        : null,
      strongest_co: coPerformance.length > 0
        ? coPerformance.reduce((max, co) => co.percentage > max.percentage ? co : max)
        : null
    };

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json({
      success: true,
      data: {
        student,
        coPerformance,
        finalCIE: finalCIEResult.rows[0] || null,
        overallStats
      }
    });
  } catch (error) {
    console.error('Error fetching student performance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch student performance',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/detailed-calculations/course/:courseId/co-attainment-per-assessment
 * @desc    Get CO attainment per assessment (CIE1, CIE2, CIE3, AAT)
 * @access  Private
 */
router.get('/course/:courseId/co-attainment-per-assessment', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const result = await pool.query(`
      SELECT 
        cla.co_number,
        cla.co_max_marks as "Max Marks",
        cla.co_attempts as "Attempts",
        cla.co_students_above_threshold as "Above 60%",
        cla.co_attainment_percent as "Attainment %",
        m.assessment_name,
        fls.assessment_type
      FROM co_level_analysis cla
      JOIN marksheets m ON cla.marksheet_id = m.id
      LEFT JOIN file_level_summary fls ON m.id = fls.marksheet_id
      WHERE cla.course_id = $1
      ORDER BY fls.assessment_type, cla.co_number
    `, [courseId]);

    // Group by assessment type
    const grouped = {};
    for (const row of result.rows) {
      const assessmentType = row.assessment_type || row.assessment_name || 'Unknown';
      if (!grouped[assessmentType]) {
        grouped[assessmentType] = [];
      }
      grouped[assessmentType].push(row);
    }

    res.json({
      success: true,
      data: grouped
    });
  } catch (error) {
    console.error('Error fetching per-assessment CO attainment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch per-assessment CO attainment',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/detailed-calculations/course/:courseId/student-performance
 * @desc    Get complete student performance summary
 * @access  Private
 */
router.get('/course/:courseId/student-performance', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const result = await pool.query(`
      SELECT * FROM student_performance_summary
      WHERE course_id = $1
      ORDER BY usn, assessment_type
    `, [courseId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching student performance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch student performance',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/detailed-calculations/course/:courseId/complete-report
 * @desc    Get complete detailed report with all calculations
 * @access  Private
 */
router.get('/course/:courseId/complete-report', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    // Fetch all calculation results in parallel
    const [
      verticalAnalysis,
      horizontalAnalysis,
      fileSummary,
      coLevelAnalysis,
      finalCIE,
      combinedCOAttainment
    ] = await Promise.all([
      pool.query(`
        SELECT qva.*, m.assessment_name, fls.assessment_type
        FROM question_vertical_analysis qva
        JOIN marksheets m ON qva.marksheet_id = m.id
        JOIN file_level_summary fls ON qva.marksheet_id = fls.marksheet_id
        WHERE qva.course_id = $1
        ORDER BY fls.assessment_type, qva.question_column
      `, [courseId]),
      pool.query(`
        SELECT sha.*, m.assessment_name, fls.assessment_type
        FROM student_horizontal_analysis sha
        JOIN marksheets m ON sha.marksheet_id = m.id
        JOIN file_level_summary fls ON sha.marksheet_id = fls.marksheet_id
        WHERE sha.course_id = $1
        ORDER BY sha.usn, fls.assessment_type
      `, [courseId]),
      pool.query('SELECT * FROM file_level_summary WHERE course_id = $1 ORDER BY assessment_type', [courseId]),
      pool.query(`
        SELECT cla.*, co.description, co.bloom_level, fls.assessment_type
        FROM co_level_analysis cla
        JOIN course_outcomes co ON cla.co_id = co.id
        JOIN file_level_summary fls ON cla.marksheet_id = fls.marksheet_id
        WHERE cla.course_id = $1
        ORDER BY fls.assessment_type, cla.co_number
      `, [courseId]),
      pool.query('SELECT * FROM final_cie_composition WHERE course_id = $1 ORDER BY usn', [courseId]),
      pool.query(`
        SELECT
          ccac.id,
          ccac.co_id,
          ccac.co_number,
          ccac.total_max_marks as total_co_max_marks,
          ccac.total_attempts as total_co_attempts,
          ccac.students_above_threshold as total_students_above_threshold,
          ccac.attainment_percent as overall_co_attainment_percent,
          ccac.threshold,
          ccac.calculated_at,
          co.description as co_description,
          co.bloom_level
        FROM combined_co_attainment_calculated ccac
        JOIN course_outcomes co ON ccac.co_id = co.id
        WHERE ccac.course_id = $1
        ORDER BY ccac.co_number
      `, [courseId])
    ]);

    res.json({
      success: true,
      data: {
        verticalAnalysis: verticalAnalysis.rows,
        horizontalAnalysis: horizontalAnalysis.rows,
        fileSummary: fileSummary.rows,
        coLevelAnalysis: coLevelAnalysis.rows,
        finalCIE: finalCIE.rows,
        combinedCOAttainment: combinedCOAttainment.rows
      }
    });
  } catch (error) {
    console.error('Error fetching complete report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch complete report',
      details: error.message
    });
  }
});

export default router;
