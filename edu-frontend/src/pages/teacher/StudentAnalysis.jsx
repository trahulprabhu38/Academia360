import React, { useState, useEffect } from "react";
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  alpha,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
  Button,
  Tabs,
  Tab,
  Divider,
} from "@mui/material";
import { motion } from "framer-motion";
import axios from "axios";
import toast from "react-hot-toast";
import {
  TrendingUp,
  Assessment,
  School,
  EmojiEvents,
  Person,
  Calculate,
  Refresh,
  Analytics,
  PersonSearch,
} from "@mui/icons-material";
import { courseAPI, courseOutcomesAPI } from "../../services/api";
import IndividualStudentAnalysis from "../../components/teacher/IndividualStudentAnalysis";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";
const MotionBox = motion.create(Box);
const MotionCard = motion.create(Card);

const StudentAnalysis = () => {
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [detailedResults, setDetailedResults] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [coStatus, setCOStatus] = useState(null); // null | { count: number, cos: [] }

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      const response = await courseAPI.getAll();
      setCourses(response.data.data || []);
    } catch (err) {
      console.error("Error loading courses:", err);
      setError("Failed to load courses");
    }
  };

  const checkCOs = async (courseId) => {
    try {
      const res = await courseOutcomesAPI.getByCourse(courseId);
      const cos = res.data.cos || [];
      setCOStatus({ count: cos.length, cos });
      return cos.length > 0;
    } catch (err) {
      console.error('CO check failed:', err.response?.data || err.message);
      setCOStatus(null);
      return false;
    }
  };

  const runCalculations = async () => {
    if (!selectedCourse) {
      toast.error("Please select a course first");
      return;
    }

    try {
      setCalculating(true);
      const token = localStorage.getItem("token");

      console.log("🚀 TRIGGERING DETAILED CALCULATIONS FOR COURSE:", selectedCourse);

      const response = await axios.post(
        `${API_URL}/detailed-calculations/course/${selectedCourse}/calculate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("✅ CALCULATION RESPONSE:", response.data);

      toast.success("Calculations completed successfully!");

      // Load results after calculation
      await loadDetailedResults(selectedCourse);
    } catch (err) {
      console.error("❌ CALCULATION ERROR:", err);
      console.error("Error response:", err.response?.data);

      const errorMsg = err.response?.data?.details || err.response?.data?.error || err.message;

      // Check if error is related to missing CO mappings or COs
      if (errorMsg.includes("CO mapping") ||
          errorMsg.includes("course outcome") ||
          errorMsg.includes("upload CO mapping CSV") ||
          errorMsg.toLowerCase().includes("no numeric question columns")) {
        toast.error(
          "⚠️ Course Outcomes (COs) or CO mappings are missing!\n\n" +
          "Please:\n" +
          "1. Upload Course Outcomes (COs) for this course\n" +
          "2. Upload CO mapping CSV that maps questions to COs\n" +
          "3. Then run calculations again",
          { duration: 7000 }
        );
      } else {
        toast.error(`Calculation failed: ${errorMsg}`);
      }
    } finally {
      setCalculating(false);
    }
  };

  const loadDetailedResults = async (courseId) => {
    if (!courseId) return;

    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem("token");

      console.log("📊 LOADING DETAILED RESULTS FOR COURSE:", courseId);

      // Fetch complete report with all calculation results
      const response = await axios.get(
        `${API_URL}/detailed-calculations/course/${courseId}/complete-report`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("✅ DETAILED RESULTS LOADED:", response.data);

      const data = response.data.data;

      // Check if we have data
      if (!data.verticalAnalysis?.length && !data.horizontalAnalysis?.length && !data.finalCIE?.length) {
        console.warn("⚠️ NO CALCULATION DATA FOUND!");
        setError("No calculation results found. Please click 'Run Calculations' button to process the uploaded marksheets.");
        setDetailedResults(null);
      } else {
        console.log(detailedResults)

        console.log("📈 Data Summary:");
        console.log("  - Vertical Analysis:", data.verticalAnalysis.length, "questions");
        console.log("  - Horizontal Analysis:", data.horizontalAnalysis.length, "records");
        console.log("  - File Summaries:", data.fileSummary.length);
        console.log("  - CO Level Analysis:", data.coLevelAnalysis.length);
        console.log("  - Final CIE:", data.finalCIE.length, "students");
        console.log("  - Combined CO Attainment:", data.combinedCOAttainment.length);

        setDetailedResults(data);
        setError(null);
      }
    } catch (err) {
      console.error("❌ ERROR loading detailed results:", err);
      console.error("Error response:", err.response?.data);
      setError(`Failed to load results: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCourse) {
      setCOStatus(null);
      checkCOs(selectedCourse);
      loadDetailedResults(selectedCourse);
    } else {
      setCOStatus(null);
    }
  }, [selectedCourse]);

  const getGradeColor = (grade) => {
    const colors = {
      S: "#4caf50",
      A: "#8bc34a",
      B: "#ffc107",
      C: "#ff9800",
      D: "#ff5722",
      E: "#f44336",
      F: "#d32f2f",
    };
    return colors[grade] || "#9e9e9e";
  };

  const getAttainmentColor = (percentage) => {
    if (percentage >= 80) return "#4caf50";
    if (percentage >= 70) return "#8bc34a";
    if (percentage >= 60) return "#ffc107";
    return "#ff5722";
  };

  // Group data by assessment type for display
  const groupByAssessment = (data, key) => {
    if (!data) return {};
    return data.reduce((acc, item) => {
      const type = item.assessment_type || 'OTHER';
      if (!acc[type]) acc[type] = [];
      acc[type].push(item);
      return acc;
    }, {});
  };

  const verticalByAssessment = groupByAssessment(detailedResults?.verticalAnalysis);
  const coLevelByAssessment = groupByAssessment(detailedResults?.coLevelAnalysis);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: (theme) =>
          theme.palette.mode === "dark"
            ? "linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)"
            : "#EBE1D1",
        py: 4,
      }}
    >
      <Container maxWidth="xl">
        <MotionBox
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          sx={{ mb: 4 }}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Box>
              <Typography variant="h4" fontWeight="bold" gutterBottom>
                <Analytics sx={{ mr: 1, verticalAlign: "middle" }} />
                Detailed Attainment Analysis
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Comprehensive vertical/horizontal calculations with CO/PO attainment results
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              startIcon={calculating ? <CircularProgress size={20} color="inherit" /> : <Calculate />}
              onClick={runCalculations}
              disabled={!selectedCourse || calculating}
              sx={{
                background: "linear-gradient(135deg, #41644A 0%, #0D4715 100%)",
                px: 4,
                py: 1.5,
              }}
            >
              {calculating ? "Calculating..." : "Run Calculations"}
            </Button>
          </Box>
        </MotionBox>

        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          sx={{ mb: 4 }}
        >
          <CardContent>
            <FormControl fullWidth>
              <InputLabel>Select Course</InputLabel>
              <Select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                label="Select Course"
              >
                {courses.map((course) => (
                  <MenuItem key={course.id} value={course.id}>
                    {course.name} ({course.code})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </CardContent>
        </MotionCard>

        {/* CO status banner — shown as soon as a course is selected */}
        {selectedCourse && coStatus !== null && (
          <Alert
            severity={coStatus.count > 0 ? "success" : "error"}
            sx={{ mb: 3 }}
          >
            {coStatus.count > 0
              ? `✅ Course Outcomes uploaded — ${coStatus.count} CO${coStatus.count !== 1 ? "s" : ""} defined (${coStatus.cos.map(c => `CO${c.co_number}`).join(", ")}). Ready to run calculations.`
              : "⚠️ No Course Outcomes (COs) are defined for this course. Please upload COs before running calculations."}
          </Alert>
        )}

        {error && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {loading && (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
            <CircularProgress size={60} />
          </Box>
        )}

        {!loading && detailedResults && (
          <>
            {/* Summary Stats */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={6} md={3}>
                <MotionCard
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  sx={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white" }}
                >
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography variant="h4" fontWeight="bold">
                          {detailedResults.fileSummary?.length || 0}
                        </Typography>
                        <Typography variant="body2">Assessments</Typography>
                      </Box>
                      <Assessment sx={{ fontSize: 48, opacity: 0.3 }} />
                    </Box>
                  </CardContent>
                </MotionCard>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <MotionCard
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  sx={{ background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)", color: "white" }}
                >
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography variant="h4" fontWeight="bold">
                          {detailedResults.combinedCOAttainment?.length || 0}
                        </Typography>
                        <Typography variant="body2">Course Outcomes</Typography>
                      </Box>
                      <TrendingUp sx={{ fontSize: 48, opacity: 0.3 }} />
                    </Box>
                  </CardContent>
                </MotionCard>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <MotionCard
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  sx={{ background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)", color: "white" }}
                >
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography variant="h4" fontWeight="bold">
                          {detailedResults.finalCIE?.length || 0}
                        </Typography>
                        <Typography variant="body2">Students</Typography>
                      </Box>
                      <Person sx={{ fontSize: 48, opacity: 0.3 }} />
                    </Box>
                  </CardContent>
                </MotionCard>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <MotionCard
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  sx={{ background: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)", color: "white" }}
                >
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography variant="h4" fontWeight="bold">
                            {
                              detailedResults?.combinedCOAttainment?.length > 0
                                ? (
                                    detailedResults.combinedCOAttainment.reduce(
                                      (sum, co) => sum + Number(co?.overall_co_attainment_percent || 0),
                                      0
                                    ) / detailedResults.combinedCOAttainment.length
                                  ).toFixed(1)
                                : "0"
                            }%
                        </Typography>
                        <Typography variant="body2">Avg CO Attainment</Typography>
                      </Box>
                      <EmojiEvents sx={{ fontSize: 48, opacity: 0.3 }} />
                    </Box>
                  </CardContent>
                </MotionCard>
              </Grid>
            </Grid>

            {/* Tabbed Content */}
            <MotionCard
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              sx={{ mb: 4 }}
            >
              <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tab label="Final CIE Results" />
                <Tab label="CO Attainment" />
                <Tab label="Vertical Analysis" />
                <Tab label="File Statistics" />
                <Tab label="Individual Student Analysis" icon={<PersonSearch />} iconPosition="start" />
              </Tabs>
                            
              {/* Tab 0: Final CIE Results */}
              {activeTab === 0 && (
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Final CIE Composition (CIE1 + CIE2 + CIE3 + AAT + QUIZ)
                  </Typography>
                  <TableContainer component={Paper} elevation={0} sx={{ mt: 2, maxHeight: 600 }}>
                    <Table stickyHeader size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1) }}>
                          <TableCell><strong>Rank</strong></TableCell>
                          <TableCell><strong>USN</strong></TableCell>
                          <TableCell><strong>Name</strong></TableCell>
                          <TableCell align="center"><strong>CIE1 (30)</strong></TableCell>
                          <TableCell align="center"><strong>CIE2 (30)</strong></TableCell>
                          <TableCell align="center"><strong>CIE3 (30)</strong></TableCell>
                          <TableCell align="center"><strong>Avg CIE</strong></TableCell>
                          <TableCell align="center"><strong>AAT</strong></TableCell>
                          <TableCell align="center"><strong>QUIZ</strong></TableCell>
                          <TableCell align="center"><strong>Final Total</strong></TableCell>
                          <TableCell align="center"><strong>Final %</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detailedResults.finalCIE?.map((student, index) => (
                          <TableRow key={student.id} hover>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell><Chip label={student.usn} size="small" variant="outlined" /></TableCell>
                            <TableCell>{student.student_name}</TableCell>
                            <TableCell align="center">{parseFloat(student.scaled_cie1 || 0).toFixed(2)}</TableCell>
                            <TableCell align="center">{parseFloat(student.scaled_cie2 || 0).toFixed(2)}</TableCell>
                            <TableCell align="center">{parseFloat(student.scaled_cie3 || 0).toFixed(2)}</TableCell>
                            <TableCell align="center">
                              <Typography variant="body2" fontWeight="bold" color="primary">
                                {parseFloat(student.avg_cie_scaled || 0).toFixed(2)}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">{parseFloat(student.aat_marks || 0).toFixed(2)}</TableCell>
                            <TableCell align="center">{parseFloat(student.quiz_marks || 0).toFixed(2)}</TableCell>
                            <TableCell align="center">
                              <Typography variant="body2" fontWeight="bold">
                                {parseFloat(student.final_cie_total || 0).toFixed(2)}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(parseFloat(student.final_cie_percentage || 0), 100)}
                                sx={{ height: 8, borderRadius: 4, mb: 0.5 }}
                              />
                              <Typography variant="caption" fontWeight="bold">
                                {parseFloat(student.final_cie_percentage || 0).toFixed(1)}%
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              )}

              {/* Tab 1: CO Attainment */}
              {activeTab === 1 && (
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Combined CO Attainment (Across CIE1, CIE2, CIE3)
                  </Typography>
                  <TableContainer component={Paper} elevation={0} sx={{ mt: 2 }}>
                    <Table>
                      <TableHead>
                        <TableRow sx={{ bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.1) }}>
                          <TableCell><strong>CO</strong></TableCell>
                          <TableCell><strong>Description</strong></TableCell>
                          <TableCell><strong>Bloom Level</strong></TableCell>
                          <TableCell align="center"><strong>Total Max Marks</strong></TableCell>
                          <TableCell align="center"><strong>Total Attempts</strong></TableCell>
                          <TableCell align="center"><strong>Above Threshold</strong></TableCell>
                          <TableCell align="center"><strong>CO Attainment %</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detailedResults.combinedCOAttainment?.map((co) => {
                          const attainment = parseFloat(co.overall_co_attainment_percent || 0);
                          return (
                            <TableRow key={co.co_id}>
                              <TableCell>
                                <Chip label={`CO${co.co_number}`} color="primary" />
                              </TableCell>
                              <TableCell>{co.co_description}</TableCell>
                              <TableCell>
                                <Chip label={co.bloom_level || 'N/A'} size="small" variant="outlined" />
                              </TableCell>
                              <TableCell align="center">{parseFloat(co.total_co_max_marks || 0).toFixed(0)}</TableCell>
                              <TableCell align="center">{co.total_co_attempts || 0}</TableCell>
                              <TableCell align="center">{co.total_students_above_threshold || 0}</TableCell>
                              <TableCell align="center">
                                <Box>
                                  <Typography variant="body2" fontWeight="bold" sx={{ color: getAttainmentColor(attainment) }}>
                                    {attainment.toFixed(2)}%
                                  </Typography>
                                  <LinearProgress
                                    variant="determinate"
                                    value={Math.min(attainment, 100)}
                                    sx={{
                                      mt: 0.5,
                                      height: 6,
                                      borderRadius: 3,
                                      "& .MuiLinearProgress-bar": {
                                        bgcolor: getAttainmentColor(attainment),
                                      },
                                    }}
                                  />
                                </Box>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <Divider sx={{ my: 4 }} />

                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    CO Attainment Per Assessment
                  </Typography>
                  {Object.keys(coLevelByAssessment).map((assessmentType) => (
                    <Box key={assessmentType} sx={{ mb: 3 }}>
                      <Typography variant="subtitle1" fontWeight="bold" color="primary.main" gutterBottom>
                        {assessmentType}
                      </Typography>
                      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ bgcolor: 'grey.100' }}>
                              <TableCell><strong>CO</strong></TableCell>
                              <TableCell align="center"><strong>Max Marks</strong></TableCell>
                              <TableCell align="center"><strong>Attempts</strong></TableCell>
                              <TableCell align="center"><strong>Above 60%</strong></TableCell>
                              <TableCell align="center"><strong>Attainment %</strong></TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {coLevelByAssessment[assessmentType].map((co) => (
                              <TableRow key={co.id}>
                                <TableCell>CO{co.co_number}</TableCell>
                                <TableCell align="center">{parseFloat(co.co_max_marks).toFixed(0)}</TableCell>
                                <TableCell align="center">{co.co_attempts}</TableCell>
                                <TableCell align="center">{co.co_students_above_threshold}</TableCell>
                                <TableCell align="center">
                                  <Chip
                                    label={`${parseFloat(co.co_attainment_percent).toFixed(1)}%`}
                                    size="small"
                                    color={parseFloat(co.co_attainment_percent) >= 60 ? "success" : "warning"}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  ))}
                </CardContent>
              )}

              {/* Tab 2: Vertical Analysis */}
              {activeTab === 2 && (
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    Per-Question Vertical Analysis (Column-wise)
                  </Typography>
                  {Object.keys(verticalByAssessment).map((assessmentType) => (
                    <Box key={assessmentType} sx={{ mb: 3 }}>
                      <Typography variant="subtitle1" fontWeight="bold" color="primary.main" gutterBottom>
                        {assessmentType}
                      </Typography>
                      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', maxHeight: 400 }}>
                        <Table stickyHeader size="small">
                          <TableHead>
                            <TableRow sx={{ bgcolor: 'grey.100' }}>
                              <TableCell><strong>Question</strong></TableCell>
                              <TableCell><strong>CO</strong></TableCell>
                              <TableCell align="center"><strong>Max</strong></TableCell>
                              <TableCell align="center"><strong>Attempts (A)</strong></TableCell>
                              <TableCell align="center"><strong>Avg Marks</strong></TableCell>
                              <TableCell align="center"><strong>Threshold (60%)</strong></TableCell>
                              <TableCell align="center"><strong>Above (B)</strong></TableCell>
                              <TableCell align="center"><strong>Attainment (B/A%)</strong></TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {verticalByAssessment[assessmentType].map((q) => (
                              <TableRow key={q.id} hover>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{q.question_column}</TableCell>
                                <TableCell>
                                  <Chip label={`CO${q.co_number || 'N/A'}`} size="small" />
                                </TableCell>
                                <TableCell align="center">{parseFloat(q.max_marks).toFixed(0)}</TableCell>
                                <TableCell align="center">{q.attempts_count}</TableCell>
                                <TableCell align="center">{parseFloat(q.vertical_avg).toFixed(2)}</TableCell>
                                <TableCell align="center">{parseFloat(q.threshold_60pct).toFixed(2)}</TableCell>
                                <TableCell align="center">{q.students_above_threshold}</TableCell>
                                <TableCell align="center">
                                  <Chip
                                    label={`${parseFloat(q.co_attainment_percent).toFixed(1)}%`}
                                    size="small"
                                    sx={{
                                      bgcolor: getAttainmentColor(parseFloat(q.co_attainment_percent)),
                                      color: 'white',
                                      fontWeight: 'bold'
                                    }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  ))}
                </CardContent>
              )}

              {/* Tab 3: File Statistics */}
              {activeTab === 3 && (
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    File-Level Summary Statistics
                  </Typography>
                  <Grid container spacing={2}>
                    {detailedResults.fileSummary?.map((file) => (
                      <Grid item xs={12} md={6} key={file.id}>
                        <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
                          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                            <Typography variant="h6" fontWeight="bold">
                              {file.assessment_name}
                            </Typography>
                            <Chip label={file.assessment_type} color="primary" />
                          </Box>
                          <Grid container spacing={2}>
                            <Grid item xs={6}>
                              <Typography variant="body2" color="text.secondary">Total Students</Typography>
                              <Typography variant="h6">{file.total_students}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="body2" color="text.secondary">Max Marks</Typography>
                              <Typography variant="h6">{parseFloat(file.max_marks_possible).toFixed(0)}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="body2" color="text.secondary">Avg Marks</Typography>
                              <Typography variant="h6" color="primary.main">{parseFloat(file.avg_marks).toFixed(2)}</Typography>
                            </Grid>
                            <Grid item xs={6}>
                              <Typography variant="body2" color="text.secondary">Avg %</Typography>
                              <Typography variant="h6" color="success.main">{parseFloat(file.avg_percentage).toFixed(2)}%</Typography>
                            </Grid>
                            {file.scaling_factor && file.scaling_factor !== 1 && (
                              <>
                                <Grid item xs={12}>
                                  <Divider />
                                </Grid>
                                <Grid item xs={4}>
                                  <Typography variant="body2" color="text.secondary">Original Max</Typography>
                                  <Typography variant="body2" fontWeight="bold">{parseFloat(file.original_max).toFixed(0)}</Typography>
                                </Grid>
                                <Grid item xs={4}>
                                  <Typography variant="body2" color="text.secondary">Scaled Max</Typography>
                                  <Typography variant="body2" fontWeight="bold">{parseFloat(file.scaled_max).toFixed(0)}</Typography>
                                </Grid>
                                <Grid item xs={4}>
                                  <Typography variant="body2" color="text.secondary">Factor</Typography>
                                  <Typography variant="body2" fontWeight="bold">{parseFloat(file.scaling_factor).toFixed(2)}</Typography>
                                </Grid>
                              </>
                            )}
                          </Grid>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </CardContent>
              )}

              {/* Tab 4: Individual Student Analysis */}
              {activeTab === 4 && (
                <CardContent>
                  <IndividualStudentAnalysis courseId={selectedCourse} />
                </CardContent>
              )}
            </MotionCard>
          </>
        )}

        {!loading && !detailedResults && !error && selectedCourse && (
          <Alert severity="info" sx={{ textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom>Ready to Calculate</Typography>
            <Typography variant="body2" gutterBottom>
              Click the "Run Calculations" button above to process the uploaded marksheets and generate detailed attainment analysis.
            </Typography>
          </Alert>
        )}

        {!loading && !detailedResults && !error && !selectedCourse && (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
            <Typography variant="h6" color="text.secondary">
              Please select a course to view analysis
            </Typography>
          </Box>
        )}
      </Container>
    </Box>
  );
};

export default StudentAnalysis;
