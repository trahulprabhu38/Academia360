import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { authenticateToken } from '../middleware/auth.js';
import coMappingService from '../services/coMappingService.js';

const router = express.Router();
const authMiddleware = authenticateToken;

// Accept CSV and Excel files
const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (ACCEPTED_EXTENSIONS.includes(ext) ||
        file.mimetype === 'text/csv' ||
        file.mimetype.includes('spreadsheet') ||
        file.mimetype.includes('excel')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV or Excel (.xlsx/.xls) files are accepted'));
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

    // Convert file buffer to CSV text (handles both .csv and .xlsx/.xls)
    let csvContent;
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.read(file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      csvContent = XLSX.utils.sheet_to_csv(ws);
    } else {
      csvContent = file.buffer.toString('utf-8');
    }

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
 * GET /api/co-mapping/template?type=cie   → CIE mapping template (Column, Max Marks, CO)
 * GET /api/co-mapping/template?type=aat   → AAT/Quiz mapping template (transposed XLSX)
 * GET /api/co-mapping/template            → defaults to AAT/Quiz template (matching mapping.xlsx)
 */
router.get('/template', (req, res) => {
  const type = (req.query.type || 'aat').toLowerCase();

  if (type === 'cie') {
    // CIE mapping: Column, Max Marks, CO (CSV)
    const template = `Column,Max Marks,CO
q1a,6,CO1
q1b,4,CO1
q2a,10,CO3
q3a,5,CO2
q3b,5,CO2
q4a,6,CO4
q4b,4,CO4
q5a,10,CO5
q6a,5,CO6
q6b,5,CO6
q7a,10,CO1
q8a,5,CO2
q8b,5,CO2`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="cie-co-mapping-template.csv"');
    return res.send(template);
  }

  // AAT/Quiz template: transposed XLSX matching mapping.xlsx format
  // Row 1 (headers): question names (aat, quiz)
  // Row 2: CO label
  // Row 3: comma-separated CO numbers per question
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['AAT', 'QUIZ'],
    ['CO', 'CO'],
    ['CO1,CO2,CO3,CO4', 'CO1,CO2,CO3,CO4']
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'CO Mapping');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="aat-quiz-co-mapping-template.xlsx"');
  res.send(buf);
});

export default router;
