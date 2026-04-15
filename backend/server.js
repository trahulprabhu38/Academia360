import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { testConnection as testPostgres } from './config/db.js';
import { connectMongoDB } from './config/mongodb.js';
import logger, { requestLogger } from './middleware/logging.js';
import { initializeSocket } from './config/socket.js';

// Import routes
import authRoutes from './routes/auth.js';
import courseRoutes from './routes/courses.js';
import assessmentRoutes from './routes/assessments.js';
import uploadRoutes from './routes/upload.js';
import studentRoutes from './routes/students.js';
import marksheetRoutes from './routes/marksheets.js';
import aiCORoutes from './routes/aiCourseOutcomes.js';
import courseOutcomesRoutes from './routes/courseOutcomes.js';
import attainmentRoutes from './routes/attainment.js';
import detailedCalculationsRoutes from './routes/detailedCalculations.js';
import coMappingRoutes from './routes/coMapping.js';
import seeMarksRoutes from './routes/seeMarks.js';
import gradesRoutes from './routes/grades.js';
import cgpaRoutes from './routes/cgpa.js';
import progressionRoutes from './routes/progression.js';
import semesterSubjectsRoutes from './routes/semesterSubjects.js';
import materialsRoutes from './routes/materials.js';
import chatRoutes from './routes/chat.js';
import cesRoutes from './routes/ces.js';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('dev')); // HTTP request logging (keep for console visibility)
app.use(requestLogger); // Comprehensive request/response logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'OBE Backend API is running',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/marksheets', marksheetRoutes);
app.use('/api/ai-cos', aiCORoutes);
app.use('/api/course-outcomes', courseOutcomesRoutes);
app.use('/api/attainment', attainmentRoutes);
app.use('/api/detailed-calculations', detailedCalculationsRoutes);
app.use('/api/co-mapping', coMappingRoutes);
app.use('/api/see-marks', seeMarksRoutes);
app.use('/api/grades', gradesRoutes);
app.use('/api/cgpa', cgpaRoutes);
app.use('/api/progression', progressionRoutes);
app.use('/api/semester-subjects', semesterSubjectsRoutes);
app.use('/api/teacher', courseRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ces', cesRoutes);


// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Global error handler', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    user_id: req.user?.id || null,
    status: err.status || 500
  });

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize databases and start server
const startServer = async () => {
  try {
    logger.info('='.repeat(80));
    logger.info('🚀 Starting OBE Backend Server');
    logger.info('='.repeat(80));

    // Test PostgreSQL connection
    logger.info('📊 Connecting to PostgreSQL...');
    try {
      const pgConnected = await testPostgres();
      if (pgConnected) {
        logger.info('✅ PostgreSQL connected');
      } else {
        logger.warn('⚠️ PostgreSQL connection failed - server will start anyway');
        logger.warn('   Some features may not work without database connection');
        logger.warn('   To fix: docker-compose up -d postgres mongodb');
      }
    } catch (err) {
      logger.warn('⚠️ PostgreSQL connection error:', err.message);
      logger.warn('   Server will start anyway, but database features will be unavailable');
    }

    // Connect to MongoDB
    logger.info('📊 Connecting to MongoDB...');
    try {
      await connectMongoDB();
      logger.info('✅ MongoDB connected');
    } catch (err) {
      logger.warn('⚠️ MongoDB connection failed:', err.message);
      logger.warn('   Server will start anyway, but some features may not work');
      logger.warn('   To fix: docker-compose up -d mongodb');
    }

    // Initialize Socket.io
    logger.info('🔌 Initializing Socket.io...');
    initializeSocket(server);
    logger.info('✅ Socket.io initialized');

    // Start Express server
    server.listen(PORT, () => {
      logger.info('='.repeat(80));
      logger.info('✅ OBE Backend Server Ready!');
      logger.info(`   - Port: ${PORT}`);
      logger.info(`   - API: http://localhost:${PORT}`);
      logger.info(`   - Health: http://localhost:${PORT}/health`);
      logger.info(`   - Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info('='.repeat(80));
      logger.info('📚 Available Routes:');
      logger.info('   - POST   /api/auth/register');
      logger.info('   - POST   /api/auth/login');
      logger.info('   - GET    /api/auth/profile');
      logger.info('   - GET    /api/courses');
      logger.info('   - POST   /api/courses');
      logger.info('   - POST   /api/courses/create-or-get');
      logger.info('   - GET    /api/courses/:id');
      logger.info('   - POST   /api/assessments');
      logger.info('   - POST   /api/upload/assessment');
      logger.info('   - GET    /api/upload/template');
      logger.info('   - GET    /api/students/courses');
      logger.info('   - GET    /api/students/courses/:courseId/analytics');
      logger.info('='.repeat(80));
    });
  } catch (error) {
    logger.error('❌ Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();

export default app;
