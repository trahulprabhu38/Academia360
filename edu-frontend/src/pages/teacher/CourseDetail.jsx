import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Users,
  BarChart3,
  Upload,
  GraduationCap,
  LayoutDashboard,
  Mail,
  User,
  FileText,
  Trash2,
  Eye,
  Sparkles,
  CheckCircle,
  Star,
  TrendingUp,
  FlaskConical,
  BadgeCheck,
  Plus,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  MessageCircle,
  ClipboardList,
  FileQuestion,
} from 'lucide-react';
import { courseAPI, marksheetAPI, aiCOAPI, courseOutcomesAPI } from '../../services/api';
import CESAdmin from './CESAdmin';
import PageLayout from '../../components/shared/PageLayout';
import { PageLoader } from '../../components/shared/Loading';
import { ErrorState, EmptyState } from '../../components/shared/ErrorState';
import StatsCard from '../../components/shared/StatsCard';
import COMappingUpload from '../../components/upload/COMappingUpload';
import ManualCOManager from '../../components/teacher/ManualCOManager';
import CourseMaterials from '../../components/course/CourseMaterials';
import CourseChat from '../../components/course/CourseChat';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { initializeSocket, joinCourse, leaveCourse, disconnectSocket } from '../../services/socket';

const CourseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [course, setCourse] = useState(null);
  const [students, setStudents] = useState([]);
  const [marksheets, setMarksheets] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedMarksheet, setSelectedMarksheet] = useState(null);
  const [marksheetData, setMarksheetData] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataPage, setDataPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Student pagination state
  const [studentPage, setStudentPage] = useState(0);
  const studentsPerPage = 10;

  // CO section expand/collapse
  const [coExpanded, setCOExpanded] = useState(true);

  // AI-generated COs state
  const [aiCOs, setAICOs] = useState([]);
  const [loadingAICOs, setLoadingAICOs] = useState(false);
  const [coStatistics, setCOStatistics] = useState(null);
  const [calculating, setCalculating] = useState(false);

  // Manual CO Manager state
  const [manualCOModalOpen, setManualCOModalOpen] = useState(false);

  useEffect(() => {
    loadCourseDetails();
    loadAICOs();
  }, [id]);

  // Socket initialization and cleanup
  useEffect(() => {
    initializeSocket();
    joinCourse(id);

    return () => {
      leaveCourse(id);
    };
  }, [id]);

  const loadAICOs = async () => {
    try {
      setLoadingAICOs(true);
      const [cosRes, statsRes] = await Promise.all([
        courseOutcomesAPI.getByCourse(id),
        aiCOAPI.getStatistics(id).catch(() => ({ data: { statistics: null } })),
      ]);
      setAICOs(cosRes.data.cos || []);
      setCOStatistics(statsRes.data.statistics);
    } catch (err) {
      console.error('Error loading COs:', err);
    } finally {
      setLoadingAICOs(false);
    }
  };

  const loadCourseDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const [courseRes, studentsRes, marksheetsRes] = await Promise.all([
        courseAPI.getById(id),
        courseAPI.getEnrolledStudents(id),
        marksheetAPI.getByCourse(id).catch(() => ({ data: { data: [] } })),
      ]);

      setCourse(courseRes.data.data);
      setStudents(studentsRes.data.data || []);
      setMarksheets(marksheetsRes.data.data || []);
    } catch (err) {
      console.error('Error loading course details:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateAttainment = async () => {
    try {
      setCalculating(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8080/api/attainment/course/${id}/recalculate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Calculation failed');
      }

      toast.success('Attainment calculations completed successfully!');
      await loadCourseDetails();
    } catch (err) {
      console.error('Calculation error:', err);
      toast.error('Failed to calculate attainment. Please ensure marksheets are uploaded.');
    } finally {
      setCalculating(false);
    }
  };

  const handleDeleteMarksheet = async (marksheetId) => {
    if (!window.confirm('Are you sure you want to delete this marksheet? This action cannot be undone.')) {
      return;
    }
    try {
      await marksheetAPI.delete(marksheetId);
      toast.success('Marksheet deleted successfully!');
      loadCourseDetails();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete marksheet');
    }
  };

  const handleOpenDetails = async (marksheet) => {
    setSelectedMarksheet(marksheet);
    setDetailsModalOpen(true);
    setDataPage(0);
    await fetchMarksheetData(marksheet.id, 0, rowsPerPage);
  };

  const handleCloseDetails = () => {
    setDetailsModalOpen(false);
    setSelectedMarksheet(null);
    setMarksheetData(null);
  };

  const fetchMarksheetData = async (marksheetId, page, limit) => {
    try {
      setLoadingData(true);
      const offset = page * limit;
      const response = await marksheetAPI.getData(marksheetId, { limit, offset });
      setMarksheetData(response.data.data);
    } catch (err) {
      console.error('Error fetching marksheet data:', err);
      toast.error('Failed to load marksheet data');
    } finally {
      setLoadingData(false);
    }
  };

  const handleChangePage = (event, newPage) => {
    setDataPage(newPage);
    if (selectedMarksheet) {
      fetchMarksheetData(selectedMarksheet.id, newPage, rowsPerPage);
    }
  };

  const handleChangeRowsPerPage = (event) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setDataPage(0);
    if (selectedMarksheet) {
      fetchMarksheetData(selectedMarksheet.id, 0, newRowsPerPage);
    }
  };

  if (loading) return <PageLoader message="Loading course details..." />;
  if (error) return <ErrorState onRetry={loadCourseDetails} />;

  return (
    <PageLayout
      title={course?.name || 'Course Details'}
      subtitle={`${course?.code || ''} - ${course?.semester ? `Semester ${course.semester}` : ''}`}
      icon={GraduationCap}
      breadcrumbs={[
        { label: 'Dashboard', to: '/teacher/dashboard', icon: LayoutDashboard },
        { label: 'Courses', to: '/teacher/courses' },
        { label: course?.code || 'Details' },
      ]}
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => navigate('/teacher/courses')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(`/teacher/attainment/${id}`)}
            className="border-success-600 text-success-600 hover:bg-success-50 dark:border-success-500 dark:text-success-500 dark:hover:bg-success-900/20"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            View Dashboard
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(`/teacher/courses/${id}/attainment`)}
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            CO/PO/PSO Attainment
          </Button>
          <Button
            onClick={() => navigate('/teacher/upload')}
            className="bg-gradient-to-r from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Marks
          </Button>
        </div>
      }
    >
      {/* Course Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Enrolled Students"
          value={students.length}
          icon={Users}
          color="primary"
        />
        <StatsCard
          title="Credits"
          value={course?.credits || 3}
          icon={GraduationCap}
          color="success"
        />
        <StatsCard
          title="Course Outcomes"
          value={course?.course_outcomes?.length || 0}
          icon={BarChart3}
          color="warning"
        />
        <StatsCard
          title="Academic Year"
          value={course?.year || '--'}
          icon={LayoutDashboard}
          color="secondary"
        />
      </div>

      {/* Course Information Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="mb-8">
          <CardContent className="p-6">
            <h3 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary mb-4">
              Course Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="space-y-3">
                <div className="flex gap-4">
                  <span className="text-sm text-neutral-600 dark:text-dark-text-secondary min-w-[120px]">
                    Course Code:
                  </span>
                  <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                    {course?.code}
                  </span>
                </div>
                <div className="flex gap-4">
                  <span className="text-sm text-neutral-600 dark:text-dark-text-secondary min-w-[120px]">
                    Course Name:
                  </span>
                  <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                    {course?.name}
                  </span>
                </div>
                <div className="flex gap-4">
                  <span className="text-sm text-neutral-600 dark:text-dark-text-secondary min-w-[120px]">
                    Semester:
                  </span>
                  <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                    {course?.semester}
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex gap-4">
                  <span className="text-sm text-neutral-600 dark:text-dark-text-secondary min-w-[120px]">
                    Academic Year:
                  </span>
                  <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                    {course?.year}
                  </span>
                </div>
                <div className="flex gap-4">
                  <span className="text-sm text-neutral-600 dark:text-dark-text-secondary min-w-[120px]">
                    Credits:
                  </span>
                  <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                    {course?.credits || 3}
                  </span>
                </div>
                <div className="flex gap-4">
                  <span className="text-sm text-neutral-600 dark:text-dark-text-secondary min-w-[120px]">
                    Instructor:
                  </span>
                  <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                    {course?.teacher_name || 'You'}
                  </span>
                </div>
              </div>
            </div>
            {course?.description && (
              <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-dark-border">
                <p className="text-sm text-neutral-600 dark:text-dark-text-secondary mb-2">
                  <strong>Description:</strong>
                </p>
                <p className="text-sm text-neutral-800 dark:text-dark-text-primary">{course.description}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* AI-Generated Course Outcomes Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <Card
          className={`mb-8 transition-all duration-300 ${
            aiCOs.length > 0
              ? 'border-2 border-primary-500 dark:border-dark-green-500 bg-gradient-to-br from-primary-50/30 to-secondary-50/20 dark:from-primary-900/10 dark:to-secondary-900/10'
              : ''
          }`}
        >
          <CardContent className="p-6">
            {/* Clickable header — collapses / expands the CO grid */}
            <div
              className="flex justify-between items-start mb-0 flex-wrap gap-4 cursor-pointer select-none"
              onClick={() => setCOExpanded(prev => !prev)}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary">
                    Course Outcomes
                  </h3>
                  <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">
                    {aiCOs.length > 0
                      ? `${aiCOs.length} COs defined • ${aiCOs.filter(co => co.is_ai_generated).length} AI-generated • ${aiCOs.filter(co => !co.is_ai_generated).length} Manual`
                      : 'Add course outcomes using AI generation or manually'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                {aiCOs.length === 0 && (
                  <>
                    <Button
                      onClick={() => navigate('/teacher/co-generator')}
                      className="bg-gradient-to-r from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate with AI
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setManualCOModalOpen(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Manually
                    </Button>
                  </>
                )}
                {aiCOs.length > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('/teacher/co-generator')}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Regenerate with AI
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setManualCOModalOpen(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Edit Manually
                    </Button>
                  </>
                )}
                <button
                  onClick={() => setCOExpanded(prev => !prev)}
                  className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary transition-colors"
                  title={coExpanded ? 'Collapse' : 'Expand'}
                >
                  {coExpanded
                    ? <ChevronUp className="w-5 h-5 text-neutral-500" />
                    : <ChevronDown className="w-5 h-5 text-neutral-500" />}
                </button>
              </div>
            </div>

            {/* Collapsible content */}
            <div className={`overflow-hidden transition-all duration-300 ${coExpanded ? 'mt-6' : 'max-h-0 mt-0 opacity-0 pointer-events-none'}`}>

            {loadingAICOs ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : aiCOs.length === 0 ? (
              <div className="text-center py-12 px-6 rounded-2xl border-2 border-dashed border-neutral-300 dark:border-dark-border bg-neutral-50 dark:bg-dark-bg-secondary">
                <FlaskConical className="w-16 h-16 text-neutral-400 dark:text-dark-text-muted mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-neutral-600 dark:text-dark-text-secondary mb-2">
                  No Course Outcomes Yet
                </h4>
                <p className="text-sm text-neutral-500 dark:text-dark-text-muted mb-6">
                  Add course outcomes using our AI-powered generator or create them manually.
                </p>
                <div className="flex gap-4 justify-center">
                  <Button
                    onClick={() => navigate('/teacher/co-generator')}
                    className="bg-gradient-to-r from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate with AI
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setManualCOModalOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Manually
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Statistics Banner */}
                {coStatistics && (
                  <div className="mb-6 p-4 rounded-2xl bg-neutral-50 dark:bg-dark-bg-tertiary flex flex-wrap gap-6">
                    <div>
                      <p className="text-xs text-neutral-600 dark:text-dark-text-secondary">Total COs</p>
                      <p className="text-2xl font-bold text-neutral-800 dark:text-dark-text-primary">{coStatistics.total_cos}</p>
                    </div>
                    <div className="h-12 w-px bg-neutral-300 dark:bg-dark-border" />
                    <div>
                      <p className="text-xs text-neutral-600 dark:text-dark-text-secondary">Approved</p>
                      <p className="text-2xl font-bold text-success-600 dark:text-success-500">
                        {coStatistics.approved_cos}
                      </p>
                    </div>
                    <div className="h-12 w-px bg-neutral-300 dark:bg-dark-border" />
                    <div>
                      <p className="text-xs text-neutral-600 dark:text-dark-text-secondary">Avg Quality</p>
                      <p className="text-2xl font-bold text-primary-600 dark:text-dark-green-500">
                        {((coStatistics.avg_quality || 0) * 100).toFixed(0)}%
                      </p>
                    </div>
                    {coStatistics.bloom_levels && coStatistics.bloom_levels.length > 0 && (
                      <>
                        <div className="h-12 w-px bg-neutral-300 dark:bg-dark-border" />
                        <div>
                          <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mb-2">Bloom Levels</p>
                          <div className="flex gap-2 flex-wrap">
                            {coStatistics.bloom_levels.map((level) => (
                              <Badge key={level} variant="outline">{level}</Badge>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* COs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {aiCOs.map((co, index) => {
                    const getBloomColor = (level) => {
                      const colors = {
                        Apply: 'bg-blue-500',
                        Analyze: 'bg-purple-500',
                        Evaluate: 'bg-pink-500',
                        Create: 'bg-success-500',
                      };
                      return colors[level] || 'bg-neutral-500';
                    };

                    return (
                      <motion.div
                        key={co.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Card
                          className={`h-full transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${
                            co.approved ? 'border-success-500' : ''
                          }`}
                        >
                          <CardContent className="p-4">
                            {/* Header */}
                            <div className="flex justify-between mb-4 flex-wrap gap-2">
                              <div className="flex gap-2 flex-wrap">
                                <span className={`inline-flex items-center px-3 py-1 rounded-lg ${getBloomColor(co.bloom_level)} text-white font-bold text-sm`}>
                                  CO{co.co_number}
                                </span>
                                <Badge variant="outline" className={`${getBloomColor(co.bloom_level).replace('bg-', 'border-')} ${getBloomColor(co.bloom_level).replace('bg-', 'text-')}`}>
                                  {co.bloom_level}
                                </Badge>
                                {co.is_ai_generated ? (
                                  <Badge className="bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                                    <Sparkles className="w-3 h-3 mr-1" />
                                    AI
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Manual</Badge>
                                )}
                              </div>
                              {co.approved && (
                                <Badge variant="success">
                                  <BadgeCheck className="w-3 h-3 mr-1" />
                                  Approved
                                </Badge>
                              )}
                            </div>

                            {/* Description */}
                            <p className="text-sm text-neutral-700 dark:text-dark-text-secondary mb-4 leading-relaxed">
                              {co.description}
                            </p>

                            {/* Footer */}
                            <div className="pt-4 border-t border-neutral-200 dark:border-dark-border">
                              <p className="text-xs text-neutral-600 dark:text-dark-text-secondary flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" />
                                PO Mappings: {co.po_mappings_raw || co.po_numbers?.join(', ') || 'N/A'}
                              </p>
                              {co.generation_date && (
                                <p className="text-xs text-neutral-500 dark:text-dark-text-muted mt-1">
                                  Generated: {new Date(co.generation_date).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </>
            )}
            </div>{/* end collapsible wrapper */}
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs for different sections */}
      <Card>
        <div className="border-b border-neutral-200 dark:border-dark-border px-4">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab(0)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === 0
                  ? 'border-primary-500 dark:border-dark-green-500 text-primary-600 dark:text-dark-green-500 font-semibold'
                  : 'border-transparent text-neutral-600 dark:text-dark-text-secondary hover:text-neutral-800 dark:hover:text-dark-text-primary'
              }`}
            >
              <Users className="w-4 h-4" />
              Enrolled Students
            </button>
            <button
              onClick={() => setActiveTab(1)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === 1
                  ? 'border-primary-500 dark:border-dark-green-500 text-primary-600 dark:text-dark-green-500 font-semibold'
                  : 'border-transparent text-neutral-600 dark:text-dark-text-secondary hover:text-neutral-800 dark:hover:text-dark-text-primary'
              }`}
            >
              <FileText className="w-4 h-4" />
              Uploaded Marksheets
            </button>
            <button
              onClick={() => setActiveTab(2)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === 2
                  ? 'border-primary-500 dark:border-dark-green-500 text-primary-600 dark:text-dark-green-500 font-semibold'
                  : 'border-transparent text-neutral-600 dark:text-dark-text-secondary hover:text-neutral-800 dark:hover:text-dark-text-primary'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              Materials & Chat
            </button>
            <button
              onClick={() => setActiveTab(3)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === 3
                  ? 'border-primary-500 dark:border-dark-green-500 text-primary-600 dark:text-dark-green-500 font-semibold'
                  : 'border-transparent text-neutral-600 dark:text-dark-text-secondary hover:text-neutral-800 dark:hover:text-dark-text-primary'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              Course Exit Survey
            </button>
          </div>
        </div>

        {/* Students Tab */}
        {activeTab === 0 && (
          <CardContent className="p-6">
            {students.length === 0 ? (
              <EmptyState
                title="No Students Enrolled"
                message="No students have been enrolled in this course yet."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-neutral-200 dark:border-dark-border bg-neutral-50 dark:bg-dark-bg-secondary">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">USN</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">Name</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">Email</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">Department</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">Status</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-dark-text-primary">Enrolled On</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.slice(studentPage * studentsPerPage, (studentPage + 1) * studentsPerPage).map((student) => (
                        <tr key={student.id} className="border-b border-neutral-200 dark:border-dark-border hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary">
                          <td className="px-4 py-3">
                            <Badge variant="outline">{student.usn}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-neutral-400" />
                              <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                                {student.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-neutral-400" />
                              <span className="text-sm text-neutral-700 dark:text-dark-text-secondary">{student.email}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-neutral-700 dark:text-dark-text-secondary">{student.department || 'N/A'}</td>
                          <td className="px-4 py-3">
                            <Badge variant="success">{student.status || 'Active'}</Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-neutral-700 dark:text-dark-text-secondary">
                            {student.enrollment_date
                              ? new Date(student.enrollment_date).toLocaleDateString()
                              : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {students.length > studentsPerPage && (
                  <div className="mt-6 flex items-center justify-between border-t border-neutral-200 dark:border-dark-border pt-4">
                    <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">
                      Showing {studentPage * studentsPerPage + 1} to {Math.min((studentPage + 1) * studentsPerPage, students.length)} of {students.length} students
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setStudentPage(Math.max(0, studentPage - 1))}
                        disabled={studentPage === 0}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-neutral-600 dark:text-dark-text-secondary px-2">
                        Page {studentPage + 1} of {Math.ceil(students.length / studentsPerPage)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setStudentPage(Math.min(Math.ceil(students.length / studentsPerPage) - 1, studentPage + 1))}
                        disabled={studentPage >= Math.ceil(students.length / studentsPerPage) - 1}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        )}

        {/* Uploaded Marksheets Tab */}
        {activeTab === 1 && (
          <CardContent className="p-6">
            {marksheets.length === 0 ? (
              <EmptyState
                title="No Marksheets Uploaded"
                message="No mark sheets have been uploaded for this course yet. Upload marks from the upload page."
                action={() => navigate('/teacher/upload')}
                actionLabel="Upload Marks"
              />
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-lg font-bold text-neutral-800 dark:text-dark-text-primary">
                    Assessment Mark Sheets ({marksheets.length})
                  </h4>
                  <Button
                    onClick={() => navigate('/teacher/upload')}
                    className="bg-gradient-to-r from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload New Marksheet
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {marksheets.map((marksheet, index) => (
                    <motion.div
                      key={marksheet.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05, duration: 0.3 }}
                    >
                      <Card className="p-6 border-2 border-neutral-200 dark:border-dark-border transition-all duration-300 hover:border-primary-500 dark:hover:border-dark-green-500 hover:shadow-lg hover:-translate-y-1">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex gap-4 items-start">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 flex items-center justify-center flex-shrink-0">
                              <FileText className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1">
                              <h5 className="text-lg font-bold text-neutral-800 dark:text-dark-text-primary mb-1">
                                {marksheet.assessment_name || 'Assessment'}
                              </h5>
                              <p className="text-xs text-neutral-500 dark:text-dark-text-muted">
                                {marksheet.file_name}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteMarksheet(marksheet.id)}
                            className="p-2 rounded-lg text-error-600 hover:bg-error-50 dark:text-error-500 dark:hover:bg-error-900/20 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-neutral-600 dark:text-dark-text-secondary">Uploaded On:</span>
                            <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                              {new Date(marksheet.created_at || marksheet.uploadDate).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-neutral-600 dark:text-dark-text-secondary">Students:</span>
                            <Badge>{(marksheet.row_count || 1) - 1}</Badge>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-neutral-600 dark:text-dark-text-secondary">Columns:</span>
                            <Badge variant="outline">{marksheet.columns?.length || 0}</Badge>
                          </div>
                        </div>

                        {/* CO Mapping Upload */}
                        <div className="mt-4">
                          <COMappingUpload courseId={id} marksheet={marksheet} />
                        </div>

                        <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-dark-border">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDetails(marksheet)}
                            className="w-full"
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </Button>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        )}

        {/* Materials & Chat Tab */}
        {activeTab === 2 && (
          <CardContent className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Materials Section */}
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <FolderOpen className="w-5 h-5" />
                  Course Materials
                </h3>
                <CourseMaterials courseId={id} isTeacher={true} />
              </div>

              {/* Chat Section */}
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Course Chat
                </h3>
                <CourseChat courseId={id} />
              </div>
            </div>
          </CardContent>
        )}

        {/* Course Exit Survey Tab */}
        {activeTab === 3 && (
          <CardContent className="p-0">
            <CESAdmin courseId={id} embedded={true} />
          </CardContent>
        )}
      </Card>

      {/* Marksheet Details Modal */}
      {detailsModalOpen && selectedMarksheet && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-dark-bg-secondary rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
          >
            <div className="bg-gradient-to-r from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 text-white p-6 flex items-center gap-4">
              <FileText className="w-6 h-6" />
              <h2 className="text-2xl font-bold">Marksheet Details</h2>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Assessment Information */}
              <div className="mb-6">
                <p className="text-xs font-bold text-neutral-500 dark:text-dark-text-muted uppercase tracking-wide mb-3">
                  Assessment Information
                </p>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-neutral-200 dark:border-dark-border">
                    <span className="text-sm font-semibold text-neutral-600 dark:text-dark-text-secondary">Assessment Name</span>
                    <span className="text-sm text-neutral-800 dark:text-dark-text-primary">{selectedMarksheet.assessment_name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-neutral-200 dark:border-dark-border">
                    <span className="text-sm font-semibold text-neutral-600 dark:text-dark-text-secondary">File Name</span>
                    <span className="text-sm text-neutral-800 dark:text-dark-text-primary">{selectedMarksheet.file_name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-neutral-200 dark:border-dark-border">
                    <span className="text-sm font-semibold text-neutral-600 dark:text-dark-text-secondary">Table Name</span>
                    <span className="text-sm text-neutral-800 dark:text-dark-text-primary font-mono">{selectedMarksheet.table_name || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Statistics */}
              <div className="mb-6">
                <p className="text-xs font-bold text-neutral-500 dark:text-dark-text-muted uppercase tracking-wide mb-3">
                  Statistics
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-4 text-center border-2 border-primary-500 bg-primary-50 dark:bg-primary-900/20">
                    <p className="text-3xl font-bold text-primary-600 dark:text-dark-green-500">
                      {(selectedMarksheet.row_count || 1) - 1}
                    </p>
                    <p className="text-sm font-semibold text-neutral-600 dark:text-dark-text-secondary">Students</p>
                  </Card>
                  <Card className="p-4 text-center border-2 border-secondary-500 bg-secondary-50 dark:bg-secondary-900/20">
                    <p className="text-3xl font-bold text-secondary-600 dark:text-secondary-400">
                      {selectedMarksheet.columns?.length || 0}
                    </p>
                    <p className="text-sm font-semibold text-neutral-600 dark:text-dark-text-secondary">Columns</p>
                  </Card>
                </div>
              </div>

              {/* Columns */}
              {selectedMarksheet.columns && selectedMarksheet.columns.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-bold text-neutral-500 dark:text-dark-text-muted uppercase tracking-wide mb-3">
                    Columns ({selectedMarksheet.columns.length})
                  </p>
                  <Card className="p-4 max-h-48 overflow-y-auto">
                    <div className="flex flex-wrap gap-2">
                      {selectedMarksheet.columns.map((col, index) => (
                        <Badge key={index} variant="outline" className="font-mono text-xs">
                          {col}
                        </Badge>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {/* Data Table */}
              <div>
                <p className="text-xs font-bold text-neutral-500 dark:text-dark-text-muted uppercase tracking-wide mb-3">
                  Data Preview
                </p>
                {loadingData ? (
                  <div className="flex justify-center py-8">
                    <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : marksheetData && marksheetData.rows && marksheetData.rows.length > 0 ? (
                  <div className="border border-neutral-200 dark:border-dark-border rounded-2xl overflow-hidden max-h-96 overflow-y-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-primary-500 dark:bg-dark-green-600">
                        <tr>
                          {marksheetData.columns.map((col, index) => (
                            <th
                              key={index}
                              className="px-4 py-2 text-left text-xs font-bold text-white whitespace-nowrap"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {marksheetData.rows.map((row, rowIndex) => (
                          <tr
                            key={rowIndex}
                            className="border-b border-neutral-200 dark:border-dark-border hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary"
                          >
                            {marksheetData.columns.map((col, colIndex) => (
                              <td
                                key={colIndex}
                                className="px-4 py-2 text-xs text-neutral-700 dark:text-dark-text-secondary whitespace-nowrap"
                              >
                                {row[col] !== null && row[col] !== undefined ? String(row[col]) : '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Card className="p-6 text-center">
                    <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">No data available</p>
                  </Card>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-neutral-200 dark:border-dark-border flex justify-end">
              <Button onClick={handleCloseDetails} variant="outline">
                Close
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Manual CO Manager Modal */}
      <ManualCOManager
        open={manualCOModalOpen}
        onClose={() => setManualCOModalOpen(false)}
        courseId={id}
        onSuccess={() => {
          loadAICOs();
          loadCourseDetails();
        }}
      />
    </PageLayout>
  );
};

export default CourseDetail;
