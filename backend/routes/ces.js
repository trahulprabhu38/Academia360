import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import cesService from '../services/cesService.js';
import seeCOAttainmentService from '../services/seeCOAttainmentService.js';
import pool from '../config/db.js';

const router = express.Router();

// ─── CES QUESTIONS ────────────────────────────────────────────────────────────

/**
 * POST /api/ces/course/:courseId/questions
 * Teacher creates/updates survey questions for each CO.
 * Auto-generates questions from CO descriptions if not provided.
 */
router.post('/course/:courseId/questions', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    let { questions } = req.body;

    // Auto-generate from COs if no questions provided
    if (!questions || questions.length === 0) {
      const cosRes = await pool.query(
        'SELECT id, co_number, description FROM course_outcomes WHERE course_id = $1 ORDER BY co_number',
        [courseId]
      );
      questions = cosRes.rows.map(co => ({
        co_id: co.id,
        co_number: co.co_number,
        question_text: `How well did you understand and achieve CO${co.co_number}: "${co.description}"?`,
        question_order: co.co_number,
        is_active: false
      }));
    }

    const saved = await cesService.upsertQuestions(courseId, questions);
    res.json({ success: true, data: saved });
  } catch (err) {
    console.error('CES questions error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/ces/course/:courseId/questions
 * Get all questions (teacher) or only active ones (student).
 */
router.get('/course/:courseId/questions', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const activeOnly = req.user.role === 'student';
    const questions = await cesService.getQuestions(courseId, activeOnly);
    res.json({ success: true, data: questions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /api/ces/course/:courseId/activate
 * Toggle survey open/closed for the course.
 * Body: { is_active: true/false }
 */
router.patch('/course/:courseId/activate', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { is_active } = req.body;
    const result = await cesService.setActive(courseId, !!is_active);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── CES RESPONSES ────────────────────────────────────────────────────────────

/**
 * POST /api/ces/course/:courseId/respond
 * Student submits survey ratings.
 * Body: { responses: [{ co_id, co_number, rating }] }
 */
router.post('/course/:courseId/respond', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user.id;
    const { responses } = req.body;

    if (!responses || responses.length === 0) {
      return res.status(400).json({ success: false, message: 'responses array is required' });
    }

    const alreadySubmitted = await cesService.hasStudentSubmitted(courseId, studentId);
    if (alreadySubmitted) {
      return res.status(409).json({ success: false, message: 'You have already submitted this survey.' });
    }

    const result = await cesService.submitResponses(courseId, studentId, responses);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/ces/course/:courseId/submitted
 * Check if the current student has already submitted.
 */
router.get('/course/:courseId/submitted', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user.id;
    const submitted = await cesService.hasStudentSubmitted(courseId, studentId);
    res.json({ success: true, submitted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── CES ATTAINMENT ───────────────────────────────────────────────────────────

/**
 * POST /api/ces/course/:courseId/calculate
 * Compute and store CES attainment for all COs.
 */
router.post('/course/:courseId/calculate', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const result = await cesService.calculateAndStore(courseId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/ces/course/:courseId/attainment
 * Get CES attainment summary.
 */
router.get('/course/:courseId/attainment', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const data = await cesService.getResponseSummary(courseId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── MANUAL BULK CES UPLOAD ───────────────────────────────────────────────────

/**
 * POST /api/ces/course/:courseId/manual-upload
 * Teacher uploads pre-collected CES data directly.
 * Accepts aggregate counts per CO (from manual/spreadsheet data).
 * Body: {
 *   results: [{ co_number, r5, r4, r3, r2, r1 }]
 * }
 * Computes weighted_avg and ces_attainment (1–3) then upserts ces_attainment.
 */
router.post('/course/:courseId/manual-upload', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { results } = req.body;

    if (!results || results.length === 0) {
      return res.status(400).json({ success: false, message: 'results array is required' });
    }

    // Verify each CO exists for this course
    const cosRes = await pool.query(
      'SELECT id, co_number FROM course_outcomes WHERE course_id = $1 ORDER BY co_number',
      [courseId]
    );
    const coMap = {};
    cosRes.rows.forEach(co => { coMap[co.co_number] = co.id; });

    const saved = [];
    for (const row of results) {
      const coId = coMap[row.co_number];
      if (!coId) continue;  // skip unknown CO numbers

      const r5 = parseInt(row.r5 || 0);
      const r4 = parseInt(row.r4 || 0);
      const r3 = parseInt(row.r3 || 0);
      const r2 = parseInt(row.r2 || 0);
      const r1 = parseInt(row.r1 || 0);
      const total = r5 + r4 + r3 + r2 + r1;

      if (total === 0) continue;

      const weightedAvg = (r5 * 5 + r4 * 4 + r3 * 3 + r2 * 2 + r1 * 1) / total;
      const ces1to3 = ((weightedAvg - 1) / 4) * 2 + 1;

      await pool.query(`
        INSERT INTO ces_attainment
          (course_id, co_id, co_number, response_count,
           rating_5_count, rating_4_count, rating_3_count, rating_2_count, rating_1_count,
           weighted_avg, ces_attainment)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (course_id, co_id) DO UPDATE SET
          response_count  = EXCLUDED.response_count,
          rating_5_count  = EXCLUDED.rating_5_count,
          rating_4_count  = EXCLUDED.rating_4_count,
          rating_3_count  = EXCLUDED.rating_3_count,
          rating_2_count  = EXCLUDED.rating_2_count,
          rating_1_count  = EXCLUDED.rating_1_count,
          weighted_avg    = EXCLUDED.weighted_avg,
          ces_attainment  = EXCLUDED.ces_attainment,
          calculated_at   = CURRENT_TIMESTAMP
      `, [courseId, coId, row.co_number, total, r5, r4, r3, r2, r1, weightedAvg, ces1to3]);

      saved.push({ co_number: row.co_number, total, weighted_avg: weightedAvg, ces_attainment: ces1to3 });
    }

    res.json({ success: true, data: saved, message: `Uploaded CES data for ${saved.length} COs` });
  } catch (err) {
    console.error('Manual CES upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── SEE QUESTION MAPPING ─────────────────────────────────────────────────────

/**
 * POST /api/ces/see-mapping/course/:courseId
 * Teacher maps SEE question labels to COs.
 * Body: { mappings: [{ question_label, co_number, max_marks }] }
 */
router.post('/see-mapping/course/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { mappings } = req.body;
    if (!mappings || mappings.length === 0) {
      return res.status(400).json({ success: false, message: 'mappings array is required' });
    }
    const result = await seeCOAttainmentService.saveSEEQuestionMapping(courseId, mappings);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/ces/see-mapping/course/:courseId
 * Get existing SEE question mapping.
 */
router.get('/see-mapping/course/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const data = await seeCOAttainmentService.getSEEQuestionMapping(courseId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/ces/see-scores/course/:courseId
 * Upload question-wise SEE scores.
 * Body: { scores: [{ usn, question_label, marks_obtained }] }
 */
router.post('/see-scores/course/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { scores } = req.body;
    if (!scores || scores.length === 0) {
      return res.status(400).json({ success: false, message: 'scores array is required' });
    }
    const result = await seeCOAttainmentService.saveSEEQuestionScores(courseId, scores);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── CO-PSO MAPPING ───────────────────────────────────────────────────────────

/**
 * GET /api/ces/pso-outcomes
 * Get all PSO definitions.
 */
router.get('/pso-outcomes', authenticateToken, async (req, res) => {
  try {
    const res2 = await pool.query('SELECT * FROM pso_outcomes ORDER BY pso_number');
    res.json({ success: true, data: res2.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/ces/co-pso-mapping/course/:courseId
 * Save CO-PSO mapping.
 * Body: { mappings: [{ co_id, pso_id, correlation_level }] }
 */
router.post('/co-pso-mapping/course/:courseId', authenticateToken, async (req, res) => {
  try {
    const { mappings } = req.body;
    if (!mappings || mappings.length === 0) {
      return res.status(400).json({ success: false, message: 'mappings array is required' });
    }
    for (const m of mappings) {
      await pool.query(`
        INSERT INTO co_pso_mapping (co_id, pso_id, correlation_level)
        VALUES ($1, $2, $3)
        ON CONFLICT (co_id, pso_id) DO UPDATE SET correlation_level = EXCLUDED.correlation_level
      `, [m.co_id, m.pso_id, m.correlation_level]);
    }
    res.json({ success: true, saved: mappings.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/ces/co-pso-mapping/course/:courseId
 * Get CO-PSO mapping for a course.
 */
router.get('/co-pso-mapping/course/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const result = await pool.query(`
      SELECT cpm.co_id, cpm.pso_id, cpm.correlation_level,
             co.co_number, pso.pso_number, pso.description AS pso_description
      FROM co_pso_mapping cpm
      JOIN course_outcomes co ON cpm.co_id = co.id
      JOIN pso_outcomes pso ON cpm.pso_id = pso.id
      WHERE co.course_id = $1
      ORDER BY co.co_number, pso.pso_number
    `, [courseId]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
