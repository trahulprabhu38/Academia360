import express from 'express';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import attainmentCalculator from '../services/attainmentCalculator.js';
import combinedCOAttainment from '../services/combinedCOAttainment.js';
import labCOAttainmentService from '../services/labCOAttainmentService.js';
import cesService from '../services/cesService.js';
import finalCOAttainmentService from '../services/finalCOAttainmentService.js';
import mappingDerivedService from '../services/mappingDerivedService.js';
import poAttainmentService from '../services/poAttainmentService.js';
import psoAttainmentService from '../services/psoAttainmentService.js';
import studentAttainmentService from '../services/studentAttainmentService.js';
import detailedCalculationsService from '../services/detailedCalculations.js';

const router = express.Router();

/**
 * @route   GET /api/attainment/course/:courseId/co-attainment
 * @desc    Get CO attainment data for a course
 * @access  Private
 */
router.get('/course/:courseId/co-attainment', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    // Get latest snapshot
    const snapshotRes = await pool.query(
      `SELECT DISTINCT ON (co_id)
         cos.id,
         cos.co_number,
         cos.description,
         cos.bloom_level,
         ccs.cie_percent,
         ccs.see_percent,
         ccs.ces_percent,
         ccs.final_percent,
         ccs.calculated_at
       FROM co_calculation_snapshot ccs
       JOIN course_outcomes cos ON ccs.co_id = cos.id
       WHERE ccs.course_id = $1
       ORDER BY co_id, ccs.calculated_at DESC`,
      [courseId]
    );

    // Get per-assessment breakdown
    const assessmentRes = await pool.query(
      `SELECT
         co.co_number,
         a.name as assessment_name,
         a.type as assessment_type,
         ca.attainment_percentage,
         ca.total_students,
         ca.students_above_threshold,
         ca.threshold_percentage
       FROM co_attainment ca
       JOIN course_outcomes co ON ca.co_id = co.id
       JOIN assessments a ON ca.assessment_id = a.id
       WHERE ca.course_id = $1
       ORDER BY co.co_number, a.assessment_date`,
      [courseId]
    );

    // Group assessments by CO
    const byAssessment = {};
    assessmentRes.rows.forEach(row => {
      if (!byAssessment[row.co_number]) {
        byAssessment[row.co_number] = [];
      }
      byAssessment[row.co_number].push({
        assessmentName: row.assessment_name,
        assessmentType: row.assessment_type,
        attainment: row.attainment_percentage,
        totalStudents: row.total_students,
        studentsAboveThreshold: row.students_above_threshold,
        threshold: row.threshold_percentage
      });
    });

    const coAttainment = snapshotRes.rows.map(row => ({
      ...row,
      assessments: byAssessment[row.co_number] || []
    }));

    res.json({
      success: true,
      coAttainment
    });
  } catch (error) {
    console.error('Error fetching CO attainment:', error);
    res.status(500).json({ error: 'Failed to fetch CO attainment', details: error.message });
  }
});

/**
 * @route   GET /api/attainment/course/:courseId/po-attainment
 * @desc    Get PO attainment data for a course
 * @access  Private
 */
router.get('/course/:courseId/po-attainment', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const result = await pool.query(
      `SELECT
         po.po_number,
         po.description,
         po.category,
         pa.attainment_level,
         pa.po_percentage,
         pa.calculation_method,
         pa.calculated_at
       FROM po_attainment pa
       JOIN program_outcomes po ON pa.po_id = po.id
       WHERE pa.course_id = $1
       ORDER BY po.po_number`,
      [courseId]
    );

    res.json({
      success: true,
      poAttainment: result.rows
    });
  } catch (error) {
    console.error('Error fetching PO attainment:', error);
    res.status(500).json({ error: 'Failed to fetch PO attainment', details: error.message });
  }
});

/**
 * @route   GET /api/attainment/course/:courseId/students
 * @desc    Get student overall scores for a course
 * @access  Private
 */
router.get('/course/:courseId/students', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const result = await pool.query(
      `SELECT
         u.id,
         u.usn,
         u.name,
         sos.total_obtained,
         sos.total_max,
         sos.percentage,
         sos.grade,
         sos.cie_percentage,
         sos.see_percentage,
         sos.calculated_at
       FROM student_overall_scores sos
       JOIN users u ON sos.student_id = u.id
       WHERE sos.course_id = $1
       ORDER BY sos.percentage DESC`,
      [courseId]
    );

    // Get grade distribution
    const gradeDistRes = await pool.query(
      `SELECT grade, COUNT(*) as count
       FROM student_overall_scores
       WHERE course_id = $1
       GROUP BY grade
       ORDER BY grade`,
      [courseId]
    );

    res.json({
      success: true,
      students: result.rows,
      gradeDistribution: gradeDistRes.rows
    });
  } catch (error) {
    console.error('Error fetching student scores:', error);
    res.status(500).json({ error: 'Failed to fetch student scores', details: error.message });
  }
});

