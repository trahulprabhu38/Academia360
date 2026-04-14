import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth.js';
import coMappingService from '../services/coMappingService.js';

const router = express.Router();
const authMiddleware = authenticateToken;

// Configure multer for file upload (memory storage for CSV)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

/**
 * POST /api/co-mapping/upload
 * Upload CO mapping CSV for a specific marksheet
 *
 * Required fields:
 * - file: CSV file (multipart/form-data)
 * - courseId: UUID
 * - marksheetId: UUID
 */
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { courseId, marksheetId } = req.body;
    const file = req.file;
    const userId = req.user.userId;

    // Validate inputs
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    if (!courseId || !marksheetId) {
      return res.status(400).json({
        success: false,
        error: 'courseId and marksheetId are required'
      });
    }

    console.log(`📤 Uploading CO mapping: ${file.originalname} for marksheet ${marksheetId}`);

    // Convert buffer to string
    const csvContent = file.buffer.toString('utf-8');

    // Upload and parse CO mappings
    const result = await coMappingService.uploadCOMappings(
      courseId,
      marksheetId,
      file.originalname,
      csvContent,
      userId
    );

    res.status(200).json({
      success: true,
      message: 'CO mappings uploaded successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Error uploading CO mappings:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to upload CO mappings',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/co-mapping/marksheet/:marksheetId
 * Get CO mappings for a specific marksheet
 */
router.get('/marksheet/:marksheetId', authMiddleware, async (req, res) => {
  try {
    const { marksheetId } = req.params;

    const mappings = await coMappingService.getCOMappings(marksheetId);

    res.status(200).json({
      success: true,
      data: mappings
    });
  } catch (error) {
    console.error('Error fetching CO mappings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch CO mappings',
      details: error.message
    });
  }
});

/**
 * GET /api/co-mapping/course/:courseId
 * Get all CO mappings for a course
 */
router.get('/course/:courseId', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.params;

    const mappings = await coMappingService.getCourseCOMappings(courseId);

    res.status(200).json({
      success: true,
      data: mappings
    });
  } catch (error) {
    console.error('Error fetching course CO mappings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch course CO mappings',
      details: error.message
    });
  }
});

/**
 * DELETE /api/co-mapping/marksheet/:marksheetId
 * Delete CO mappings for a marksheet
 */
router.delete('/marksheet/:marksheetId', authMiddleware, async (req, res) => {
  try {
    const { marksheetId } = req.params;

    const result = await coMappingService.deleteCOMappings(marksheetId);

    res.status(200).json(result);
  } catch (error) {
    console.error('Error deleting CO mappings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete CO mappings',
      details: error.message
    });
  }
});

/**
 * GET /api/co-mapping/template
 * Download a template CO mapping CSV file
 * New format: Column, Max Marks, CO
 */
router.get('/template', (req, res) => {
  // Template shows the flexible A/B sub-question format.
  // Rules:
  //   • Each row maps ONE column to ONE CO with its max marks.
  //   • A question can be a single column (q1a=10) or split into A+B sub-parts
  //     with any mark split (6+4, 5+5, 4+6, etc.).
  //   • Columns with Max Marks = 0 are skipped during calculation.
  //   • Q1 / Q2 are compulsory; Q3/Q4, Q5/Q6, Q7/Q8 are optional pairs.
  //   • Sub-question pairs are detected automatically — q3a and q3b both belong
  //     to Q3, so ALL sub-parts of the student's chosen question are counted.
  const template = `Column,Max Marks,CO
q1a,6,co1
q1b,4,co1
q2a,10,co3
q3a,5,co2
q3b,5,co2
q4a,6,co4
q4b,4,co4
q5a,10,co5
q6a,5,co6
q6b,5,co6
q7a,10,co1
q8a,5,co2
q8b,5,co2`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="co-mapping-template.csv"');
  res.send(template);
});

export default router;
