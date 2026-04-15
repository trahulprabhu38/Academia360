import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Authentication APIs
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (data) => api.post('/auth/register', data),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data) => api.put('/auth/profile', data),
};

// Course APIs
export const courseAPI = {
  getAll: (params) => api.get('/courses', { params }),
  getById: (id) => api.get(`/courses/${id}`),
  create: (data) => api.post('/courses', data),
  update: (id, data) => api.put(`/courses/${id}`, data),
  delete: (id) => api.delete(`/courses/${id}`),
  enrollStudents: (id, studentIds) => api.post(`/courses/${id}/enroll`, { studentIds }),
  getEnrolledStudents: (id) => api.get(`/courses/${id}/students`),
  getAnalytics: (id) => api.get(`/courses/${id}/analytics`),
  getDashboard: () => api.get('/courses/dashboard'),
  getEnrollments: () => api.get('/courses/enrollments'),
  saveCourseOutcomes: (courseId, outcomes) => api.post(`/courses/${courseId}/outcomes`, { course_outcomes: outcomes }),
  getCourseOutcomes: (courseId) => api.get(`/courses/${courseId}/outcomes`),
};

// Assessment APIs
export const assessmentAPI = {
  create: (data) => api.post('/assessments', data),
  getByCourse: (courseId) => api.get(`/assessments/course/${courseId}`),
  createQuestion: (data) => api.post('/assessments/questions', data),
  getQuestions: (assessmentId) => api.get(`/assessments/${assessmentId}/questions`),
  calculateAttainment: (courseId, assessmentId, threshold) =>
    api.post(`/assessments/course/${courseId}/assessment/${assessmentId}/calculate`, null, {
      params: { threshold },
    }),
  getCOAttainment: (courseId) => api.get(`/assessments/course/${courseId}/co-attainment`),
  getPOAttainment: (courseId) => api.get(`/assessments/course/${courseId}/po-attainment`),
};