/**
 * @route   GET /api/attainment/student/:studentId/course/:courseId
 * @desc    Get detailed student performance for a course
 * @access  Private
 */
router.get('/student/:studentId/course/:courseId', authenticateToken, async (req, res) => {
  try {
    const { studentId, courseId } = req.params;

    // Overall score
    const overallRes = await pool.query(
      `SELECT * FROM student_overall_scores
       WHERE student_id = $1 AND course_id = $2`,
      [studentId, courseId]
    );

    // Per-assessment scores
    const assessmentRes = await pool.query(
      `SELECT
         a.id,
         a.name,
         a.type,
         a.assessment_date,
         SUM(ss.marks_obtained) as obtained,
         SUM(ss.max_marks) as max,
         CASE
           WHEN SUM(ss.max_marks) > 0
           THEN (SUM(ss.marks_obtained) / SUM(ss.max_marks)) * 100
           ELSE 0
         END as percentage
       FROM student_scores ss
       JOIN assessments a ON ss.assessment_id = a.id
       WHERE ss.student_id = $1 AND a.course_id = $2
       GROUP BY a.id, a.name, a.type, a.assessment_date
       ORDER BY a.assessment_date`,
      [studentId, courseId]
    );

    // Per-CO scores
    const coRes = await pool.query(
      `SELECT
         co.co_number,
         co.description,
         a.name as assessment_name,
         scs.obtained_marks,
         scs.max_marks,
         scs.percentage
       FROM student_co_scores scs
       JOIN course_outcomes co ON scs.co_id = co.id
       JOIN assessments a ON scs.assessment_id = a.id
       WHERE scs.student_id = $1 AND scs.course_id = $2
       ORDER BY co.co_number, a.assessment_date`,
      [studentId, courseId]
    );

    // Get config threshold
    const configRes = await pool.query(
      'SELECT attainment_threshold FROM course_config WHERE course_id = $1',
      [courseId]
    );
    const threshold = configRes.rows[0]?.attainment_threshold || 60;

    // CO mastery summary
    const coMasteryRes = await pool.query(
      `SELECT
         co.co_number,
         co.description,
         AVG(scs.percentage) as avg_percentage,
         CASE
           WHEN AVG(scs.percentage) >= $3 THEN 'Above Threshold'
           ELSE 'Below Threshold'
         END as status
       FROM student_co_scores scs
       JOIN course_outcomes co ON scs.co_id = co.id
       WHERE scs.student_id = $1 AND scs.course_id = $2
       GROUP BY co.co_number, co.description
       ORDER BY co.co_number`,
      [studentId, courseId, threshold]
    );

    res.json({
      success: true,
      overall: overallRes.rows[0],
      assessments: assessmentRes.rows,
      coScores: coRes.rows,
      coMastery: coMasteryRes.rows,
      threshold
    });
  } catch (error) {
    console.error('Error fetching student detail:', error);
    res.status(500).json({ error: 'Failed to fetch student detail', details: error.message });
  }
});

/**
 * @route   POST /api/attainment/course/:courseId/recalculate
 * @desc    Run full NBA-compliant attainment pipeline for a course:
 *          CIA CO → Lab CO → SEE CO → CES → Final CO → CO-PO-PSO Derived → PO → PSO
 * @access  Private (Teacher only)
 */
