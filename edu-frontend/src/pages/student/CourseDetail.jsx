import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  ArrowLeft,
  FileText,
  TrendingUp,
  GraduationCap,
  ChevronDown,
  CheckCircle,
  XCircle,
  FolderOpen,
  MessageCircle,
  ClipboardList,
} from 'lucide-react';
import { studentAPI, courseAPI } from '../../services/api';
import MyAttainment from '../../components/attainment/MyAttainment';
import PageLayout from '../../components/shared/PageLayout';
import { PageLoader } from '../../components/shared/Loading';
import { ErrorState } from '../../components/shared/ErrorState';
import StatsCard from '../../components/shared/StatsCard';
import Recommendations from '../../components/student/Recommendations';
import CourseMaterials from '../../components/course/CourseMaterials';
import CourseChat from '../../components/course/CourseChat';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { CHART_COLORS } from '../../config/chartColors';
import { initializeSocket, joinCourse, leaveCourse, disconnectSocket } from '../../services/socket';

const COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.success,
  CHART_COLORS.error,
  CHART_COLORS.warning,
  CHART_COLORS.tertiary,
];

const CourseDetail = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabValue, setTabValue] = useState(0);

  const [courseInfo, setCourseInfo] = useState(null);
  const [marks, setMarks] = useState([]);
  const [coAttainment, setCOAttainment] = useState({ combined: [], perAssessment: [] });
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    loadCourseData();
  }, [courseId]);

  // Socket initialization and cleanup
  useEffect(() => {
    initializeSocket();
    joinCourse(courseId);

    return () => {
      leaveCourse(courseId);
    };
  }, [courseId]);

  const loadCourseData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [courseRes, marksRes, coRes, analyticsRes] = await Promise.all([
        courseAPI.getById(courseId),
        studentAPI.getMarks(courseId),
        studentAPI.getCOAttainment(courseId),
        studentAPI.getAnalytics(courseId),
      ]);

      setCourseInfo(courseRes.data.data);
      setMarks(marksRes.data.data || []);
      setCOAttainment(coRes.data.data || { combined: [], perAssessment: [] });
      setAnalytics(analyticsRes.data.data);
    } catch (err) {
      console.error('Error loading course data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <PageLoader message="Loading course details..." />;
  if (error) return <ErrorState onRetry={loadCourseData} />;

  // Calculate overall stats
  const totalMarks = marks.reduce((sum, m) => sum + m.totalMarks, 0);
  const totalMaxMarks = marks.reduce((sum, m) => sum + m.maxMarks, 0);
  const overallPercentage = totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0;

  // Prepare chart data
  const assessmentChartData = marks.map((m) => ({
    name: m.assessmentName || m.assessmentType || 'Assessment',
    marks: m.totalMarks,
    max: m.maxMarks,
    percentage: m.percentage,
  }));

  const coChartData = coAttainment.combined.map((co) => ({
    name: `CO${co.co_number}`,
    attainment: parseFloat(co.attainment_percent || 0),
    max: 100,
  }));

  const coPieData = coAttainment.combined.map((co) => ({
    name: `CO${co.co_number}`,
    value: parseFloat(co.attainment_percent || 0),
  }));

  return (
    <PageLayout
      title={courseInfo?.name || 'Course Details'}
      subtitle={`${courseInfo?.code || ''} - Your Performance Overview`}
      icon={GraduationCap}
      breadcrumbs={[
        { label: 'Dashboard', to: '/student/dashboard', icon: GraduationCap },
        { label: courseInfo?.name || 'Course' },
      ]}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/student/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button variant="outline" onClick={() => navigate(`/student/courses/${courseId}/exit-survey`)}>
            <ClipboardList className="w-4 h-4 mr-2" />
            Exit Survey
          </Button>
        </div>
      }
    >
      {/* Overall Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Overall Percentage"
          value={`${overallPercentage.toFixed(1)}%`}
          icon={TrendingUp}
          color="primary"
        />
        <StatsCard
          title="Total Marks"
          value={`${totalMarks.toFixed(1)} / ${totalMaxMarks.toFixed(1)}`}
          icon={FileText}
          color="success"
        />
        <StatsCard
          title="Assessments"
          value={marks.length}
          icon={GraduationCap}
          color="secondary"
        />
        <StatsCard
          title="Your Rank"
          value={`${analytics?.rank || '--'}/${analytics?.totalStudents || '--'}`}
          icon={TrendingUp}
          color="warning"
        />
      </div>

      {/* Tabs */}
      <Card className="mb-6">
        <div className="border-b border-neutral-200 dark:border-dark-border">
          <div className="flex gap-1 px-4">
            <button
              onClick={() => setTabValue(0)}
              className={`px-4 py-3 border-b-2 transition-colors ${
                tabValue === 0
                  ? 'border-primary-500 dark:border-dark-green-500 text-primary-600 dark:text-dark-green-500 font-semibold'
                  : 'border-transparent text-neutral-600 dark:text-dark-text-secondary hover:text-neutral-800 dark:hover:text-dark-text-primary'
              }`}
            >
              Marks Breakdown
            </button>
            <button
              onClick={() => setTabValue(1)}
              className={`px-4 py-3 border-b-2 transition-colors ${
                tabValue === 1
                  ? 'border-primary-500 dark:border-dark-green-500 text-primary-600 dark:text-dark-green-500 font-semibold'
                  : 'border-transparent text-neutral-600 dark:text-dark-text-secondary hover:text-neutral-800 dark:hover:text-dark-text-primary'
              }`}
            >
              CO Attainment
            </button>
            <button
              onClick={() => setTabValue(2)}
              className={`px-4 py-3 border-b-2 transition-colors ${
                tabValue === 2
                  ? 'border-primary-500 dark:border-dark-green-500 text-primary-600 dark:text-dark-green-500 font-semibold'
                  : 'border-transparent text-neutral-600 dark:text-dark-text-secondary hover:text-neutral-800 dark:hover:text-dark-text-primary'
              }`}
            >
              Performance Analysis
            </button>
            <button
              onClick={() => setTabValue(3)}
              className={`px-4 py-3 border-b-2 transition-colors ${
                tabValue === 3
                  ? 'border-primary-500 dark:border-dark-green-500 text-primary-600 dark:text-dark-green-500 font-semibold'
                  : 'border-transparent text-neutral-600 dark:text-dark-text-secondary hover:text-neutral-800 dark:hover:text-dark-text-primary'
              }`}
            >
              Recommendations
            </button>
            <button
              onClick={() => setTabValue(4)}
              className={`px-4 py-3 border-b-2 transition-colors ${
                tabValue === 4
                  ? 'border-primary-500 dark:border-dark-green-500 text-primary-600 dark:text-dark-green-500 font-semibold'
                  : 'border-transparent text-neutral-600 dark:text-dark-text-secondary hover:text-neutral-800 dark:hover:text-dark-text-primary'
              }`}
            >
              Materials & Chat
            </button>
            <button
              onClick={() => setTabValue(5)}
              className={`px-4 py-3 border-b-2 transition-colors ${
                tabValue === 5
                  ? 'border-primary-500 dark:border-dark-green-500 text-primary-600 dark:text-dark-green-500 font-semibold'
                  : 'border-transparent text-neutral-600 dark:text-dark-text-secondary hover:text-neutral-800 dark:hover:text-dark-text-primary'
              }`}
            >
              My Attainment
            </button>
          </div>
        </div>
      </Card>

      {/* Tab 0: Marks Breakdown */}
      {tabValue === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Assessment Performance Chart */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary mb-6">
                    Assessment Performance
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={assessmentChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#D8CBC0" />
                      <XAxis dataKey="name" stroke="#666" />
                      <YAxis stroke="#666" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #E9762B',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                      <Bar dataKey="marks" fill={CHART_COLORS.primary} name="Marks Obtained" />
                      <Bar dataKey="max" fill="#E9762B" name="Max Marks" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Assessment List */}
          <div>
            <Card>
              <CardContent className="p-6">
                <h3 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary mb-6">
                  All Assessments
                </h3>
                <div className="flex flex-col gap-4">
                  {marks.map((assessment, index) => (
                    <div key={index}>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">
                          {assessment.assessmentName || assessment.assessmentType}
                        </span>
                        <Badge
                          variant={
                            assessment.percentage >= 60
                              ? 'success'
                              : assessment.percentage >= 40
                              ? 'default'
                              : 'destructive'
                          }
                        >
                          {assessment.percentage.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="h-2 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            assessment.percentage >= 60
                              ? 'bg-success-500'
                              : assessment.percentage >= 40
                              ? 'bg-warning-500'
                              : 'bg-error-500'
                          }`}
                          style={{ width: `${assessment.percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mt-1">
                        {assessment.totalMarks.toFixed(1)} / {assessment.maxMarks.toFixed(1)} marks
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Marks Table */}
          <div className="lg:col-span-3">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary mb-6">
                  Detailed Marks Breakdown
                </h3>
                {marks.map((assessment, idx) => (
                  <details key={idx} className="group mb-4">
                    <summary className="flex justify-between items-center p-4 bg-neutral-50 dark:bg-dark-bg-secondary rounded-xl cursor-pointer hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary transition-colors">
                      <div className="flex-1">
                        <h4 className="text-base font-semibold text-neutral-800 dark:text-dark-text-primary">
                          {assessment.assessmentName || assessment.assessmentType}
                        </h4>
                        <p className="text-xs text-neutral-500 dark:text-dark-text-muted mt-1">
                          {assessment.assessmentType && `${assessment.assessmentType} • `}
                          {new Date(assessment.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge
                          variant={
                            assessment.percentage >= 60
                              ? 'success'
                              : assessment.percentage >= 40
                              ? 'default'
                              : 'destructive'
                          }
                        >
                          {assessment.percentage.toFixed(1)}%
                        </Badge>
                        <ChevronDown className="w-5 h-5 text-neutral-500 group-open:rotate-180 transition-transform" />
                      </div>
                    </summary>
                    <div className="mt-4 p-4 border border-neutral-200 dark:border-dark-border rounded-xl">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-neutral-200 dark:border-dark-border">
                              <th className="px-4 py-2 text-left text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">
                                CO
                              </th>
                              <th className="px-4 py-2 text-right text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">
                                Obtained
                              </th>
                              <th className="px-4 py-2 text-right text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">
                                Max
                              </th>
                              <th className="px-4 py-2 text-right text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">
                                Percentage
                              </th>
                              <th className="px-4 py-2 text-left text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {assessment.coBreakdown && assessment.coBreakdown.length > 0 ? (
                              assessment.coBreakdown.map((co, coIdx) => (
                                <tr key={coIdx} className="border-b border-neutral-200 dark:border-dark-border">
                                  <td className="px-4 py-3">
                                    <Badge>CO{co.coNumber}</Badge>
                                  </td>
                                  <td className="px-4 py-3 text-right text-sm text-neutral-700 dark:text-dark-text-secondary">
                                    {co.obtained.toFixed(1)}
                                  </td>
                                  <td className="px-4 py-3 text-right text-sm text-neutral-700 dark:text-dark-text-secondary">
                                    {co.max.toFixed(1)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span
                                      className={`text-sm font-bold ${
                                        co.percentage >= 60
                                          ? 'text-success-600 dark:text-success-500'
                                          : co.percentage >= 40
                                          ? 'text-warning-600 dark:text-warning-500'
                                          : 'text-error-600 dark:text-error-500'
                                      }`}
                                    >
                                      {co.percentage.toFixed(1)}%
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    {co.percentage >= 60 ? (
                                      <CheckCircle className="w-5 h-5 text-success-600 dark:text-success-500" />
                                    ) : (
                                      <XCircle className="w-5 h-5 text-error-600 dark:text-error-500" />
                                    )}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-dark-text-muted">
                                  No CO breakdown available
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 p-3 bg-neutral-50 dark:bg-dark-bg-tertiary rounded-xl">
                        <p className="text-sm text-neutral-700 dark:text-dark-text-secondary">
                          <strong>Total:</strong> {assessment.totalMarks.toFixed(1)} / {assessment.maxMarks.toFixed(1)} marks
                        </p>
                      </div>
                    </div>
                  </details>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 1: CO Attainment */}
      {tabValue === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary mb-6">
                Combined CO Attainment
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={coChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D8CBC0" />
                  <XAxis dataKey="name" stroke="#666" />
                  <YAxis domain={[0, 100]} stroke="#666" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #E9762B',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="attainment" fill={CHART_COLORS.primary} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary mb-6">
                CO Distribution
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={coPieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {coPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary mb-6">
                  CO Attainment Details
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-neutral-200 dark:border-dark-border">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">
                          CO
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">
                          Description
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">
                          Max Marks
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">
                          Attainment %
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {coAttainment.combined.map((co, idx) => {
                        const attainment = parseFloat(co.attainment_percent || 0);
                        return (
                          <tr key={idx} className="border-b border-neutral-200 dark:border-dark-border hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary">
                            <td className="px-4 py-3">
                              <Badge>CO{co.co_number}</Badge>
                            </td>
                            <td className="px-4 py-3 text-sm text-neutral-700 dark:text-dark-text-secondary">
                              {co.description || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-neutral-700 dark:text-dark-text-secondary">
                              {parseFloat(co.total_max_marks || 0).toFixed(1)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`text-sm font-bold ${
                                  attainment >= 60
                                    ? 'text-success-600 dark:text-success-500'
                                    : attainment >= 40
                                    ? 'text-warning-600 dark:text-warning-500'
                                    : 'text-error-600 dark:text-error-500'
                                }`}
                              >
                                {attainment.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {attainment >= 60 ? (
                                <Badge variant="success">Achieved</Badge>
                              ) : (
                                <Badge variant="destructive">Not Achieved</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 2: Performance Analysis */}
      {tabValue === 2 && (
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary mb-6">
                Performance Trend
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={assessmentChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D8CBC0" />
                  <XAxis dataKey="name" stroke="#666" />
                  <YAxis domain={[0, 100]} stroke="#666" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #E9762B',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="percentage"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={3}
                    dot={{ fill: CHART_COLORS.primary, r: 6 }}
                    name="Percentage"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary mb-6">
                  Your Performance vs Class Average
                </h3>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-neutral-600 dark:text-dark-text-secondary">Your Average</span>
                      <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                        {analytics?.studentAverage || 0}%
                      </span>
                    </div>
                    <div className="h-3 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 dark:bg-dark-green-500 rounded-full"
                        style={{ width: `${analytics?.studentAverage || 0}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-neutral-600 dark:text-dark-text-secondary">Class Average</span>
                      <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                        {analytics?.classAverage || 0}%
                      </span>
                    </div>
                    <div className="h-3 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-secondary-500 rounded-full"
                        style={{ width: `${analytics?.classAverage || 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary mb-6">
                  Performance Summary
                </h3>
                <div className="space-y-6">
                  <div>
                    <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">Overall Percentage</p>
                    <p className="text-4xl font-bold text-primary-600 dark:text-dark-green-500 mt-1">
                      {overallPercentage.toFixed(1)}%
                    </p>
                  </div>
                  <div className="h-px bg-neutral-200 dark:bg-dark-border" />
                  <div>
                    <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">Class Rank</p>
                    <p className="text-4xl font-bold text-warning-600 dark:text-warning-500 mt-1">
                      {analytics?.rank || '--'} / {analytics?.totalStudents || '--'}
                    </p>
                  </div>
                  <div className="h-px bg-neutral-200 dark:bg-dark-border" />
                  <div>
                    <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">Total Assessments</p>
                    <p className="text-4xl font-bold text-neutral-800 dark:text-dark-text-primary mt-1">
                      {marks.length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 3: Recommendations */}
      {tabValue === 3 && (
        <div>
          <Recommendations courseId={courseId} courseCode={courseInfo?.code} />
        </div>
      )}

      {/* Tab 5: My Attainment */}
      {tabValue === 5 && (
        <MyAttainment courseId={courseId} />
      )}

      {/* Tab 4: Materials & Chat */}
      {tabValue === 4 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Materials Section */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FolderOpen className="w-5 h-5" />
                Course Materials
              </h3>
              <CourseMaterials courseId={courseId} isTeacher={false} />
            </CardContent>
          </Card>

          {/* Chat Section */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Course Chat
              </h3>
              <CourseChat courseId={courseId} />
            </CardContent>
          </Card>
        </div>
      )}
    </PageLayout>
  );
};

export default CourseDetail;
