import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Alert,
  AlertTitle,
  Divider,
  CircularProgress,
  alpha,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
} from '@mui/material';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import {
  TrendingDown,
  TrendingUp,
  Warning,
  CheckCircle,
  EmojiEvents,
  School,
  Assessment as AssessmentIcon,
  ExpandMore as ExpandMoreIcon,
  Info as InfoIcon,
  CheckCircleOutline,
  RadioButtonUnchecked,
  Calculate,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

const COLORS = ['#4caf50', '#2196f3', '#ff9800', '#f44336', '#9c27b0', '#00bcd4'];

const IndividualStudentAnalysis = ({ courseId }) => {
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [studentData, setStudentData] = useState(null);
  const [seeMarks, setSeeMarks] = useState(null);
  const [finalGrade, setFinalGrade] = useState(null);
  const [selectedCIE, setSelectedCIE] = useState(null);
  const [highlightedCOs, setHighlightedCOs] = useState([]);

  useEffect(() => {
    if (courseId) {
      loadStudents();
    }
  }, [courseId]);

  useEffect(() => {
    if (selectedStudent) {
      loadStudentPerformance();
    }
  }, [selectedStudent]);

  const loadStudents = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/detailed-calculations/course/${courseId}/students`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setStudents(response.data.data || []);
    } catch (err) {
      console.error('Error loading students:', err);
    }
  };

  const loadStudentPerformance = async () => {
    try {
      setLoading(true);
      setStudentData(null); // Clear old data first
      setSeeMarks(null);
      setFinalGrade(null);

      const token = localStorage.getItem('token');

      // Fetch CIE performance data
      const response = await axios.get(
        `${API_URL}/detailed-calculations/course/${courseId}/student/${selectedStudent}/performance`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        }
      );

      if (response.data.success && response.data.data) {
        setStudentData(response.data.data);
      } else {
        console.error('Invalid response structure:', response.data);
        alert('Invalid data received from server');
      }

      // Fetch SEE marks
      try {
        const seeResponse = await axios.get(
          `${API_URL}/see-marks/students/${selectedStudent}/courses/${courseId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (seeResponse.data.success && seeResponse.data.data) {
          // Convert numeric fields to numbers
          const see = seeResponse.data.data;
          setSeeMarks({
            ...see,
            see_marks_obtained: parseFloat(see.see_marks_obtained) || 0,
            see_max_marks: parseFloat(see.see_max_marks) || 100
          });
        }
      } catch (seeErr) {
        // SEE marks might not be uploaded yet, that's okay
        console.log('SEE marks not found (may not be uploaded yet)');
      }

      // Fetch final grade
      try {
        const gradeResponse = await axios.get(
          `${API_URL}/grades/students/${selectedStudent}/courses/${courseId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (gradeResponse.data.success && gradeResponse.data.data) {
          // Convert numeric fields to numbers
          const grade = gradeResponse.data.data;
          setFinalGrade({
            ...grade,
            cie_total: parseFloat(grade.cie_total) || 0,
            cie_max: parseFloat(grade.cie_max) || 50,
            see_total: parseFloat(grade.see_total) || 0,
            see_max: parseFloat(grade.see_max) || 50,
            final_total: parseFloat(grade.final_total) || 0,
            final_max: parseFloat(grade.final_max) || 100,
            final_percentage: parseFloat(grade.final_percentage) || 0,
            grade_points: parseFloat(grade.grade_points) || 0
          });
        }
      } catch (gradeErr) {
        // Final grade might not be calculated yet
        console.log('Final grade not found (may not be calculated yet)');
      }

    } catch (err) {
      console.error('Error loading student performance:', err);
      alert(`Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getPerformanceColor = (percentage) => {
    if (percentage >= 80) return '#4caf50';
    if (percentage >= 70) return '#8bc34a';
    if (percentage >= 60) return '#ffc107';
    if (percentage >= 40) return '#ff9800';
    return '#f44336';
  };

  const getPerformanceLabel = (percentage) => {
    if (percentage >= 80) return 'Excellent';
    if (percentage >= 70) return 'Good';
    if (percentage >= 60) return 'Satisfactory';
    if (percentage >= 40) return 'Needs Improvement';
    return 'Critical';
  };

  const getQuestionStatusColor = (status) => {
    switch (status) {
      case 'excellent':
        return '#4caf50'; // Green
      case 'good':
        return '#8bc34a'; // Light green
      case 'average':
        return '#ff9800'; // Orange
      case 'needs_improvement':
        return '#f44336'; // Red
      default:
        return '#9e9e9e'; // Grey
    }
  };

  const getQuestionStatusLabel = (status) => {
    switch (status) {
      case 'excellent':
        return 'Excellent (≥80%)';
      case 'good':
        return 'Good (60-79%)';
      case 'average':
        return 'Average (40-59%)';
      case 'needs_improvement':
        return 'Needs Improvement (<40%)';
      default:
        return 'Not Attempted';
    }
  };

  // Handle CIE click to highlight related COs
  const handleCIEClick = (cieName) => {
    if (selectedCIE === cieName) {
      // Deselect if clicking the same CIE
      setSelectedCIE(null);
      setHighlightedCOs([]);
    } else {
      // Select new CIE and find related COs
      setSelectedCIE(cieName);

      // Find all COs that have this CIE
      const relatedCOs = [];
      studentData.coPerformance.forEach((co) => {
        const hasThisCIE = co.assessments.some(
          (assessment) => assessment.assessment_name === cieName
        );
        if (hasThisCIE) {
          relatedCOs.push(co.co_number);
        }
      });
      setHighlightedCOs(relatedCOs);
    }
  };

  if (!courseId) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <School sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h5" color="text.secondary" gutterBottom>
          No Course Selected
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Please select a course to view individual student analysis.
        </Typography>
      </Box>
    );
  }

  // Prepare chart data with validation
  const radarData = studentData?.coPerformance?.filter(co => co.total_max_marks > 0).map((co) => ({
    co: `CO${co.co_number}`,
    percentage: parseFloat(co.percentage.toFixed(2)) || 0,
    fullMark: 100,
  })) || [];

  const barData = studentData?.coPerformance?.filter(co => co.total_max_marks > 0).map((co) => ({
    name: `CO${co.co_number}`,
    'Marks Obtained': co.total_marks_obtained || 0,
    'Max Marks': co.total_max_marks || 0,
    percentage: co.percentage || 0,
  })) || [];

  const pieData = [
    {
      name: 'COs Above 60%',
      value: studentData?.overallStats.cos_above_60 || 0,
      color: '#4caf50',
    },
    {
      name: 'COs Below 60%',
      value: studentData?.overallStats.cos_below_60 || 0,
      color: '#f44336',
    },
  ].filter(d => d.value > 0);

  // Assessment-wise performance data
  const assessmentPerformanceData = [];
  if (studentData?.coPerformance) {
    const assessmentTypes = new Set();
    studentData.coPerformance.forEach((co) => {
      co.assessments.forEach((a) => assessmentTypes.add(a.assessment_type));
    });

    assessmentTypes.forEach((type) => {
      const dataPoint = { assessment: type };
      let hasData = false;
      studentData.coPerformance.forEach((co) => {
        const assessment = co.assessments.find((a) => a.assessment_type === type);
        if (assessment) {
          dataPoint[`CO${co.co_number}`] = parseFloat(assessment.percentage.toFixed(1)) || 0;
          if (assessment.percentage > 0) hasData = true;
        }
      });
      if (hasData) {
        assessmentPerformanceData.push(dataPoint);
      }
    });
  }

  // Check if we have valid chart data
  const hasRadarData = radarData.length > 0 && radarData.some(d => d.percentage > 0);
  const hasBarData = barData.length > 0;
  const hasPieData = pieData.length > 0 && pieData.reduce((sum, d) => sum + d.value, 0) > 0;
  const hasLineData = assessmentPerformanceData.length > 0;

  return (
    <Box>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <FormControl fullWidth>
            <InputLabel>Select Student</InputLabel>
            <Select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              label="Select Student"
            >
              {students.map((student) => (
                <MenuItem key={student.id} value={student.id}>
                  {student.usn} - {student.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {loading && (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
          <CircularProgress size={60} />
        </Box>
      )}

      {!loading && studentData && (
        <>
          {/* Student Info & Overall Stats */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12}>
              <Card
                sx={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: '0 12px 24px rgba(102, 126, 234, 0.3)',
                  },
                }}
              >
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="h5" fontWeight="bold">
                        {studentData.student.name}
                      </Typography>
                      <Typography variant="h6">{studentData.student.usn}</Typography>
                    </Box>
                    <School sx={{ fontSize: 64, opacity: 0.3 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Show warning if no COs are defined */}
            {(!studentData.coPerformance || studentData.coPerformance.length === 0) && (
              <Grid item xs={12}>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <AlertTitle sx={{ fontWeight: 'bold' }}>Course Outcomes Not Defined</AlertTitle>
                  <Typography variant="body2">
                    Course Outcomes (COs) have not been uploaded for this course yet.
                    Please upload the COs first to see detailed performance analysis.
                    Assessment marks have been saved, and analysis will be available once COs are defined.
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" fontWeight="bold">
                      To add COs: Go to Course Settings → Upload Course Outcomes
                    </Typography>
                  </Box>
                </Alert>
              </Grid>
            )}

            {studentData.coPerformance && studentData.coPerformance.length > 0 && (
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 }
                }}>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Average Performance
                    </Typography>
                    <Typography variant="h4" fontWeight="bold" color="primary">
                      {studentData.overallStats.avg_performance.toFixed(1)}%
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(studentData.overallStats.avg_performance, 100)}
                      sx={{ mt: 1, height: 8, borderRadius: 4 }}
                    />
                  </CardContent>
                </Card>
              </Grid>
            )}

            {studentData.coPerformance && studentData.coPerformance.length > 0 && (
              <>
                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 }
                  }}>
                    <CardContent>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        COs Above 60%
                      </Typography>
                      <Box display="flex" alignItems="center" gap={1}>
                        <CheckCircle color="success" />
                        <Typography variant="h4" fontWeight="bold" color="success.main">
                          {studentData.overallStats.cos_above_60}/{studentData.overallStats.total_cos}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 }
                  }}>
                    <CardContent>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Strongest CO
                      </Typography>
                      <Box display="flex" alignItems="center" gap={1}>
                        <EmojiEvents sx={{ color: '#ffd700' }} />
                        <Typography variant="h4" fontWeight="bold">
                          CO{studentData.overallStats.strongest_co?.co_number}
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="success.main" fontWeight="bold">
                        {studentData.overallStats.strongest_co?.percentage.toFixed(1)}%
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                  <Card sx={{
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 }
                  }}>
                    <CardContent>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Weakest CO
                      </Typography>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Warning color="error" />
                        <Typography variant="h4" fontWeight="bold">
                          CO{studentData.overallStats.weakest_co?.co_number}
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="error.main" fontWeight="bold">
                        {studentData.overallStats.weakest_co?.percentage.toFixed(1)}%
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </>
            )}
          </Grid>

          {/* CIE Marks Breakdown Section */}
          {studentData.finalCIE && (
            <Accordion defaultExpanded sx={{ mb: 2, boxShadow: 1 }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  backgroundColor: '#f8f9fa',
                  borderLeft: '4px solid #ff9800',
                  '&:hover': { backgroundColor: '#f0f1f2' },
                  '& .MuiAccordionSummary-content': { my: 1.5 }
                }}
              >
                <Box display="flex" alignItems="center" gap={1.5}>
                  <Calculate sx={{ color: '#ff9800', fontSize: 24 }} />
                  <Typography variant="h6" fontWeight="600" color="text.primary">
                    CIE Marks Breakdown
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {(() => {
                  const cie = studentData.finalCIE;
                  const rows = [
                    { label: 'CIE 1 (scaled to 30)', value: parseFloat(cie.scaled_cie1) || 0, max: 30 },
                    { label: 'CIE 2 (scaled to 30)', value: parseFloat(cie.scaled_cie2) || 0, max: 30 },
                    { label: 'CIE 3 (scaled to 30)', value: parseFloat(cie.scaled_cie3) || 0, max: 30 },
                    { label: 'Average CIE (best 2 of 3 avg, out of 30)', value: parseFloat(cie.avg_cie_scaled) || 0, max: 30 },
                    { label: 'AAT Marks', value: parseFloat(cie.aat_marks) || 0, max: 10 },
                    { label: 'QUIZ Marks', value: parseFloat(cie.quiz_marks) || 0, max: 10 },
                  ];
                  const total = parseFloat(cie.final_cie_total) || 0;
                  const totalMax = parseFloat(cie.final_cie_max) || 50;
                  const totalPct = parseFloat(cie.final_cie_percentage) || 0;

                  return (
                    <TableContainer component={Paper} elevation={1}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ backgroundColor: '#fff3e0' }}>
                            <TableCell><strong>Component</strong></TableCell>
                            <TableCell align="right"><strong>Marks Obtained</strong></TableCell>
                            <TableCell align="right"><strong>Max Marks</strong></TableCell>
                            <TableCell align="right"><strong>Percentage</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.map((r) => (
                            <TableRow key={r.label}>
                              <TableCell>{r.label}</TableCell>
                              <TableCell align="right">{r.value.toFixed(2)}</TableCell>
                              <TableCell align="right">{r.max}</TableCell>
                              <TableCell align="right">{r.max > 0 ? ((r.value / r.max) * 100).toFixed(1) : '0.0'}%</TableCell>
                            </TableRow>
                          ))}
                          <TableRow sx={{ backgroundColor: '#fff8e1' }}>
                            <TableCell><strong>Final CIE Total</strong></TableCell>
                            <TableCell align="right"><strong>{total.toFixed(2)}</strong></TableCell>
                            <TableCell align="right"><strong>{totalMax}</strong></TableCell>
                            <TableCell align="right"><strong>{totalPct.toFixed(2)}%</strong></TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  );
                })()}
              </AccordionDetails>
            </Accordion>
          )}

          {/* SEE Marks and Final Grade Section */}
          {(seeMarks || finalGrade) && (
            <Accordion defaultExpanded sx={{ mb: 2, boxShadow: 1 }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  backgroundColor: '#f8f9fa',
                  borderLeft: '4px solid #2196f3',
                  '&:hover': { backgroundColor: '#f0f1f2' },
                  '& .MuiAccordionSummary-content': { my: 1.5 }
                }}
              >
                <Box display="flex" alignItems="center" gap={1.5}>
                  <AssessmentIcon sx={{ color: '#2196f3', fontSize: 24 }} />
                  <Typography variant="h6" fontWeight="600" color="text.primary">
                    SEE Marks & Final Grade
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>

                <Grid container spacing={3}>
                  {/* SEE Marks Card */}
                  {seeMarks && (
                    <Grid item xs={12} md={6}>
                      <Card sx={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white'
                      }}>
                        <CardContent>
                          <Typography variant="body2" gutterBottom sx={{ opacity: 0.9 }}>
                            SEE Marks (out of {seeMarks.see_max_marks || 100})
                          </Typography>
                          <Typography variant="h3" fontWeight="bold">
                            {seeMarks.see_marks_obtained || 0}
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={((seeMarks.see_marks_obtained || 0) / (seeMarks.see_max_marks || 100)) * 100}
                            sx={{
                              mt: 2,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: 'rgba(255,255,255,0.3)',
                              '& .MuiLinearProgress-bar': {
                                backgroundColor: 'white'
                              }
                            }}
                          />
                          <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                            {(((seeMarks.see_marks_obtained || 0) / (seeMarks.see_max_marks || 100)) * 100).toFixed(2)}%
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  )}

                  {/* Final Grade Card */}
                  {finalGrade && (
                    <Grid item xs={12} md={6}>
                      <Card sx={{
                        background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                        color: 'white'
                      }}>
                        <CardContent>
                          <Typography variant="body2" gutterBottom sx={{ opacity: 0.9 }}>
                            Final Grade
                          </Typography>
                          <Box display="flex" alignItems="baseline" gap={2}>
                            <Typography variant="h2" fontWeight="bold">
                              {finalGrade.letter_grade || 'N/A'}
                            </Typography>
                            <Typography variant="h4">
                              ({(finalGrade.grade_points || 0)}/10)
                            </Typography>
                          </Box>
                          <Typography variant="h5" sx={{ mt: 1 }}>
                            {(finalGrade.final_total || 0).toFixed(2)}/100
                          </Typography>
                          <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                            {(finalGrade.final_percentage || 0).toFixed(2)}%
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  )}

                  {/* Breakdown Table */}
                  {finalGrade && (
                    <Grid item xs={12}>
                      <TableContainer component={Paper} sx={{ mt: 2 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                              <TableCell><strong>Component</strong></TableCell>
                              <TableCell align="right"><strong>Marks Obtained</strong></TableCell>
                              <TableCell align="right"><strong>Max Marks</strong></TableCell>
                              <TableCell align="right"><strong>Percentage</strong></TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            <TableRow>
                              <TableCell>CIE (Continuous Internal Evaluation)</TableCell>
                              <TableCell align="right">{(finalGrade.cie_total || 0).toFixed(2)}</TableCell>
                              <TableCell align="right">{(finalGrade.cie_max || 50).toFixed(2)}</TableCell>
                              <TableCell align="right">
                                {(((finalGrade.cie_total || 0) / (finalGrade.cie_max || 50)) * 100).toFixed(2)}%
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell>SEE (Semester End Examination)</TableCell>
                              <TableCell align="right">{(finalGrade.see_total || 0).toFixed(2)}</TableCell>
                              <TableCell align="right">{(finalGrade.see_max || 50).toFixed(2)}</TableCell>
                              <TableCell align="right">
                                {(((finalGrade.see_total || 0) / (finalGrade.see_max || 50)) * 100).toFixed(2)}%
                              </TableCell>
                            </TableRow>
                            <TableRow sx={{ backgroundColor: '#e3f2fd' }}>
                              <TableCell><strong>Final Total</strong></TableCell>
                              <TableCell align="right"><strong>{(finalGrade.final_total || 0).toFixed(2)}</strong></TableCell>
                              <TableCell align="right"><strong>{(finalGrade.final_max || 100).toFixed(2)}</strong></TableCell>
                              <TableCell align="right"><strong>{(finalGrade.final_percentage || 0).toFixed(2)}%</strong></TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </TableContainer>
                      <Box sx={{ mt: 2 }}>
                        {/* <Alert severity={finalGrade.is_passed ? 'success' : 'error'}>
                          <AlertTitle>
                            {finalGrade.is_passed ? 'Passed' : 'Failed'}
                          </AlertTitle>
                          Status: {finalGrade.is_passed ? 'Student has passed the course' : 'Student needs to retake the course'}
                        </Alert> */}
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Performance Insights Card */}


          {/* Assessment (CIE) Summary: show whenever CIE data is available */}
          {(studentData.finalCIE || (studentData.coPerformance && studentData.coPerformance.length > 0)) && (
              <Accordion sx={{ mb: 2, boxShadow: 1 }}>
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    backgroundColor: '#f8f9fa',
                    borderLeft: '4px solid #ff9800',
                    '&:hover': { backgroundColor: '#f0f1f2' },
                    '& .MuiAccordionSummary-content': { my: 1.5 }
                  }}
                >
                  <Box display="flex" alignItems="center" gap={1.5}>
                    <AssessmentIcon sx={{ color: '#ff9800', fontSize: 24 }} />
                    <Typography variant="h6" fontWeight="600" color="text.primary">
                      Assessment (CIE) Performance Summary
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ mb: 3 }}>
                    {/* <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Overall performance in each Continuous Internal Evaluation (CIE) across all Course Outcomes
                    </Typography> */}
                    <Alert
                      severity="info"
                      icon={<InfoIcon />}
                      sx={{ mb: 2 }}
                      action={
                        selectedCIE && (
                          <Chip
                            label="Clear Selection"
                            size="small"
                            onClick={() => {
                              setSelectedCIE(null);
                              setHighlightedCOs([]);
                            }}
                            sx={{
                              bgcolor: 'white',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              '&:hover': {
                                bgcolor: '#f5f5f5'
                              }
                            }}
                          />
                        )
                      }
                    >
                      <Typography variant="body2">
                        <strong>💡 Interactive Feature:</strong> Click on any CIE card below to highlight the corresponding Course Outcomes (COs) throughout the page.
                        {selectedCIE && (
                          <span style={{ display: 'block', marginTop: 4, color: '#ffd700', fontWeight: 'bold' }}>
                            ✨ Currently highlighting COs for: {selectedCIE}
                          </span>
                        )}
                      </Typography>
                    </Alert>
                  </Box>

              <Grid container spacing={2}>
                {(() => {
                  // Calculate CIE-wise performance from CO-mapped questions
                  const ciePerformance = {};

                  studentData.coPerformance.forEach((co) => {
                    co.assessments.forEach((assessment) => {
                      const cieName = assessment.assessment_name;
                      if (!ciePerformance[cieName]) {
                        ciePerformance[cieName] = {
                          name: cieName,
                          type: assessment.assessment_type,
                          total_obtained: 0,
                          total_max: 0,
                          co_count: 0
                        };
                      }
                      ciePerformance[cieName].total_obtained += assessment.marks_obtained;
                      ciePerformance[cieName].total_max += assessment.max_marks;
                      ciePerformance[cieName].co_count++;
                    });
                  });

                  // Inject CIE1/2/3 from finalCIE if not already present via CO mappings
                  if (studentData.finalCIE) {
                    const fc = studentData.finalCIE;
                    const cieSlots = [
                      { key: 'CIE1', label: 'CIE 1', value: parseFloat(fc.scaled_cie1) || 0, max: 30 },
                      { key: 'CIE2', label: 'CIE 2', value: parseFloat(fc.scaled_cie2) || 0, max: 30 },
                      { key: 'CIE3', label: 'CIE 3', value: parseFloat(fc.scaled_cie3) || 0, max: 30 },
                    ];
                    for (const slot of cieSlots) {
                      const alreadyPresent = Object.values(ciePerformance).some(
                        (c) => c.type === slot.key || c.name.toUpperCase().includes(slot.key)
                      );
                      if (!alreadyPresent && slot.max > 0) {
                        ciePerformance[slot.label] = {
                          name: slot.label,
                          type: slot.key,
                          total_obtained: slot.value,
                          total_max: slot.max,
                          co_count: 0,
                        };
                      }
                    }
                  }

                  // Sort: CIE1 → CIE2 → CIE3 → others
                  const order = ['CIE1', 'CIE2', 'CIE3'];
                  const sorted = Object.values(ciePerformance).sort((a, b) => {
                    const ai = order.indexOf(a.type);
                    const bi = order.indexOf(b.type);
                    if (ai === -1 && bi === -1) return 0;
                    if (ai === -1) return 1;
                    if (bi === -1) return -1;
                    return ai - bi;
                  });

                  return sorted.map((cie) => {
                    const percentage = cie.total_max > 0 ? (cie.total_obtained / cie.total_max) * 100 : 0;
                    const performanceColor = getPerformanceColor(percentage);
                    const performanceLabel = getPerformanceLabel(percentage);

                    return (
                      <Grid item xs={12} sm={6} md={3} key={cie.name}>
                        <Paper
                          elevation={selectedCIE === cie.name ? 8 : 2}
                          onClick={() => handleCIEClick(cie.name)}
                          sx={{
                            p: 2,
                            height: '100%',
                            borderTop: `4px solid ${performanceColor}`,
                            transition: 'transform 0.2s ease, box-shadow 0.2s ease, border 0.2s ease',
                            cursor: 'pointer',
                            border: selectedCIE === cie.name ? `3px solid ${performanceColor}` : '3px solid transparent',
                            transform: selectedCIE === cie.name ? 'translateY(-4px) scale(1.02)' : 'none',
                            '&:hover': {
                              transform: selectedCIE === cie.name ? 'translateY(-4px) scale(1.02)' : 'translateY(-4px)',
                              boxShadow: 6
                            }
                          }}
                        >
                          <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                            <Box>
                              <Box display="flex" alignItems="center" gap={1}>
                                <Typography variant="h6" fontWeight="bold">
                                  {cie.name}
                                </Typography>
                                {selectedCIE === cie.name && (
                                  <Chip
                                    label="Selected"
                                    size="small"
                                    sx={{
                                      bgcolor: performanceColor,
                                      color: 'white',
                                      fontWeight: 'bold',
                                      fontSize: '0.7rem',
                                      height: 20
                                    }}
                                  />
                                )}
                              </Box>
                              <Chip
                                label={cie.type}
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ mt: 0.5 }}
                              />
                            </Box>
                            <Chip
                              label={performanceLabel}
                              size="small"
                              sx={{
                                bgcolor: performanceColor,
                                color: 'white',
                                fontWeight: 'bold'
                              }}
                            />
                          </Box>

                          <Divider sx={{ my: 1.5 }} />

                          <Box>
                            <Typography variant="body2" color="text.secondary" gutterBottom>
                              Total Marks
                            </Typography>
                            <Typography variant="h5" fontWeight="bold" sx={{ color: performanceColor }}>
                              {cie.total_obtained.toFixed(1)}/{cie.total_max.toFixed(0)}
                            </Typography>
                          </Box>

                          <Box mt={2}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                              <Typography variant="body2" color="text.secondary">
                                Performance
                              </Typography>
                              <Typography variant="h6" fontWeight="bold" sx={{ color: performanceColor }}>
                                {percentage.toFixed(1)}%
                              </Typography>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(percentage, 100)}
                              sx={{
                                height: 8,
                                borderRadius: 4,
                                '& .MuiLinearProgress-bar': {
                                  bgcolor: performanceColor
                                }
                              }}
                            />
                          </Box>

                          <Box mt={2}>
                            <Typography variant="caption" color="text.secondary">
                              Evaluated across {cie.co_count} CO{cie.co_count !== 1 ? 's' : ''}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                display: 'block',
                                mt: 0.5,
                                color: performanceColor,
                                fontWeight: 'bold',
                                fontStyle: 'italic'
                              }}
                            >
                              {selectedCIE === cie.name ? 'Click to deselect' : 'Click to highlight COs'}
                            </Typography>
                          </Box>
                        </Paper>
                      </Grid>
                    );
                  });
                })()}
              </Grid>

              {/* CIE Comparison Chart */}
              <Box sx={{ mt: 4 }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  CIE Performance Comparison
                </Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={(() => {
                      const cieData = {};
                      studentData.coPerformance.forEach((co) => {
                        co.assessments.forEach((assessment) => {
                          if (!cieData[assessment.assessment_type || assessment.assessment_name]) {
                            cieData[assessment.assessment_type || assessment.assessment_name] = {
                              name: assessment.assessment_type || assessment.assessment_name,
                              obtained: 0,
                              max: 0
                            };
                          }
                          const key = assessment.assessment_type || assessment.assessment_name;
                          cieData[key].obtained += assessment.marks_obtained;
                          cieData[key].max += assessment.max_marks;
                        });
                      });
                      // Inject CIE1/2/3 from finalCIE if missing
                      if (studentData.finalCIE) {
                        const fc = studentData.finalCIE;
                        [['CIE1', fc.scaled_cie1], ['CIE2', fc.scaled_cie2], ['CIE3', fc.scaled_cie3]].forEach(([key, val]) => {
                          if (!cieData[key]) {
                            cieData[key] = { name: key, obtained: parseFloat(val) || 0, max: 30 };
                          }
                        });
                      }
                      const order = ['CIE1', 'CIE2', 'CIE3'];
                      return Object.values(cieData)
                        .map(cie => ({ ...cie, percentage: cie.max > 0 ? (cie.obtained / cie.max) * 100 : 0 }))
                        .sort((a, b) => {
                          const ai = order.indexOf(a.name), bi = order.indexOf(b.name);
                          if (ai === -1 && bi === -1) return 0;
                          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                        });
                    })()}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip
                      formatter={(value, name) => {
                        if (name === 'percentage') return `${value.toFixed(1)}%`;
                        return value.toFixed(1);
                      }}
                    />
                    <Legend />
                    <Bar dataKey="percentage" fill="#ff9800" name="Performance %" />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
                </AccordionDetails>
              </Accordion>
          )}

          {/* CO-dependent sections */}
          {studentData.coPerformance && studentData.coPerformance.length > 0 && (
            <>
          {/* Charts Section */}
          <Accordion sx={{ mb: 2, boxShadow: 1 }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                backgroundColor: '#f8f9fa',
                borderLeft: '4px solid #9c27b0',
                '&:hover': { backgroundColor: '#f0f1f2' },
                '& .MuiAccordionSummary-content': { my: 1.5 }
              }}
            >
              <Box display="flex" alignItems="center" gap={1.5}>
                <School sx={{ color: '#9c27b0', fontSize: 24 }} />
                <Typography variant="h6" fontWeight="600" color="text.primary">
                  CO Performance Charts
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                {/* Radar Chart */}
            {hasRadarData && (
              <Grid item xs={12} md={6}>
                <Card sx={{
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 }
                }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                      CO Performance Overview (Radar Chart)
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <RadarChart data={radarData}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="co" />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} />
                        <Radar
                          name="Performance %"
                          dataKey="percentage"
                          stroke="#667eea"
                          fill="#667eea"
                          fillOpacity={0.6}
                        />
                        <RechartsTooltip />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Pie Chart */}
            {hasPieData && (
              <Grid item xs={12} md={hasRadarData ? 6 : 12}>
                <Card sx={{
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 }
                }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                      CO Attainment Status
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => `${entry.name}: ${entry.value}`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Bar Chart */}
            {/* {hasBarData && (
              <Grid item xs={12}>
                <Card sx={{
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 }
                }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                      Marks Obtained vs Max Marks (Bar Chart)
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={barData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <RechartsTooltip />
                        <Legend />
                        <Bar dataKey="Marks Obtained" fill="#4caf50" />
                        <Bar dataKey="Max Marks" fill="#e0e0e0" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
            )} */}

            {/* Assessment-wise Performance */}
            {hasLineData && (
              <Grid item xs={12}>
                <Card sx={{
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 }
                }}>
                  {/* <CardContent>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                      Assessment-wise Performance Trend
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={assessmentPerformanceData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="assessment" />
                        <YAxis domain={[0, 100]} />
                        <RechartsTooltip />
                        <Legend />
                        {studentData.coPerformance.filter(co => co.total_max_marks > 0).map((co, index) => (
                          <Line
                            key={co.co_number}
                            type="monotone"
                            dataKey={`CO${co.co_number}`}
                            stroke={COLORS[index % COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 4 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent> */}
                </Card>
              </Grid>
            )}

            {/* No Data Message */}
            {!hasRadarData && !hasPieData && !hasBarData && !hasLineData && (
              <Grid item xs={12}>
                <Alert severity="info">
                  <Typography variant="body2">
                    No chart data available. Charts will appear once the student completes assessments.
                  </Typography>
                </Alert>
              </Grid>
            )}
              </Grid>
            </AccordionDetails>
          </Accordion>

          {/* CO Performance Details */}
          <Accordion sx={{ mb: 2, boxShadow: 1 }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                backgroundColor: '#f8f9fa',
                borderLeft: '4px solid #00bcd4',
                '&:hover': { backgroundColor: '#f0f1f2' },
                '& .MuiAccordionSummary-content': { my: 1.5 }
              }}
            >
              <Box display="flex" alignItems="center" gap={1.5}>
                <School sx={{ color: '#00bcd4', fontSize: 24 }} />
                <Typography variant="h6" fontWeight="600" color="text.primary">
                  Detailed CO Performance Table
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <TableContainer component={Paper} elevation={0} sx={{ mt: 2 }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1) }}>
                      <TableCell><strong>CO</strong></TableCell>
                      {/* <TableCell><strong>Description</strong></TableCell> */}
                      <TableCell><strong>Bloom Level</strong></TableCell>
                      <TableCell align="center"><strong>Obtained</strong></TableCell>
                      <TableCell align="center"><strong>Max</strong></TableCell>
                      <TableCell align="center"><strong>Percentage</strong></TableCell>
                      <TableCell align="center"><strong>Status</strong></TableCell> 
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {studentData.coPerformance.map((co) => {
                      const isHighlighted = highlightedCOs.includes(co.co_number);
                      return (
                      <TableRow
                        key={co.co_number}
                        hover
                        sx={{
                          bgcolor: isHighlighted ? alpha('#ffd700', 0.2) : 'inherit',
                          borderLeft: isHighlighted ? '4px solid #ffd700' : '4px solid transparent',
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            bgcolor: isHighlighted ? alpha('#ffd700', 0.3) : 'rgba(0, 0, 0, 0.04)'
                          }
                        }}
                      >
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Chip
                              label={`CO${co.co_number}`}
                              color="primary"
                              sx={{
                                fontWeight: isHighlighted ? 'bold' : 'normal',
                                boxShadow: isHighlighted ? '0 0 8px rgba(255, 215, 0, 0.6)' : 'none'
                              }}
                            />
                            {isHighlighted && (
                              <Chip
                                label="Highlighted"
                                size="small"
                                sx={{
                                  bgcolor: '#ffd700',
                                  color: '#000',
                                  fontWeight: 'bold',
                                  fontSize: '0.65rem',
                                  height: 18
                                }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        {/* <TableCell sx={{ maxWidth: 300 }}>
                          <Typography variant="body2">{co.description}</Typography>
                        </TableCell> */}
                        <TableCell>
                          <Chip label={co.bloom_level} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell align="center">
                          <Typography fontWeight="bold">
                            {co.total_marks_obtained.toFixed(2)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">{co.total_max_marks.toFixed(0)}</TableCell>
                        <TableCell align="center">
                          <Box>
                            <Typography
                              variant="body2"
                              fontWeight="bold"
                              sx={{ color: getPerformanceColor(co.percentage) }}
                            >
                              {co.percentage.toFixed(1)}%
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(co.percentage, 100)}
                              sx={{
                                mt: 0.5,
                                height: 6,
                                borderRadius: 3,
                                '& .MuiLinearProgress-bar': {
                                  bgcolor: getPerformanceColor(co.percentage),
                                },
                              }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={getPerformanceLabel(co.percentage)}
                            size="small"
                            sx={{
                              bgcolor: getPerformanceColor(co.percentage),
                              color: 'white',
                              fontWeight: 'bold',
                            }}
                          />
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>

          {/* Detailed Performance Analysis - IMPROVED UI */}
          <Accordion sx={{ mb: 2, boxShadow: 1 }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                backgroundColor: '#f8f9fa',
                borderLeft: '4px solid #2196f3',
                '&:hover': { backgroundColor: '#f0f1f2' },
                '& .MuiAccordionSummary-content': { my: 1.5 }
              }}
            >
              <Box display="flex" alignItems="center" gap={1.5}>
                <AssessmentIcon sx={{ color: '#2196f3', fontSize: 24 }} />
                <Box>
                  <Typography variant="h6" fontWeight="600" color="text.primary">
                    Question-wise Performance Breakdown
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Detailed analysis by assessment and question
                  </Typography>
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
{/* 
              <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 3 }}>
                <AlertTitle sx={{ fontWeight: 'bold', mb: 0.5 }}>Understanding the Exam Structure</AlertTitle>
                <Typography variant="body2">
                  <strong>Compulsory:</strong> Q1-Q2 (must be answered) &nbsp;|&nbsp;
                  <strong>Optional:</strong> Choose one from Q3-Q4, one from Q5-Q6, one from Q7-Q8
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Only selected questions are counted in totals. "Not Selected" means the student chose another option from the pair.
                </Typography>
              </Alert> */}

              {studentData.coPerformance.map((co, coIdx) => {
                const isHighlighted = highlightedCOs.includes(co.co_number);
                return (
                <Accordion
                  key={co.co_number}
                  defaultExpanded={coIdx === 0}
                  sx={{
                    mb: 2,
                    borderRadius: 2,
                    border: isHighlighted ? '3px solid #ffd700' : '2px solid',
                    borderColor: isHighlighted ? '#ffd700' : alpha(getPerformanceColor(co.percentage), 0.3),
                    '&:before': { display: 'none' },
                    boxShadow: isHighlighted
                      ? '0 4px 16px rgba(255, 215, 0, 0.4)'
                      : `0 2px 8px ${alpha(getPerformanceColor(co.percentage), 0.1)}`,
                    '&.Mui-expanded': {
                      boxShadow: isHighlighted
                        ? '0 6px 20px rgba(255, 215, 0, 0.5)'
                        : `0 4px 12px ${alpha(getPerformanceColor(co.percentage), 0.2)}`
                    },
                    transition: 'all 0.3s ease',
                    bgcolor: isHighlighted ? alpha('#ffd700', 0.05) : 'inherit'
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{
                      bgcolor: isHighlighted
                        ? alpha('#ffd700', 0.15)
                        : alpha(getPerformanceColor(co.percentage), 0.05),
                      borderRadius: 1,
                      '&:hover': {
                        bgcolor: isHighlighted
                          ? alpha('#ffd700', 0.25)
                          : alpha(getPerformanceColor(co.percentage), 0.1)
                      },
                      '& .MuiAccordionSummary-content': {
                        my: 2
                      }
                    }}
                  >
                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={12} md={4}>
                        <Box display="flex" alignItems="center" gap={1.5}>
                          <Chip
                            label={`CO${co.co_number}`}
                            sx={{
                              bgcolor: isHighlighted ? '#ffd700' : getPerformanceColor(co.percentage),
                              color: isHighlighted ? '#000' : 'white',
                              fontWeight: 'bold',
                              fontSize: '1rem',
                              height: 36,
                              px: 1,
                              boxShadow: isHighlighted ? '0 0 12px rgba(255, 215, 0, 0.8)' : 'none'
                            }}
                          />
                          {isHighlighted && (
                            <Chip
                              label="Highlighted"
                              size="small"
                              sx={{
                                bgcolor: '#ffd700',
                                color: '#000',
                                fontWeight: 'bold',
                                fontSize: '0.7rem',
                                height: 22,
                                animation: 'pulse 2s ease-in-out infinite',
                                '@keyframes pulse': {
                                  '0%, 100%': { opacity: 1 },
                                  '50%': { opacity: 0.7 }
                                }
                              }}
                            />
                          )}
                          {/* <Tooltip title={co.description} arrow>
                            <Typography
                              variant="body1"
                              fontWeight="600"
                              sx={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical'
                              }}
                            >
                              {co.description}
                            </Typography>
                          </Tooltip> */}
                        </Box>
                      </Grid>

                      <Grid item xs={4} md={2}>
                        <Box textAlign="center">
                          <Typography variant="caption" color="text.secondary" display="block">
                            Performance
                          </Typography>
                          <Typography
                            variant="h6"
                            fontWeight="bold"
                            sx={{ color: getPerformanceColor(co.percentage) }}
                          >
                            {co.percentage.toFixed(1)}%
                          </Typography>
                        </Box>
                      </Grid>

                      <Grid item xs={4} md={2}>
                        <Box textAlign="center">
                          <Typography variant="caption" color="text.secondary" display="block">
                            Marks
                          </Typography>
                          <Typography variant="h6" fontWeight="bold">
                            {co.total_marks_obtained.toFixed(0)}/{co.total_max_marks.toFixed(0)}
                          </Typography>
                        </Box>
                      </Grid>

                      <Grid item xs={4} md={2}>
                        <Box textAlign="center">
                          <Typography variant="caption" color="text.secondary" display="block">
                            Bloom Level
                          </Typography>
                          <Chip
                            label={co.bloom_level}
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 600 }}
                          />
                        </Box>
                      </Grid>

                      <Grid item xs={12} md={2}>
                        <Box textAlign="center">
                          <Chip
                            label={getPerformanceLabel(co.percentage)}
                            sx={{
                              bgcolor: getPerformanceColor(co.percentage),
                              color: 'white',
                              fontWeight: 'bold',
                              width: '100%'
                            }}
                          />
                        </Box>
                      </Grid>
                    </Grid>
                  </AccordionSummary>

                  <AccordionDetails sx={{ bgcolor: 'grey.50', p: 3 }}>
                    {co.assessments.map((assessment, idx) => (
                      <Paper
                        key={idx}
                        elevation={3}
                        sx={{
                          p: 3,
                          mb: idx < co.assessments.length - 1 ? 3 : 0,
                          borderRadius: 2,
                          bgcolor: 'white',
                          borderTop: `4px solid ${getPerformanceColor(assessment.percentage)}`
                        }}
                      >
                        {/* Assessment Header */}
                        <Box
                          display="flex"
                          alignItems="center"
                          justifyContent="space-between"
                          mb={3}
                          pb={2}
                          borderBottom="2px solid"
                          borderColor="divider"
                        >
                          <Box display="flex" alignItems="center" gap={2}>
                            <AssessmentIcon sx={{ color: getPerformanceColor(assessment.percentage), fontSize: 32 }} />
                            <Box>
                              <Typography variant="h6" fontWeight="700">
                                {assessment.assessment_name}
                              </Typography>
                              <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                                <Chip
                                  label={assessment.assessment_type}
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                />
                                <Chip
                                  label={`${assessment.percentage.toFixed(1)}%`}
                                  size="small"
                                  sx={{
                                    bgcolor: getPerformanceColor(assessment.percentage),
                                    color: 'white',
                                    fontWeight: 'bold'
                                  }}
                                />
                              </Box>
                            </Box>
                          </Box>

                          <Box textAlign="right">
                            <Typography variant="caption" color="text.secondary" display="block">
                              Total Marks
                            </Typography>
                            <Typography variant="h5" fontWeight="bold" color={getPerformanceColor(assessment.percentage)}>
                              {assessment.marks_obtained.toFixed(1)}/{assessment.max_marks.toFixed(0)}
                            </Typography>
                          </Box>
                        </Box>

                        {/* Question-wise Table */}
                        <Box>
                          <Box display="flex" alignItems="center" gap={1} mb={2}>
                            <Typography variant="subtitle1" fontWeight="700">
                              Question-wise Breakdown
                            </Typography>
                            <Chip
                              label={`${assessment.all_questions?.length || 0} questions`}
                              size="small"
                              color="default"
                              variant="outlined"
                            />
                          </Box>

                          <TableContainer
                            component={Paper}
                            elevation={0}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 2
                            }}
                          >
                            <Table size="small">
                              <TableHead>
                                <TableRow sx={{ bgcolor: alpha(getPerformanceColor(assessment.percentage), 0.1) }}>
                                  <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem' }}>Question</TableCell>
                                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>Scored</TableCell>
                                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>Out of</TableCell>
                                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>Percentage</TableCell>
                                  <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>Status</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {assessment.all_questions?.map((q, qIdx) => {
                                  const wasSelected = q.wasSelectedByStudent !== false;
                                  const isOptional = !wasSelected && q.obtained === 0;

                                  return (
                                    <TableRow
                                      key={qIdx}
                                      hover={!isOptional}
                                      sx={{
                                        opacity: isOptional ? 0.5 : 1,
                                        bgcolor: isOptional ? alpha('#000', 0.02) : 'inherit',
                                        '&:hover': {
                                          bgcolor: isOptional ? alpha('#000', 0.02) : alpha(getPerformanceColor(assessment.percentage), 0.05)
                                        }
                                      }}
                                    >
                                      <TableCell>
                                        <Box display="flex" alignItems="center" gap={1}>
                                          {wasSelected ? (
                                            <CheckCircleOutline sx={{ fontSize: 18, color: 'success.main' }} />
                                          ) : (
                                            <RadioButtonUnchecked sx={{ fontSize: 18, color: 'grey.400' }} />
                                          )}
                                          <Typography
                                            variant="body2"
                                            fontWeight={isOptional ? 400 : 600}
                                            sx={{ textTransform: 'uppercase' }}
                                          >
                                            {q.question}
                                          </Typography>
                                          {isOptional && (
                                            <Chip
                                              label="Not Selected"
                                              size="small"
                                              sx={{
                                                height: 20,
                                                fontSize: '0.65rem',
                                                bgcolor: 'grey.300',
                                                color: 'grey.700'
                                              }}
                                            />
                                          )}
                                        </Box>
                                      </TableCell>
                                      <TableCell align="center">
                                        <Typography
                                          variant="body2"
                                          fontWeight="bold"
                                          sx={{
                                            color: isOptional ? 'grey.400' : getQuestionStatusColor(q.status),
                                            fontSize: '0.95rem'
                                          }}
                                        >
                                          {isOptional ? '-' : q.obtained.toFixed(1)}
                                        </Typography>
                                      </TableCell>
                                      <TableCell align="center">
                                        <Typography variant="body2" fontWeight={500}>
                                          {isOptional ? '-' : q.max.toFixed(0)}
                                        </Typography>
                                      </TableCell>
                                      <TableCell align="center">
                                        {isOptional ? (
                                          <Typography variant="body2" color="text.secondary">
                                            N/A
                                          </Typography>
                                        ) : (
                                          <Box sx={{ minWidth: 80 }}>
                                            <Typography
                                              variant="body2"
                                              fontWeight="bold"
                                              sx={{
                                                color: getQuestionStatusColor(q.status),
                                                mb: 0.5
                                              }}
                                            >
                                              {q.percentage.toFixed(1)}%
                                            </Typography>
                                            <LinearProgress
                                              variant="determinate"
                                              value={Math.min(q.percentage, 100)}
                                              sx={{
                                                height: 6,
                                                borderRadius: 3,
                                                bgcolor: alpha(getQuestionStatusColor(q.status), 0.1),
                                                '& .MuiLinearProgress-bar': {
                                                  bgcolor: getQuestionStatusColor(q.status),
                                                  borderRadius: 3
                                                },
                                              }}
                                            />
                                          </Box>
                                        )}
                                      </TableCell>
                                      <TableCell align="center">
                                        {isOptional ? (
                                          <Chip
                                            label="Skipped"
                                            size="small"
                                            sx={{
                                              bgcolor: 'grey.300',
                                              color: 'grey.700',
                                              fontWeight: 'bold',
                                              fontSize: '0.7rem'
                                            }}
                                          />
                                        ) : (
                                          <Chip
                                            label={getQuestionStatusLabel(q.status).split(' (')[0]}
                                            size="small"
                                            sx={{
                                              bgcolor: getQuestionStatusColor(q.status),
                                              color: 'white',
                                              fontWeight: 'bold',
                                              fontSize: '0.7rem'
                                            }}
                                          />
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </Box>
                      </Paper>
                    ))}
                  </AccordionDetails>
                </Accordion>
                );
              })}
            </AccordionDetails>
          </Accordion>
            </>
          )}

        </>
      )}

      {!loading && !studentData && selectedStudent && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Warning sx={{ fontSize: 80, color: 'warning.main', mb: 2 }} />
          <Typography variant="h5" color="text.secondary" gutterBottom>
            No Data Available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This student has no performance data yet. Please ensure assessments have been uploaded.
          </Typography>
        </Box>
      )}

      {!loading && !studentData && !selectedStudent && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <AssessmentIcon sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
          <Typography variant="h5" color="text.secondary" gutterBottom>
            Select a Student
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose a student from the dropdown above to view their detailed performance analysis.
          </Typography>
        </Box>
      )}
                {studentData && studentData.coPerformance && studentData.coPerformance.length > 0 && (
            <Accordion sx={{ mb: 2, boxShadow: 1 }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  backgroundColor: '#f8f9fa',
                  borderLeft: '4px solid #4caf50',
                  '&:hover': { backgroundColor: '#f0f1f2' },
                  '& .MuiAccordionSummary-content': { my: 1.5 }
                }}
              >
                <Box display="flex" alignItems="center" gap={1.5}>
                  <CheckCircle sx={{ color: '#4caf50', fontSize: 24 }} />
                  <Typography variant="h6" fontWeight="600" color="text.primary">
                    Performance Insights
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  {studentData.overallStats.avg_performance >= 80 && (
                    <Grid item xs={12}>
                      <Alert severity="success" icon={<EmojiEvents />}>
                        <AlertTitle>Excellent Performance!</AlertTitle>
                        The student is performing exceptionally well with an average of{' '}
                        {studentData.overallStats.avg_performance.toFixed(1)}%. Keep up the great work!
                      </Alert>
                    </Grid>
                  )}
                  {studentData.overallStats.avg_performance >= 60 && studentData.overallStats.avg_performance < 80 && (
                    <Grid item xs={12}>
                      <Alert severity="info">
                        <AlertTitle>Good Performance</AlertTitle>
                        The student is performing well with an average of{' '}
                        {studentData.overallStats.avg_performance.toFixed(1)}%. Focus on improving weaker COs to reach excellence.
                      </Alert>
                    </Grid>
                  )}
                  {studentData.overallStats.avg_performance < 60 && (
                    <Grid item xs={12}>
                      <Alert severity="warning">
                        <AlertTitle>Needs Improvement</AlertTitle>
                        The student's average performance is {studentData.overallStats.avg_performance.toFixed(1)}%.
                        Additional support and practice are recommended.
                      </Alert>
                    </Grid>
                  )}

                  {studentData.overallStats.weakest_co && studentData.overallStats.weakest_co.percentage < 60 && (
                    <Grid item xs={12} md={6}>
                      <Paper sx={{ p: 2, bgcolor: alpha('#ff9800', 0.1), border: '1px solid #ff9800' }}>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                          <TrendingDown sx={{ color: '#ff9800' }} />
                          <Typography variant="subtitle2" fontWeight="bold">
                            Focus Area
                          </Typography>
                        </Box>
                        <Typography variant="body2">
                          CO{studentData.overallStats.weakest_co.co_number} needs attention
                          ({studentData.overallStats.weakest_co.percentage.toFixed(1)}%).
                          Consider additional practice and review materials.
                        </Typography>
                      </Paper>
                    </Grid>
                  )}

                  {studentData.overallStats.strongest_co && (
                    <Grid item xs={12} md={6}>
                      <Paper sx={{ p: 2, bgcolor: alpha('#4caf50', 0.1), border: '1px solid #4caf50' }}>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                          <TrendingUp sx={{ color: '#4caf50' }} />
                          <Typography variant="subtitle2" fontWeight="bold">
                            Strength
                          </Typography>
                        </Box>
                        <Typography variant="body2">
                          CO{studentData.overallStats.strongest_co.co_number} is a strong point
                          ({studentData.overallStats.strongest_co.percentage.toFixed(1)}%).
                          Excellent understanding demonstrated!
                        </Typography>
                      </Paper>
                    </Grid>
                  )}
                </Grid>
              </AccordionDetails>
            </Accordion>
          )}
    </Box>
  );
};

export default IndividualStudentAnalysis;