router.post('/course/:courseId/recalculate', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    // Step 0: Detailed per-question calculations (populates question_vertical_analysis)
    await detailedCalculationsService.runFullCalculation(courseId);

    // Step 1: CIA theory CO attainment
    const ciaSummary = await combinedCOAttainment.calculateCombinedCOAttainment(courseId);

    // Step 2: Lab CO attainment
    await labCOAttainmentService.calculate(courseId);

    // Step 3: CES — read existing ces_attainment rows WITHOUT overwriting.
    // Manual uploads and explicit survey calculations store data in ces_attainment.
    // The pipeline only consumes it; recalculating from survey responses here would
    // overwrite manually-uploaded aggregate data with potentially fewer survey responses.
    // To recalculate CES from live survey responses, use POST /ces/course/:id/calculate.

    // Step 4: Final CO attainment (CIE + SEE + CES)
    const coResults = await finalCOAttainmentService.calculate(courseId);

    // Step 5: Derive CO-PO and CO-PSO mapping levels
    await mappingDerivedService.derive(courseId);

    // Step 6: PO attainment
    const poResults = await poAttainmentService.calculate(courseId);

    // Step 7: PSO attainment
    const psoResults = await psoAttainmentService.calculate(courseId);

    // Step 8: Per-student CO / PO / PSO attainment
    const studentResults = await studentAttainmentService.calculateForCourse(courseId);
    const uniqueStudents = new Set(studentResults.map(r => r.studentId)).size;

    res.json({
      success: true,
      message: 'Full NBA attainment pipeline completed',
      summary: {
        co_count: coResults.length,
        po_count: poResults.length,
        pso_count: psoResults.length,
        student_count: uniqueStudents
      }
    });
  } catch (error) {
    console.error('Error recalculating attainment:', error);
    res.status(500).json({ error: 'Failed to recalculate attainment', details: error.message });
  }
});

/**
 * @route   GET /api/attainment/course/:courseId/dashboard
 * @desc    Get complete dashboard data for a course
 * @access  Private
 */
router.get('/course/:courseId/dashboard', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    // CO Attainment Summary
    const coSummaryRes = await pool.query(
      `SELECT
         AVG(final_percent) as avg_co_attainment,
         COUNT(DISTINCT co_id) as total_cos
       FROM (
         SELECT DISTINCT ON (co_id) co_id, final_percent
         FROM co_calculation_snapshot
         WHERE course_id = $1
         ORDER BY co_id, calculated_at DESC
       ) latest`,
      [courseId]
    );

    // PO Attainment Summary
    const poSummaryRes = await pool.query(
      `SELECT
         AVG(attainment_level) as avg_po_level,
         AVG(po_percentage) as avg_po_percentage,
         COUNT(*) as total_pos
       FROM po_attainment
       WHERE course_id = $1`,
      [courseId]
    );

    // Student Stats
    const studentStatsRes = await pool.query(
      `SELECT
         COUNT(*) as total_students,
         AVG(percentage) as avg_percentage,
         MIN(percentage) as min_percentage,
         MAX(percentage) as max_percentage
       FROM student_overall_scores
       WHERE course_id = $1`,
      [courseId]
    );

    // Grade Distribution
    const gradeDistRes = await pool.query(
      `SELECT grade, COUNT(*) as count
       FROM student_overall_scores
       WHERE course_id = $1
       GROUP BY grade
       ORDER BY grade`,
      [courseId]
    );

    // Bloom's Taxonomy Distribution
    const bloomDistRes = await pool.query(
      `SELECT
         bloom_level,
         COUNT(*) as count
       FROM course_outcomes
       WHERE course_id = $1 AND bloom_level IS NOT NULL
       GROUP BY bloom_level
       ORDER BY
         CASE bloom_level
           WHEN 'Remember' THEN 1
           WHEN 'Understand' THEN 2
           WHEN 'Apply' THEN 3
           WHEN 'Analyze' THEN 4
           WHEN 'Evaluate' THEN 5
           WHEN 'Create' THEN 6
           ELSE 7
         END`,
      [courseId]
    );

    // Assessment Performance Trends
    const assessmentTrendsRes = await pool.query(
      `SELECT
         a.name,
         a.type,
         a.assessment_date,
         AVG(
           CASE
             WHEN ss.max_marks > 0
             THEN (ss.marks_obtained / ss.max_marks) * 100
             ELSE 0
           END
         ) as avg_percentage
       FROM assessments a
       JOIN student_scores ss ON a.id = ss.assessment_id
       WHERE a.course_id = $1
       GROUP BY a.id, a.name, a.type, a.assessment_date
       ORDER BY a.assessment_date`,
      [courseId]
    );

    res.json({
      success: true,
      dashboard: {
        coSummary: coSummaryRes.rows[0],
        poSummary: poSummaryRes.rows[0],
        studentStats: studentStatsRes.rows[0],
        gradeDistribution: gradeDistRes.rows,
        bloomDistribution: bloomDistRes.rows,
        assessmentTrends: assessmentTrendsRes.rows
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard', details: error.message });
  }
});

/**
 * @route   GET /api/attainment/course/:courseId/co-attainment-with-threshold
 * @desc    Get CO attainment with target threshold for comparison
 * @access  Private
 */
router.get('/course/:courseId/co-attainment-with-threshold', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    // Get threshold from config
    const configRes = await pool.query(
      'SELECT attainment_threshold FROM course_config WHERE course_id = $1',
      [courseId]
    );
    const threshold = configRes.rows[0]?.attainment_threshold || 70;

    // Get latest CO attainment snapshots
    const snapshotRes = await pool.query(
      `SELECT DISTINCT ON (co_id)
         cos.co_number,
         cos.description,
         cos.bloom_level,
         ccs.final_percent
       FROM co_calculation_snapshot ccs
       JOIN course_outcomes cos ON ccs.co_id = cos.id
       WHERE ccs.course_id = $1
       ORDER BY co_id, ccs.calculated_at DESC`,
      [courseId]
    );

    const coAttainmentWithThreshold = snapshotRes.rows.map(row => ({
      co_number: row.co_number,
      description: row.description,
      bloom_level: row.bloom_level,
      attainment: parseFloat(row.final_percent || 0),
      threshold: threshold
    }));

    res.json({
      success: true,
      threshold,
      coAttainment: coAttainmentWithThreshold
    });
  } catch (error) {
    console.error('Error fetching CO attainment with threshold:', error);
    res.status(500).json({ error: 'Failed to fetch CO attainment', details: error.message });
  }
});

