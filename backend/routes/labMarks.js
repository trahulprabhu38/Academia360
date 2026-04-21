import express from 'express';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Ensure table exists
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ipcc_lab_marks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id UUID NOT NULL,
      student_id UUID,
      usn VARCHAR(20) NOT NULL,
      raw_marks NUMERIC(6,2) NOT NULL DEFAULT 0,
      scaled_marks NUMERIC(6,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(course_id, usn)
    )
  `);
}

/**
 * POST /api/lab-marks/courses/:courseId/upload
 * Upload lab SCE marks (USN + final marks out of 50)
 * Scales to 20 and stores in ipcc_lab_marks
 */
router.post('/courses/:courseId/upload', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    const { marksData } = req.body; // [{usn, marks}]

    if (!marksData || !Array.isArray(marksData) || marksData.length === 0) {
      return res.status(400).json({ success: false, message: 'marksData array is required' });
    }

    await ensureTable();

    let uploaded = 0, updated = 0, failed = 0;
    const errors = [];

    for (const row of marksData) {
      const usn = (row.usn || '').toString().trim().toUpperCase();
      const rawMarks = parseFloat(row.marks ?? row.raw_marks ?? row.final_marks ?? NaN);

      if (!usn || isNaN(rawMarks)) { failed++; continue; }

      const scaledMarks = Math.min((rawMarks / 50) * 20, 20);

      // Try to resolve student_id from USN
      const studentRes = await pool.query('SELECT id FROM users WHERE UPPER(usn) = $1', [usn]);
      const studentId = studentRes.rows[0]?.id || null;

      try {
        const existing = await pool.query(
          'SELECT id FROM ipcc_lab_marks WHERE course_id = $1 AND usn = $2',
          [courseId, usn]
        );

        if (existing.rows.length > 0) {
          await pool.query(
            `UPDATE ipcc_lab_marks SET raw_marks=$1, scaled_marks=$2, student_id=$3, updated_at=NOW()
             WHERE course_id=$4 AND usn=$5`,
            [rawMarks, scaledMarks, studentId, courseId, usn]
          );
          updated++;
        } else {
          await pool.query(
            `INSERT INTO ipcc_lab_marks (course_id, student_id, usn, raw_marks, scaled_marks)
             VALUES ($1,$2,$3,$4,$5)`,
            [courseId, studentId, usn, rawMarks, scaledMarks]
          );
          uploaded++;
        }
      } catch (err) {
        errors.push({ usn, error: err.message });
        failed++;
      }
    }

    return res.json({
      success: true,
      message: 'Lab marks uploaded',
      data: { uploaded, updated, failed, errors }
    });

  } catch (error) {
    console.error('Lab marks upload error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/lab-marks/courses/:courseId
 * Get all lab marks for a course
 */
router.get('/courses/:courseId', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    await ensureTable();
    const result = await pool.query(
      'SELECT * FROM ipcc_lab_marks WHERE course_id = $1 ORDER BY usn',
      [courseId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/lab-marks/courses/:courseId/status
 * Quick status: how many rows uploaded
 */
router.get('/courses/:courseId/status', authenticateToken, async (req, res) => {
  try {
    const { courseId } = req.params;
    await ensureTable();
    const result = await pool.query(
      'SELECT COUNT(*) as total FROM ipcc_lab_marks WHERE course_id = $1',
      [courseId]
    );
    return res.json({ success: true, data: { totalUploaded: parseInt(result.rows[0].total) } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
