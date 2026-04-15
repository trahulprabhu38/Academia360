import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";

// Pages - Authentication
import Login from "./pages/Login";
import Register from "./pages/Register";

// Teacher Pages
import TeacherDashboard from "./pages/teacher/Dashboard";
import TeacherCourses from "./pages/teacher/Courses";
import TeacherAnalytics from "./pages/teacher/Analytics";
import TeacherCourseDetail from "./pages/teacher/CourseDetail";
import StudentAnalysis from "./pages/teacher/StudentAnalysis";

import UploadMarksNew from "./pages/teacher/UploadMarksNew";
import SEEUpload from "./pages/teacher/SEEUpload";
import StudentProgression from "./pages/teacher/StudentProgression";

import DynamicDashboard from "./pages/teacher/DynamicDashboard";
import COGenerator from "./pages/teacher/COGenerator";
import AttainmentDashboard from "./pages/teacher/AttainmentDashboard";
import CESAdmin from "./pages/teacher/CESAdmin";
import SEEQuestionMapping from "./pages/teacher/SEEQuestionMapping";

// Student Pages
import CourseExitSurvey from "./pages/student/CourseExitSurvey";
import StudentDashboard from "./pages/student/Dashboard";
import StudentCourses from "./pages/student/Courses";
import StudentCourseDetail from "./pages/student/CourseDetail";
import StudentCourseAnalytics from "./pages/student/CourseAnalytics";
import StudentEnroll from "./pages/student/Enroll";
import DBMSRecommender from "./pages/student/DBMSRecommender";

// Shared Pages
import Settings from "./pages/shared/Settings";


// Layouts
import StudentLayout from "./layouts/StudentLayout";
import TeacherLayout from "./layouts/TeacherLayout";

// Shared Components
import ProtectedRoute from "./components/shared/ProtectedRoute";

const AppContent = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: "#41644A",
                color: "#EBE1D1",
                borderRadius: "10px",
                border: "1px solid #0D4715",
              },
              success: {
                iconTheme: {
                  primary: '#41644A',
                  secondary: '#EBE1D1',
                },
                style: {
                  background: "#dae5dc",
                  color: "#0D4715",
                },
              },
              error: {
                iconTheme: {
                  primary: '#DC2626',
                  secondary: '#fff',
                },
                style: {
                  background: "#fee2e2",
                  color: "#991b1b",
                },
              },
              loading: {
                iconTheme: {
                  primary: '#E9762B',
                  secondary: '#fff',
                },
              },
            }}
          />

            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Teacher Protected Routes - Wrapped in TeacherLayout */}
              <Route
                path="/teacher/*"
                element={<ProtectedRoute requiredRole="teacher" />}
              >
                <Route element={<TeacherLayout />}>
                  <Route path="dashboard" element={<TeacherDashboard />} />
                  <Route path="courses" element={<TeacherCourses />} />
                  <Route path="courses/:id" element={<TeacherCourseDetail />} />
                  <Route path="analytics" element={<TeacherAnalytics />} />
                  <Route path="student-analysis" element={<StudentAnalysis />} />
                  {/* <Route path="analysis" element={<Analysis />} /> */}
                  <Route path="co-generator" element={<COGenerator />} />
                  <Route path="upload" element={<UploadMarksNew />} />
                  <Route path="see-upload" element={<SEEUpload />} />
                  <Route path="student-progression" element={<StudentProgression />} />
                  {/* <Route path="upload-old" element={<UploadMarks />} /> */}
                  {/* <Route path="static-analysis" element={<StaticAnalysis />} /> */}
                  <Route path="attainment/:courseId" element={<DynamicDashboard />} />
                  <Route path="courses/:id/attainment" element={<AttainmentDashboard />} />
                  <Route path="courses/:id/ces" element={<CESAdmin />} />
                  <Route path="courses/:id/see-mapping" element={<SEEQuestionMapping />} />
                  <Route path="settings" element={<Settings />} />
                  <Route index element={<Navigate to="dashboard" replace />} />
                </Route>
              </Route>

              {/* Student Protected Routes - Wrapped in StudentLayout */}
              <Route
                path="/student/*"
                element={<ProtectedRoute requiredRole="student" />}
              >
                <Route element={<StudentLayout />}>
                  <Route path="dashboard" element={<StudentDashboard />} />
                  <Route path="enroll" element={<StudentEnroll />} />
                  <Route path="courses" element={<StudentCourses />} />
                  <Route path="courses/:courseId" element={<StudentCourseDetail />} />
                  <Route path="courses/:courseId/analytics" element={<StudentCourseAnalytics />} />
                  <Route path="courses/:courseId/exit-survey" element={<CourseExitSurvey />} />
                  <Route path="dbms-recommender" element={<DBMSRecommender />} />
                  {/* <Route path="analysis" element={<Analysis />} /> */}
                  <Route path="settings" element={<Settings />} />
                  <Route index element={<Navigate to="dashboard" replace />} />
                </Route>
              </Route>

              {/* Default Redirects */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