/**
 * @route   GET /api/attainment/teacher/analytics
 * @desc    Get teacher's comprehensive analytics across all courses
 * @access  Private (Teacher only)
 */
router.get('/teacher/analytics', authenticateToken, async (req, res) => {
  try {
    const teacherId = req.user.id;

    // Get all teacher's courses
    const coursesRes = await pool.query(
      `SELECT id, code, name, semester, year, credits
       FROM courses
       WHERE teacher_id = $1
       ORDER BY year DESC, semester DESC`,
      [teacherId]
    );

    // Get total students across all courses
    const totalStudentsRes = await pool.query(
      `SELECT COUNT(DISTINCT student_id) as total
       FROM students_courses sc
       JOIN courses c ON sc.course_id = c.id
       WHERE c.teacher_id = $1 AND sc.status = 'active'`,
      [teacherId]
    );

    // Get total assessments
    const totalAssessmentsRes = await pool.query(
      `SELECT COUNT(*) as total
       FROM assessments a
       JOIN courses c ON a.course_id = c.id
       WHERE c.teacher_id = $1`,
      [teacherId]
    );

    // Get average CO attainment across all courses
    const avgCORes = await pool.query(
      `SELECT AVG(final_percent) as avg_co_attainment
       FROM (
         SELECT DISTINCT ON (course_id, co_id) course_id, final_percent
         FROM co_calculation_snapshot ccs
         JOIN courses c ON ccs.course_id = c.id
         WHERE c.teacher_id = $1
         ORDER BY course_id, co_id, calculated_at DESC
       ) latest`,
      [teacherId]
    );

    // Get average PO attainment
    const avgPORes = await pool.query(
      `SELECT AVG(attainment_level) as avg_po_level
       FROM po_attainment pa
       JOIN courses c ON pa.course_id = c.id
       WHERE c.teacher_id = $1`,
      [teacherId]
    );

    // Get recent activities (mark uploads)
    const recentActivitiesRes = await pool.query(
      `SELECT
         a.name as assessment_name,
         a.type as assessment_type,
         a.assessment_date,
         c.code as course_code,
         c.name as course_name,
         COUNT(DISTINCT ss.student_id) as students_count,
         a.created_at
       FROM assessments a
       JOIN courses c ON a.course_id = c.id
       LEFT JOIN student_scores ss ON a.id = ss.assessment_id
       WHERE c.teacher_id = $1
       GROUP BY a.id, a.name, a.type, a.assessment_date, c.code, c.name, a.created_at
       ORDER BY a.created_at DESC
       LIMIT 10`,
      [teacherId]
    );

    // Weekly trends - assessments and uploads over past 8 weeks
    const weeklyTrendsRes = await pool.query(
      `SELECT
         DATE_TRUNC('week', a.created_at) as week_start,
         COUNT(*) as assessments_count,
         COUNT(DISTINCT a.course_id) as courses_affected
       FROM assessments a
       JOIN courses c ON a.course_id = c.id
       WHERE c.teacher_id = $1
         AND a.created_at >= NOW() - INTERVAL '8 weeks'
       GROUP BY week_start
       ORDER BY week_start`,
      [teacherId]
    );

    res.json({
      success: true,
      data: {
        overview: {
          totalCourses: coursesRes.rows.length,
          totalStudents: parseInt(totalStudentsRes.rows[0]?.total || 0),
          totalAssessments: parseInt(totalAssessmentsRes.rows[0]?.total || 0),
          avgCOAttainment: parseFloat(avgCORes.rows[0]?.avg_co_attainment || 0),
          avgPOLevel: parseFloat(avgPORes.rows[0]?.avg_po_level || 0)
        },
        courses: coursesRes.rows,
        recentActivities: recentActivitiesRes.rows,
        weeklyTrends: weeklyTrendsRes.rows
      }
    });
  } catch (error) {
    console.error('Error fetching teacher analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics', details: error.message });
  }
});