// Upload APIs
export const uploadAPI = {
  uploadAssessment: (file, assessmentId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('assessmentId', assessmentId);
    return api.post('/upload/assessment', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  bulkEnroll: (file, courseId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('courseId', courseId);
    return api.post('/upload/enroll', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  downloadTemplate: () => api.get('/upload/template', { responseType: 'blob' }),
};

// Student APIs
export const studentAPI = {
  getCourses: () => api.get('/students/courses'),
  enroll: (data) => api.post('/students/enroll', data),
  getScores: (courseId) => api.get(`/students/courses/${courseId}/scores`),
  getCOPerformance: (courseId) => api.get(`/students/courses/${courseId}/co-performance`),
  getPOPerformance: (courseId) => api.get(`/students/courses/${courseId}/po-performance`),
  getAnalytics: (courseId) => api.get(`/students/courses/${courseId}/analytics`),
  getMarks: (courseId) => api.get(`/students/courses/${courseId}/marks`),
  getCOAttainment: (courseId) => api.get(`/students/courses/${courseId}/co-attainment`),
};

// Recommendation System APIs
const REC_SYS_URL = import.meta.env.VITE_RECOMMENDATION_SERVICE_URL || 'http://localhost:8003';
const recSysAPI = axios.create({
  baseURL: REC_SYS_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const recommendationAPI = {
  // Get recommendations for a student
  getRecommendations: (data) => recSysAPI.post('/api/recommendations/student', data),
  
  // Feedback endpoints
  voteResource: (data) => recSysAPI.post('/api/feedback/vote', data),
  submitFeedback: (data) => recSysAPI.post('/api/feedback/rating', data),
  markComplete: (data) => recSysAPI.post('/api/feedback/completion', data),
  
  // Analytics endpoints
  getAnalytics: () => recSysAPI.get('/api/analytics/overview'),
  getStudentProgress: (studentId) => recSysAPI.get(`/api/analytics/student/${studentId}/progress`),
  
  // Study plan endpoint
  getStudyPlan: (data) => recSysAPI.post('/api/recommendations/study-plan', data),
  
  // Additional endpoints
  getCourseSummary: (courseId, internalNo) => 
    recSysAPI.get(`/api/recommendations/course/${courseId}/recommendations-summary?internal_no=${internalNo}`),
};

// Marksheet APIs
export const marksheetAPI = {
  create: (data) => api.post('/marksheets', data),
  getByCourse: (courseId) => api.get(`/marksheets/course/${courseId}`),
  getById: (id) => api.get(`/marksheets/${id}`),
  getData: (id, params) => api.get(`/marksheets/${id}/data`, { params }),
  delete: (id) => api.delete(`/marksheets/${id}`),
  update: (id, data) => api.put(`/marksheets/${id}`, data),
};

// AI-Generated Course Outcomes APIs
export const aiCOAPI = {
  save: (data) => api.post('/ai-cos/save', data),
  getByCourse: (courseId) => api.get(`/ai-cos/course/${courseId}`),
  getSessions: (courseId) => api.get(`/ai-cos/sessions/${courseId}`),
  submitFeedback: (data) => api.post('/ai-cos/feedback', data),
  saveRegeneration: (data) => api.post('/ai-cos/regenerate', data),
  getStatistics: (courseId) => api.get(`/ai-cos/statistics/${courseId}`),
  delete: (coId) => api.delete(`/ai-cos/${coId}`),
};

// Course Outcomes APIs (both manual and AI-generated)
export const courseOutcomesAPI = {
  getByCourse: (courseId) => api.get(`/course-outcomes/course/${courseId}`),
  createManual: (data) => api.post('/course-outcomes/manual', data),
  update: (coId, data) => api.put(`/course-outcomes/${coId}`, data),
  delete: (coId) => api.delete(`/course-outcomes/${coId}`),
  deleteAll: (courseId) => api.delete(`/course-outcomes/course/${courseId}/all`),
};

// SEE Marks APIs
export const seeMarksAPI = {
  uploadMarks: (courseId, marksData) => api.post(`/see-marks/courses/${courseId}/upload`, { marksData }),
  getByCourse: (courseId) => api.get(`/see-marks/courses/${courseId}`),
  getByStudent: (studentId, courseId) => api.get(`/see-marks/students/${studentId}/courses/${courseId}`),
  update: (studentId, courseId, see_marks) => api.put(`/see-marks/students/${studentId}/courses/${courseId}`, { see_marks }),
  delete: (studentId, courseId) => api.delete(`/see-marks/students/${studentId}/courses/${courseId}`),
  getStatus: (courseId) => api.get(`/see-marks/courses/${courseId}/status`),
  validate: (marksData) => api.post('/see-marks/validate', { marksData }),
};

// Grade Calculation APIs
export const gradesAPI = {
  calculateGrade: (studentId, courseId) => api.post(`/grades/students/${studentId}/courses/${courseId}/calculate`),
  calculateAllGrades: (courseId) => api.post(`/grades/courses/${courseId}/calculate`),
  getGrade: (studentId, courseId) => api.get(`/grades/students/${studentId}/courses/${courseId}`),
  getCourseGrades: (courseId) => api.get(`/grades/courses/${courseId}`),
  getDistribution: (courseId) => api.get(`/grades/courses/${courseId}/distribution`),
  getStudentGrades: (studentId) => api.get(`/grades/students/${studentId}`),
};

// CGPA/SGPA APIs
export const cgpaAPI = {
  calculateCGPA: (studentId) => api.post(`/cgpa/students/${studentId}/calculate`),
  calculateSGPA: (studentId, semester, academic_year) => api.post(`/cgpa/students/${studentId}/semester/${semester}/calculate`, { academic_year }),
  getCGPA: (studentId) => api.get(`/cgpa/students/${studentId}`),
  getSGPA: (studentId, semester) => api.get(`/cgpa/students/${studentId}/semester/${semester}`),
  getRank: (studentId, department) => api.get(`/cgpa/students/${studentId}/rank`, { params: { department } }),
  recalculateAll: () => api.post('/cgpa/recalculate-all'),
  getTopPerformers: (department, limit) => api.get('/cgpa/top-performers', { params: { department, limit } }),
};

// Progression Tracking APIs
export const progressionAPI = {
  getStudentProgression: (studentId) => api.get(`/progression/students/${studentId}`),
  getSemesterDetails: (studentId, semester) => api.get(`/progression/students/${studentId}/semester/${semester}`),
  getCourseStudents: (courseId) => api.get(`/progression/courses/${courseId}/students`),
  getSemesterStatistics: (semester, department) => api.get(`/progression/semester/${semester}/statistics`, { params: { department } }),
  exportProgression: (studentId, format) => api.get(`/progression/students/${studentId}/export`, { params: { format } }),
  getProgressionSummary: (studentId) => api.get(`/progression/students/${studentId}/summary`),
  getDepartmentOverview: (department) => api.get(`/progression/department/${department}/overview`),
};

// Materials APIs
export const materialsAPI = {
  // Folder operations
  createFolder: (courseId, data) => api.post(`/materials/courses/${courseId}/folders`, data),
  deleteFolder: (folderId) => api.delete(`/materials/folders/${folderId}`),

  // Material operations
  getMaterials: (courseId, folderId) => api.get(`/materials/courses/${courseId}/materials`, { params: { folderId } }),
  uploadMaterial: (courseId, formData) => api.post(`/materials/courses/${courseId}/materials/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  downloadMaterial: (materialId) => api.get(`/materials/materials/${materialId}/download`, { responseType: 'blob' }),
  deleteMaterial: (materialId) => api.delete(`/materials/materials/${materialId}`),
};

// Chat APIs
export const chatAPI = {
  getMessages: (courseId, params) => api.get(`/chat/courses/${courseId}/messages`, { params }),
  sendMessage: (courseId, data) => api.post(`/chat/courses/${courseId}/messages`, data),
  deleteMessage: (messageId) => api.delete(`/chat/messages/${messageId}`),
};

// ── V2 Attainment APIs ────────────────────────────────────────────────────────
export const attainmentV2API = {
  // Full pipeline recalculation
  recalculate: (courseId) => api.post(`/attainment/course/${courseId}/recalculate`),

  // Final CO attainment with breakdown
  getCOFinal: (courseId) => api.get(`/attainment/course/${courseId}/co-final`),

  // PO attainment
  getPOFinal: (courseId) => api.get(`/attainment/course/${courseId}/po-final`),

  // PSO attainment
  getPSO: (courseId) => api.get(`/attainment/course/${courseId}/pso`),

  // Full CO-PO-PSO matrix
  getMatrix: (courseId) => api.get(`/attainment/course/${courseId}/co-po-pso-matrix`),

  // Attainment config
  getConfig: (courseId) => api.get(`/attainment/course/${courseId}/config`),
  updateConfig: (courseId, data) => api.put(`/attainment/course/${courseId}/config`, data),

  // Student attainment
  getAllStudentsAttainment: (courseId) => api.get(`/attainment/course/${courseId}/student-attainment`),
  getStudentAttainment: (courseId, studentId) => api.get(`/attainment/course/${courseId}/students/${studentId}/attainment`),
  getMyAttainment: (courseId) => api.get(`/attainment/course/${courseId}/my-attainment`),
};

// ── CES APIs ──────────────────────────────────────────────────────────────────
export const cesAPI = {
  // Questions (teacher)
  createQuestions: (courseId, questions) => api.post(`/ces/course/${courseId}/questions`, { questions }),
  getQuestions: (courseId) => api.get(`/ces/course/${courseId}/questions`),
  setActive: (courseId, is_active) => api.patch(`/ces/course/${courseId}/activate`, { is_active }),

  // Student survey
  submitResponses: (courseId, responses) => api.post(`/ces/course/${courseId}/respond`, { responses }),
  checkSubmitted: (courseId) => api.get(`/ces/course/${courseId}/submitted`),

  // Attainment
  calculateCES: (courseId) => api.post(`/ces/course/${courseId}/calculate`),
  getCESAttainment: (courseId) => api.get(`/ces/course/${courseId}/attainment`),
  uploadManualCES: (courseId, results) => api.post(`/ces/course/${courseId}/manual-upload`, { results }),

  // SEE question mapping
  saveSEEMapping: (courseId, mappings) => api.post(`/ces/see-mapping/course/${courseId}`, { mappings }),
  getSEEMapping: (courseId) => api.get(`/ces/see-mapping/course/${courseId}`),
  saveSEEScores: (courseId, scores) => api.post(`/ces/see-scores/course/${courseId}`, { scores }),

  // PSO
  getPSOOutcomes: () => api.get('/ces/pso-outcomes'),
  saveCOPSOMapping: (courseId, mappings) => api.post(`/ces/co-pso-mapping/course/${courseId}`, { mappings }),
  getCOPSOMapping: (courseId) => api.get(`/ces/co-pso-mapping/course/${courseId}`),
};

export default api;
