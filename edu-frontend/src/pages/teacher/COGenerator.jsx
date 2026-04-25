import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CloudUpload,
  Sparkles,
  CheckCircle,
  RotateCcw,
  Download,
  ChevronDown,
  Info,
  TrendingUp,
  GraduationCap,
  Save,
  ArrowRight,
  ArrowLeft,
  BadgeCheck,
  Star,
  Plus,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTheme } from '../../contexts/ThemeContext';
import { courseAPI, aiCOAPI } from '../../services/api';
import {
  generateCOs,
  regenerateCO,
  getDashboardMetrics,
  submitFeedback as submitCOFeedback,
  healthCheck,
} from '../../services/coGeneratorAPI';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Alert } from '../../components/ui/alert';

const COGenerator = () => {
  const { isDark } = useTheme();

  // Course selection state
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedCourseDetails, setSelectedCourseDetails] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [courseStatistics, setCourseStatistics] = useState(null);

  // Wizard state
  const [activeStep, setActiveStep] = useState(0);
  const steps = ['Select Course', 'Upload Materials', 'Configure & Generate', 'Review & Save'];

  // State management
  const [files, setFiles] = useState([]);
  const [numApply, setNumApply] = useState(2);
  const [numAnalyze, setNumAnalyze] = useState(2);
  const [useChromaDB, setUseChromaDB] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatedCOs, setGeneratedCOs] = useState([]);
  const [pipelineMetrics, setPipelineMetrics] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [savedToDB, setSavedToDB] = useState(false);
  const [savingToDB, setSavingToDB] = useState(false);

  // Dashboard metrics
  const [serviceHealth, setServiceHealth] = useState(null);

  // Dialog states
  const [regenerateDialog, setRegenerateDialog] = useState(false);
  const [selectedCO, setSelectedCO] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');

  // Load initial data
  useEffect(() => {
    loadInitialData();
    loadTeacherCourses();
  }, []);

  // Load course statistics when course is selected
  useEffect(() => {
    if (selectedCourse) {
      loadCourseStatistics();
    }
  }, [selectedCourse]);

  const loadTeacherCourses = async () => {
    try {
      const response = await courseAPI.getAll();
      const coursesData = response.data.courses || response.data.data || response.data;
      setCourses(Array.isArray(coursesData) ? coursesData : []);
      setLoadingCourses(false);
    } catch (err) {
      console.error('Error loading courses:', err);
      setError('Failed to load courses');
      setCourses([]);
      setLoadingCourses(false);
    }
  };

  const loadCourseStatistics = async () => {
    try {
      const stats = await aiCOAPI.getStatistics(selectedCourse);
      setCourseStatistics(stats.data.statistics);
    } catch (err) {
      console.error('Error loading statistics:', err);
    }
  };

  const loadInitialData = async () => {
    try {
      const health = await healthCheck();
      setServiceHealth(health);
    } catch (err) {
      console.error('Error loading initial data:', err);
    }
  };

  const handleCourseSelect = (courseId) => {
    setSelectedCourse(courseId);
    const course = Array.isArray(courses) ? courses.find(c => c.id === courseId) : null;
    setSelectedCourseDetails(course);
    setError(null);
  };

  const handleNext = () => {
    if (activeStep === 0 && !selectedCourse) {
      setError('Please select a course first');
      return;
    }
    if (activeStep === 1 && files.length === 0) {
      setError('Please upload at least one file');
      return;
    }
    setActiveStep((prev) => prev + 1);
    setError(null);
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
    setError(null);
  };

  const handleFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files);
    setFiles(selectedFiles);
    setError(null);
  };

  const handleRemoveFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleGenerateCOs = async () => {
    if (numApply + numAnalyze !== 4) {
      setError('Total number of COs must equal 4');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await generateCOs(files, numApply, numAnalyze, useChromaDB);

      setGeneratedCOs(result.cos);
      setPipelineMetrics(result.pipeline_metrics);
      setSessionId(result.session_id);
      setSuccess(`Successfully generated ${result.cos.length} Course Outcomes!`);
      setActiveStep(3);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to generate COs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToDB = async () => {
    setSavingToDB(true);
    try {
      const saveData = {
        courseId: selectedCourse,
        sessionId: sessionId,
        cos: generatedCOs,
        pipelineMetrics: pipelineMetrics,
        configuration: {
          num_apply: numApply,
          num_analyze: numAnalyze,
          use_chromadb: useChromaDB,
        },
        fileNames: files.map(f => f.name),
      };

      await aiCOAPI.save(saveData);
      setSavedToDB(true);
      setSuccess('COs saved to database successfully! They are now visible in the course detail page.');

      loadCourseStatistics();
    } catch (err) {
      setError('Failed to save COs to database');
      console.error(err);
    } finally {
      setSavingToDB(false);
    }
  };

  const handleRegenerateCO = async () => {
    if (!selectedCO) return;

    setLoading(true);
    try {
      const result = await regenerateCO(
        selectedCO.co_num,
        selectedCO.co_text,
        selectedCO.bloom_level,
        feedbackText
      );

      const updatedCOs = generatedCOs.map((co) =>
        co.co_num === selectedCO.co_num
          ? {
              ...co,
              co_text: result.regenerated_text,
              reward_score: result.quality_metrics.overall,
              individual_scores: {
                vtu: result.quality_metrics.vtu,
                obe: result.quality_metrics.obe,
                bloom: result.quality_metrics.bloom,
              },
            }
          : co
      );

      setGeneratedCOs(updatedCOs);
      setSuccess('CO regenerated successfully!');
      setRegenerateDialog(false);
      setFeedbackText('');
      setSavedToDB(false);
    } catch (err) {
      setError('Failed to regenerate CO. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveCO = async (co, approved) => {
    if (!sessionId) return;

    try {
      await submitCOFeedback(sessionId, co.co_num, approved);

      setGeneratedCOs(generatedCOs.map((c) =>
        c.co_num === co.co_num ? { ...c, approved } : c
      ));
    } catch (err) {
      console.error('Error submitting feedback:', err);
    }
  };

  const getBloomLevelColor = (level) => {
    const colors = {
      Apply: 'bg-blue-500',
      Analyze: 'bg-purple-500',
      Evaluate: 'bg-pink-500',
      Create: 'bg-success-500',
    };
    return colors[level] || 'bg-neutral-500';
  };

  const getQualityColor = (score) => {
    if (score >= 0.8) return 'success';
    if (score >= 0.6) return 'warning';
    return 'error';
  };

  // Render step content
  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return renderCourseSelection();
      case 1:
        return renderFileUpload();
      case 2:
        return renderConfiguration();
      case 3:
        return renderReviewAndSave();
      default:
        return null;
    }
  };

  const renderCourseSelection = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 flex items-center justify-center">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-neutral-800 dark:text-dark-text-primary">
                Select Course / Subject
              </h2>
              <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">
                Choose the course for which you want to generate COs
              </p>
            </div>
          </div>

          {courseStatistics && courseStatistics.total_cos > 0 && selectedCourse && (
            <Alert className="mb-6 bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800">
              <Info className="w-4 h-4" />
              <div className="ml-2">
                <p className="font-semibold text-primary-800 dark:text-primary-200">Existing COs Found</p>
                <p className="text-sm text-primary-700 dark:text-primary-300">
                  This course already has {courseStatistics.total_cos} AI-generated COs
                  ({courseStatistics.approved_cos} approved). Generating new COs will replace them.
                </p>
              </div>
            </Alert>
          )}

          <div className="relative">
            <label htmlFor="course-select" className="block text-sm font-semibold text-neutral-700 dark:text-dark-text-primary mb-2">
              Select Course *
            </label>
            <select
              id="course-select"
              value={selectedCourse}
              onChange={(e) => handleCourseSelect(e.target.value)}
              disabled={loadingCourses}
              className="w-full px-4 py-3 bg-white dark:bg-dark-bg-secondary border-2 border-neutral-300 dark:border-dark-border rounded-xl text-neutral-800 dark:text-dark-text-primary focus:outline-none focus:border-primary-500 dark:focus:border-dark-green-500 disabled:opacity-50"
            >
              {loadingCourses ? (
                <option>Loading courses...</option>
              ) : !Array.isArray(courses) || courses.length === 0 ? (
                <option>No courses available</option>
              ) : (
                <>
                  <option value="">-- Select a course --</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} - {course.name} (Semester {course.semester}, {course.credits} Credits)
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          {selectedCourseDetails && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-6"
            >
              <Card className="border-2 border-primary-500 dark:border-dark-green-500 bg-primary-50/30 dark:bg-primary-900/10">
                <CardContent className="p-6">
                  <h3 className="text-lg font-bold text-neutral-800 dark:text-dark-text-primary mb-4">
                    Selected Course Details
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-neutral-600 dark:text-dark-text-secondary">Code</p>
                      <p className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">{selectedCourseDetails.code}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-600 dark:text-dark-text-secondary">Name</p>
                      <p className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">{selectedCourseDetails.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-600 dark:text-dark-text-secondary">Semester</p>
                      <p className="text-sm text-neutral-800 dark:text-dark-text-primary">{selectedCourseDetails.semester}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-600 dark:text-dark-text-secondary">Credits</p>
                      <p className="text-sm text-neutral-800 dark:text-dark-text-primary">{selectedCourseDetails.credits}</p>
                    </div>
                    {selectedCourseDetails.description && (
                      <div className="col-span-2">
                        <p className="text-xs text-neutral-600 dark:text-dark-text-secondary">Description</p>
                        <p className="text-sm text-neutral-800 dark:text-dark-text-primary">{selectedCourseDetails.description}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );

  const renderFileUpload = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 flex items-center justify-center">
              <CloudUpload className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-neutral-800 dark:text-dark-text-primary">
                Upload Course Materials
              </h2>
              <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">
                Upload syllabi, lecture notes, or course content (PDF, PPTX, DOCX, TXT)
              </p>
            </div>
          </div>

          <label className="block">
            <div className="border-4 border-dashed border-primary-500 dark:border-dark-green-500 rounded-2xl p-12 text-center bg-primary-50/30 dark:bg-primary-900/10 hover:bg-primary-50/50 dark:hover:bg-primary-900/20 transition-colors cursor-pointer">
              <CloudUpload className="w-16 h-16 text-primary-600 dark:text-dark-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary mb-2">
                Click to Choose Files or Drag & Drop
              </h3>
              <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">
                Supported formats: PDF, PPTX, DOCX, TXT (Multiple files allowed)
              </p>
            </div>
            <input
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.ppt,.pptx,.doc,.docx,.txt"
              onChange={handleFileChange}
            />
          </label>

          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-6"
            >
              <h3 className="text-lg font-bold text-neutral-800 dark:text-dark-text-primary mb-4">
                Selected Files ({files.length})
              </h3>
              <div className="space-y-2">
                {files.map((file, index) => (
                  <Card key={index} className="bg-neutral-50 dark:bg-dark-bg-secondary">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <CloudUpload className="w-5 h-5 text-primary-600 dark:text-dark-green-500" />
                          <div>
                            <p className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">{file.name}</p>
                            <p className="text-xs text-neutral-600 dark:text-dark-text-secondary">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveFile(index)}
                          className="p-2 rounded-lg text-error-600 hover:bg-error-50 dark:text-error-500 dark:hover:bg-error-900/20 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );

  const renderConfiguration = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-neutral-800 dark:text-dark-text-primary">
                Configure & Generate
              </h2>
              <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">
                Set CO distribution and generate AI-powered course outcomes
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card className="bg-neutral-50 dark:bg-dark-bg-secondary">
              <CardContent className="p-6">
                <h3 className="text-lg font-bold text-neutral-800 dark:text-dark-text-primary mb-4">
                  Apply-level COs
                </h3>
                <div className="flex justify-between mb-3">
                  <span className="text-sm text-neutral-600 dark:text-dark-text-secondary">Count</span>
                  <Badge className="bg-primary-500 text-white">{numApply}</Badge>
                </div>
                <input
                  type="range"
                  min="0"
                  max="4"
                  value={numApply}
                  onChange={(e) => {
                    setNumApply(parseInt(e.target.value));
                    setNumAnalyze(4 - parseInt(e.target.value));
                  }}
                  className="w-full h-2 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-lg appearance-none cursor-pointer accent-primary-500"
                />
                <p className="text-xs text-neutral-500 dark:text-dark-text-muted mt-2">
                  Apply: Demonstrate, Implement, Use, Execute
                </p>
              </CardContent>
            </Card>

            <Card className="bg-neutral-50 dark:bg-dark-bg-secondary">
              <CardContent className="p-6">
                <h3 className="text-lg font-bold text-neutral-800 dark:text-dark-text-primary mb-4">
                  Analyze-level COs
                </h3>
                <div className="flex justify-between mb-3">
                  <span className="text-sm text-neutral-600 dark:text-dark-text-secondary">Count</span>
                  <Badge className="bg-secondary-500 text-white">{numAnalyze}</Badge>
                </div>
                <input
                  type="range"
                  min="0"
                  max="4"
                  value={numAnalyze}
                  onChange={(e) => {
                    setNumAnalyze(parseInt(e.target.value));
                    setNumApply(4 - parseInt(e.target.value));
                  }}
                  className="w-full h-2 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-lg appearance-none cursor-pointer accent-secondary-500"
                />
                <p className="text-xs text-neutral-500 dark:text-dark-text-muted mt-2">
                  Analyze: Examine, Compare, Investigate, Differentiate
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-neutral-50 dark:bg-dark-bg-secondary mb-6">
            <CardContent className="p-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useChromaDB}
                  onChange={(e) => setUseChromaDB(e.target.checked)}
                  className="w-5 h-5 rounded border-neutral-300 dark:border-dark-border text-primary-500 focus:ring-primary-500"
                />
                <div>
                  <p className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                    Use ChromaDB for Enhanced Context Retrieval
                  </p>
                  <p className="text-xs text-neutral-600 dark:text-dark-text-secondary">
                    Leverages vector database for better syllabus-aligned CO generation
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>

          <Button
            onClick={handleGenerateCOs}
            disabled={loading}
            className="w-full bg-gradient-to-r from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 text-white py-6 text-lg font-bold shadow-lg hover:shadow-xl transition-all"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin mr-3" />
                Generating Course Outcomes...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-3" />
                Generate Course Outcomes with AI
              </>
            )}
          </Button>

          {loading && (
            <div className="mt-6">
              <div className="h-2 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary-500 via-secondary-500 to-accent-500 animate-pulse" style={{ width: '100%' }} />
              </div>
              <p className="text-sm text-neutral-600 dark:text-dark-text-secondary mt-3 text-center">
                Processing {files.length} file(s) and generating COs with AI magic...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );

  const renderReviewAndSave = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Generated COs */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-success-500 to-success-600 flex items-center justify-center">
                    <BadgeCheck className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-neutral-800 dark:text-dark-text-primary">
                      Generated Course Outcomes
                    </h2>
                    <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">
                      Review, approve, and save to {selectedCourseDetails?.code}
                    </p>
                  </div>
                </div>
                {!savedToDB && (
                  <Badge variant="warning" className="flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Not Saved
                  </Badge>
                )}
              </div>

              <div className="space-y-4">
                {generatedCOs.map((co, index) => {
                  const bloomColor = getBloomLevelColor(co.bloom_level);
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className={`border-2 ${co.approved ? 'border-success-500' : 'border-neutral-200 dark:border-dark-border'}`}>
                        <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex-1">
                              <div className="flex gap-2 flex-wrap mb-3">
                                <span className={`inline-flex items-center px-3 py-1 rounded-lg ${bloomColor} text-white font-bold text-sm`}>
                                  CO{co.co_num}
                                </span>
                                <Badge variant="outline" className={`${bloomColor.replace('bg-', 'border-')} ${bloomColor.replace('bg-', 'text-')}`}>
                                  {co.bloom_level}
                                </Badge>
                                {co.approved && (
                                  <Badge variant="success" className="flex items-center gap-1">
                                    <BadgeCheck className="w-3 h-3" />
                                    Approved
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-neutral-800 dark:text-dark-text-primary mb-2">
                                {co.co_text}
                              </p>
                              <p className="text-xs text-neutral-600 dark:text-dark-text-secondary">
                                PO Mappings: {co.po_mappings}
                              </p>
                            </div>

                            <div className="flex gap-2 ml-4">
                              <button
                                onClick={() => handleApproveCO(co, true)}
                                className={`p-2 rounded-lg ${co.approved ? 'bg-success-100 text-success-600 dark:bg-success-900/30 dark:text-success-500' : 'bg-neutral-100 text-neutral-600 dark:bg-dark-bg-tertiary dark:text-dark-text-secondary'} hover:bg-success-200 dark:hover:bg-success-900/50 transition-colors`}
                              >
                                <CheckCircle className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedCO(co);
                                  setRegenerateDialog(true);
                                }}
                                className="p-2 rounded-lg bg-neutral-100 text-neutral-600 dark:bg-dark-bg-tertiary dark:text-dark-text-secondary hover:bg-neutral-200 dark:hover:bg-dark-bg-secondary transition-colors"
                              >
                                <RotateCcw className="w-5 h-5" />
                              </button>
                            </div>
                          </div>

                          {/* Quality Metrics */}
                          <details className="group">
                            <summary className="cursor-pointer flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-dark-text-primary p-3 bg-neutral-50 dark:bg-dark-bg-secondary rounded-lg">
                              <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />
                              Quality Metrics Breakdown
                            </summary>
                            <div className="grid grid-cols-2 gap-4 p-4">
                              {Object.entries(co.individual_scores || {}).map(([key, value]) => (
                                <div key={key}>
                                  <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mb-1 capitalize">
                                    {key === 'vtu' ? 'VTU Compliance' : key === 'obe' ? 'OBE Alignment' : key}
                                  </p>
                                  <div className="h-2 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${value >= 0.8 ? 'bg-success-500' : value >= 0.6 ? 'bg-warning-500' : 'bg-error-500'}`}
                                      style={{ width: `${value * 100}%` }}
                                    />
                                  </div>
                                  <p className="text-xs font-bold text-neutral-800 dark:text-dark-text-primary mt-1">
                                    {(value * 100).toFixed(0)}%
                                  </p>
                                </div>
                              ))}
                            </div>
                          </details>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>

              <div className="h-px bg-neutral-200 dark:bg-dark-border my-6" />

              <Button
                onClick={handleSaveToDB}
                disabled={savingToDB || savedToDB}
                className={`w-full py-6 text-lg font-bold ${
                  savedToDB
                    ? 'bg-gradient-to-r from-success-500 to-success-600'
                    : 'bg-gradient-to-r from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600'
                }`}
              >
                {savingToDB ? (
                  <>
                    <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin mr-3" />
                    Saving to Database...
                  </>
                ) : savedToDB ? (
                  <>
                    <BadgeCheck className="w-5 h-5 mr-3" />
                    Saved to Database Successfully!
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5 mr-3" />
                    Save COs to {selectedCourseDetails?.code}
                  </>
                )}
              </Button>

              {savedToDB && (
                <Alert className="mt-4 bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800">
                  <BadgeCheck className="w-4 h-4 text-success-600 dark:text-success-500" />
                  <div className="ml-2">
                    <p className="font-semibold text-success-800 dark:text-success-200">Success!</p>
                    <p className="text-sm text-success-700 dark:text-success-300">
                      COs have been saved to <strong>{selectedCourseDetails?.code}</strong>.
                      They are now visible in the course detail page.
                    </p>
                  </div>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pipeline Metrics */}
        {/* <div>
          {pipelineMetrics && (
            <Card className="sticky top-20">
              <CardContent className="p-6">
                <h3 className="text-lg font-bold text-neutral-800 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Pipeline Metrics
                </h3>

                <div className="space-y-4">
                  <Card className="bg-neutral-50 dark:bg-dark-bg-secondary">
                    <CardContent className="p-4">
                      <p className="text-xs font-bold text-neutral-600 dark:text-dark-text-secondary mb-3">Quality Scores</p>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mb-1">Avg Quality</p>
                          <div className="h-2 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-full overflow-hidden">
                            <div className="h-full bg-primary-500" style={{ width: `${pipelineMetrics.average_quality_score * 100}%` }} />
                          </div>
                          <p className="text-xs font-bold text-neutral-800 dark:text-dark-text-primary mt-1">
                            {(pipelineMetrics.average_quality_score * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mb-1">VTU Compliance</p>
                          <div className="h-2 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-full overflow-hidden">
                            <div className="h-full bg-success-500" style={{ width: `${pipelineMetrics.average_vtu_compliance * 100}%` }} />
                          </div>
                          <p className="text-xs font-bold text-neutral-800 dark:text-dark-text-primary mt-1">
                            {(pipelineMetrics.average_vtu_compliance * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mb-1">Bloom Accuracy</p>
                          <div className="h-2 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-full overflow-hidden">
                            <div className="h-full bg-warning-500" style={{ width: `${pipelineMetrics.bloom_classification_accuracy * 100}%` }} />
                          </div>
                          <p className="text-xs font-bold text-neutral-800 dark:text-dark-text-primary mt-1">
                            {(pipelineMetrics.bloom_classification_accuracy * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-neutral-50 dark:bg-dark-bg-secondary">
                    <CardContent className="p-4">
                      <p className="text-xs font-bold text-neutral-600 dark:text-dark-text-secondary mb-3">Performance</p>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-xs text-neutral-600 dark:text-dark-text-secondary">Document Processing</span>
                          <span className="text-xs font-bold text-neutral-800 dark:text-dark-text-primary">
                            {pipelineMetrics.document_processing_ms.toFixed(0)}ms
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-neutral-600 dark:text-dark-text-secondary">LLM Inference</span>
                          <span className="text-xs font-bold text-neutral-800 dark:text-dark-text-primary">
                            {pipelineMetrics.llm_inference_ms.toFixed(0)}ms
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-neutral-600 dark:text-dark-text-secondary">Refinement</span>
                          <span className="text-xs font-bold text-neutral-800 dark:text-dark-text-primary">
                            {pipelineMetrics.refinement_ms.toFixed(0)}ms
                          </span>
                        </div>
                        <div className="h-px bg-neutral-200 dark:bg-dark-border my-2" />
                        <div className="flex justify-between">
                          <span className="text-xs font-bold text-neutral-700 dark:text-dark-text-primary">Total Time</span>
                          <span className="text-xs font-bold text-primary-600 dark:text-dark-green-500">
                            {pipelineMetrics.total_pipeline_ms.toFixed(0)}ms
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          )}
        </div> */}
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-dark-bg-primary py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-18 h-18 rounded-3xl bg-gradient-to-br from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 flex items-center justify-center shadow-lg">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600 bg-clip-text text-transparent">
                AI-Powered CO Generator
              </h1>
              <p className="text-neutral-600 dark:text-dark-text-secondary">
                Generate VTU-aligned Course Outcomes with advanced AI pipeline
              </p>
            </div>
          </div>

          {serviceHealth && (
            <Alert className={serviceHealth.status === 'healthy' ? 'bg-success-50 dark:bg-success-900/20 border-success-200' : 'bg-error-50 border-error-200'}>
              <BadgeCheck className="w-4 h-4" />
              <p className="ml-2 text-sm">
                Service Status: <strong>{serviceHealth.status.toUpperCase()}</strong>
              </p>
            </Alert>
          )}
        </motion.div>

        {/* Alerts */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <Alert className="bg-error-50 dark:bg-error-900/20 border-error-200 dark:border-error-800">
                <Info className="w-4 h-4 text-error-600 dark:text-error-500" />
                <div className="ml-2">
                  <p className="text-sm text-error-800 dark:text-error-200">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="text-xs text-error-600 dark:text-error-400 underline mt-1"
                  >
                    Dismiss
                  </button>
                </div>
              </Alert>
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <Alert className="bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800">
                <CheckCircle className="w-4 h-4 text-success-600 dark:text-success-500" />
                <div className="ml-2">
                  <p className="text-sm text-success-800 dark:text-success-200">{success}</p>
                  <button
                    onClick={() => setSuccess(null)}
                    className="text-xs text-success-600 dark:text-success-400 underline mt-1"
                  >
                    Dismiss
                  </button>
                </div>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stepper */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex justify-between">
              {steps.map((label, index) => (
                <div key={label} className="flex-1 flex items-center">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                        index <= activeStep
                          ? 'bg-primary-500 dark:bg-dark-green-500 text-white'
                          : 'bg-neutral-200 dark:bg-dark-bg-tertiary text-neutral-500'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <p className={`text-xs mt-2 text-center ${index <= activeStep ? 'text-neutral-800 dark:text-dark-text-primary font-semibold' : 'text-neutral-500'}`}>
                      {label}
                    </p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-1 ${index < activeStep ? 'bg-primary-500 dark:bg-dark-green-500' : 'bg-neutral-200 dark:bg-dark-bg-tertiary'}`} />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Step Content */}
        <div className="mb-6">
          {renderStepContent()}
        </div>

        {/* Navigation */}
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={activeStep === 0}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              {activeStep < steps.length - 1 && (
                <Button
                  onClick={handleNext}
                  className="bg-gradient-to-r from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600"
                >
                  {activeStep === steps.length - 2 ? 'Review' : 'Next'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Regenerate Dialog */}
        {regenerateDialog && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-dark-bg-secondary rounded-3xl shadow-2xl max-w-md w-full"
            >
              <div className="p-6 border-b border-neutral-200 dark:border-dark-border">
                <h2 className="text-2xl font-bold text-neutral-800 dark:text-dark-text-primary">
                  Regenerate Course Outcome
                </h2>
              </div>
              <div className="p-6">
                {selectedCO && (
                  <>
                    <p className="text-sm text-neutral-600 dark:text-dark-text-secondary mb-4">
                      Current CO: {selectedCO.co_text}
                    </p>
                    <textarea
                      rows={4}
                      placeholder="Enter specific feedback or instructions for regeneration..."
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-neutral-300 dark:border-dark-border rounded-xl bg-white dark:bg-dark-bg-primary text-neutral-800 dark:text-dark-text-primary placeholder:text-neutral-500 focus:outline-none focus:border-primary-500 dark:focus:border-dark-green-500"
                    />
                  </>
                )}
              </div>
              <div className="p-6 border-t border-neutral-200 dark:border-dark-border flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setRegenerateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleRegenerateCO}
                  disabled={loading}
                  className="bg-gradient-to-r from-primary-500 to-secondary-500 dark:from-dark-green-500 dark:to-secondary-600"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  ) : (
                    <RotateCcw className="w-4 h-4 mr-2" />
                  )}
                  Regenerate
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

export default COGenerator;