/**
 * @route   GET /api/attainment/course/:courseId/co-po-mapping
 * @desc    Get detailed CO-PO mapping with descriptions for a course
 * @access  Private
 */
router.get('/course/:courseId/co-po-mapping', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    // Get all COs with their descriptions and bloom levels
    const cosRes = await pool.query(
      `SELECT
         id,
         co_number,
         description,
         bloom_level,
         module_number
       FROM course_outcomes
       WHERE course_id = $1
       ORDER BY co_number`,
      [courseId]
    );

    // Get all POs
    const posRes = await pool.query(
      `SELECT
         id,
         po_number,
         description,
         category
       FROM program_outcomes
       ORDER BY po_number`
    );

    // Get CO-PO mapping with correlation levels
    const mappingRes = await pool.query(
      `SELECT
         cpm.co_id,
         cpm.po_id,
         cpm.correlation_level,
         co.co_number,
         po.po_number
       FROM co_po_mapping cpm
       JOIN course_outcomes co ON cpm.co_id = co.id
       JOIN program_outcomes po ON cpm.po_id = po.id
       WHERE co.course_id = $1
       ORDER BY co.co_number, po.po_number`,
      [courseId]
    );

    // Build mapping matrix
    const matrix = {};
    cosRes.rows.forEach(co => {
      matrix[co.co_number] = {};
      posRes.rows.forEach(po => {
        matrix[co.co_number][po.po_number] = 0;
      });
    });

    mappingRes.rows.forEach(mapping => {
      matrix[mapping.co_number][mapping.po_number] = mapping.correlation_level;
    });

    res.json({
      success: true,
      data: {
        cos: cosRes.rows,
        pos: posRes.rows,
        mappingMatrix: matrix,
        mappingList: mappingRes.rows
      }
    });
  } catch (error) {
    console.error('Error fetching CO-PO mapping:', error);
    res.status(500).json({ error: 'Failed to fetch CO-PO mapping', details: error.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// NEW V2 ATTAINMENT ENDPOINTS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/attainment/course/:courseId/co-final
 * Final CO attainment with full breakdown (theory/lab/CIE/SEE/CES/direct/final/level).
 */
router.get('/course/:courseId/co-final', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const data = await finalCOAttainmentService.getDetail(courseId);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/attainment/course/:courseId/po-final
 * Final PO attainment with derived mapping.
 */
router.get('/course/:courseId/po-final', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const data = await poAttainmentService.getDetail(courseId);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/attainment/course/:courseId/pso
 * PSO attainment.
 */
router.get('/course/:courseId/pso', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const data = await psoAttainmentService.getDetail(courseId);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/attainment/course/:courseId/co-po-pso-matrix
 * Full attainment matrix:
 *   { co_attainment, po_attainment, pso_attainment, derived_mapping_table }
 */
router.get('/course/:courseId/co-po-pso-matrix', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;

    const [coData, poData, psoData, derivedPO, derivedPSO, cos, pos, psos] = await Promise.all([
      finalCOAttainmentService.getDetail(courseId),
      poAttainmentService.getDetail(courseId),
      psoAttainmentService.getDetail(courseId),
      pool.query(`
        SELECT cpd.co_id, cpd.po_id, cpd.derived_level, cpd.raw_mapping_strength, cpd.marks_pct,
               co.co_number, po.po_number
        FROM co_po_mapping_derived cpd
        JOIN course_outcomes co ON cpd.co_id = co.id
        JOIN program_outcomes po ON cpd.po_id = po.id
        WHERE cpd.course_id = $1
        ORDER BY co.co_number, po.po_number
      `, [courseId]),
      pool.query(`
        SELECT cpd.co_id, cpd.pso_id, cpd.derived_level, cpd.raw_mapping_strength,
               co.co_number, pso.pso_number
        FROM co_pso_mapping_derived cpd
        JOIN course_outcomes co ON cpd.co_id = co.id
        JOIN pso_outcomes pso ON cpd.pso_id = pso.id
        WHERE cpd.course_id = $1
        ORDER BY co.co_number, pso.pso_number
      `, [courseId]),
      pool.query('SELECT id, co_number, description FROM course_outcomes WHERE course_id = $1 ORDER BY co_number', [courseId]),
      pool.query('SELECT id, po_number, description FROM program_outcomes ORDER BY po_number'),
      pool.query('SELECT id, pso_number, description FROM pso_outcomes ORDER BY pso_number')
    ]);

    res.json({
      success: true,
      data: {
        cos: cos.rows,
        pos: pos.rows,
        psos: psos.rows,
        coAttainment: coData,
        poAttainment: poData,
        psoAttainment: psoData,
        coPoDerivedMapping: derivedPO.rows,
        coPsoDerivedMapping: derivedPSO.rows
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/attainment/course/:courseId/config
 * Get attainment configuration for a course.
 */
router.get('/course/:courseId/config', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const cfgRes = await pool.query(
      'SELECT * FROM course_attainment_config WHERE course_id = $1',
      [courseId]
    );
    const courseRes = await pool.query(
      'SELECT course_type FROM courses WHERE id = $1',
      [courseId]
    );
    res.json({
      success: true,
      data: {
        ...(cfgRes.rows[0] || {}),
        course_type: courseRes.rows[0]?.course_type || 'STANDALONE_THEORY'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/attainment/course/:courseId/config
 * Update attainment configuration (course type + weightages + threshold).
 */
router.put('/course/:courseId/config', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const {
      course_type,
      attainment_threshold,
      cie_weightage,
      see_weightage,
      direct_weightage,
      ces_weightage,
      target_attainment
    } = req.body;

    // Update course type
    if (course_type) {
      await pool.query('UPDATE courses SET course_type = $1 WHERE id = $2', [course_type, courseId]);
    }

    // Upsert attainment config
    await pool.query(`
      INSERT INTO course_attainment_config
        (course_id, attainment_threshold, cie_weightage, see_weightage,
         direct_weightage, ces_weightage, target_attainment)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (course_id) DO UPDATE SET
        attainment_threshold = COALESCE($2, course_attainment_config.attainment_threshold),
        cie_weightage        = COALESCE($3, course_attainment_config.cie_weightage),
        see_weightage        = COALESCE($4, course_attainment_config.see_weightage),
        direct_weightage     = COALESCE($5, course_attainment_config.direct_weightage),
        ces_weightage        = COALESCE($6, course_attainment_config.ces_weightage),
        target_attainment    = COALESCE($7, course_attainment_config.target_attainment),
        updated_at           = CURRENT_TIMESTAMP
    `, [courseId,
        attainment_threshold || null, cie_weightage || null, see_weightage || null,
        direct_weightage || null, ces_weightage || null, target_attainment || null]);

    res.json({ success: true, message: 'Configuration updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// STUDENT ATTAINMENT ENDPOINTS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/attainment/course/:courseId/student-attainment
 * All students × all COs — the heat-map grid for teachers.
 */
router.get('/course/:courseId/student-attainment', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const data = await studentAttainmentService.getAllStudentsCoAttainment(courseId);

    // Also pull COs list so the frontend can build column headers
    const cosRes = await pool.query(
      'SELECT id, co_number, description FROM course_outcomes WHERE course_id = $1 ORDER BY co_number',
      [courseId]
    );

    res.json({ success: true, data, cos: cosRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/attainment/course/:courseId/students/:studentId/attainment
 * Full CO + PO + PSO breakdown for one student (teacher or that student).
 */
router.get('/course/:courseId/students/:studentId/attainment', authenticateToken, async (req, res) => {
  try {
    const { courseId, studentId } = req.params;

    // A student may only access their own data; teachers can access anyone's
    if (req.user.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const data = await studentAttainmentService.getStudentFullAttainment(courseId, studentId);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/attainment/course/:courseId/my-attainment
 * Student endpoint — returns the calling student's own attainment.
 */
router.get('/course/:courseId/my-attainment', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user.id;
    const data = await studentAttainmentService.getStudentFullAttainment(courseId, studentId);
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
