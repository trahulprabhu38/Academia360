import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus,
  GraduationCap,
  MoreVertical,
  Edit,
  Trash2,
  BarChart3,
  Users,
  LayoutDashboard,
  Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { courseAPI } from '../../services/api';
import { Spinner } from '../../components/ui/progress';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

const Courses = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [selectedSemester, setSelectedSemester] = useState('all');
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    semester: '',
    year: '',
    credits: 3,
    course_type: 'STANDALONE_THEORY',
  });

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await courseAPI.getAll();
      setCourses(response.data.data || []);
    } catch (err) {
      console.error('Error loading courses:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDialogOpen = (course = null) => {
    if (course) {
      setEditMode(true);
      setSelectedCourse(course);
      setFormData({
        code: course.code,
        name: course.name,
        description: course.description || '',
        semester: course.semester,
        year: course.year,
        credits: course.credits || 3,
        course_type: course.course_type || 'STANDALONE_THEORY',
      });
    } else {
      setEditMode(false);
      setSelectedCourse(null);
      setFormData({
        code: '',
        name: '',
        description: '',
        semester: '',
        year: new Date().getFullYear(),
        credits: 3,
        course_type: 'STANDALONE_THEORY',
      });
    }
    setDialogOpen(true);
    setMenuAnchor(null);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditMode(false);
    setSelectedCourse(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editMode) {
        await courseAPI.update(selectedCourse.id, formData);
        toast.success('Course updated successfully!');
      } else {
        await courseAPI.create(formData);
        toast.success('Course created successfully!');
      }
      handleDialogClose();
      loadCourses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (courseId) => {
    if (!window.confirm('Are you sure you want to delete this course? This action cannot be undone.')) {
      return;
    }
    try {
      await courseAPI.delete(courseId);
      toast.success('Course deleted successfully!');
      loadCourses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleMenuOpen = (event, course) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setSelectedCourse(course);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedCourse(null);
  };

  const availableSemesters = [...new Set(courses.map((c) => c.semester))].sort((a, b) => a - b);
  const filteredCourses =
    selectedSemester === 'all'
      ? courses
      : courses.filter((c) => String(c.semester) === String(selectedSemester));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-neutral-600 dark:text-dark-text-secondary">Loading courses...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-error-600 mb-4">Error loading courses</p>
          <button onClick={loadCourses} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-neutral-800 dark:text-dark-text-primary">
            My Courses
          </h1>
          <p className="text-sm text-neutral-600 dark:text-dark-text-secondary mt-1">
            Manage your courses and view analytics
          </p>
        </div>
        <Button onClick={() => handleDialogOpen()} size="lg">
          <Plus className="w-5 h-5 mr-2" />
          Create Course
        </Button>
      </div>

      {/* Semester Filter */}
      {courses.length > 0 && (
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-neutral-500 dark:text-dark-text-secondary" />
          <span className="text-sm font-medium text-neutral-600 dark:text-dark-text-secondary">Filter by Semester:</span>
          <select
            value={selectedSemester}
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="text-sm rounded-lg border border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-800 dark:text-dark-text-primary px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 dark:focus:ring-dark-green-500 cursor-pointer"
          >
            <option value="all">All Semesters</option>
            {availableSemesters.map((sem) => (
              <option key={sem} value={sem}>
                Semester {sem}
              </option>
            ))}
          </select>
          {selectedSemester !== 'all' && (
            <button
              onClick={() => setSelectedSemester('all')}
              className="text-xs text-primary-600 dark:text-dark-green-500 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {courses.length === 0 ? (
        <Card className="text-center py-12 bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-dark-bg-secondary dark:to-dark-bg-tertiary">
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <GraduationCap className="w-20 h-20 text-primary-600 dark:text-dark-green-500 opacity-80" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-800 dark:text-dark-text-primary">
              No Courses Created
            </h2>
            <p className="text-neutral-600 dark:text-dark-text-secondary max-w-md mx-auto">
              Get started by creating your first course
            </p>
            <div className="pt-2">
              <Button onClick={() => handleDialogOpen()} size="lg">
                <Plus className="w-5 h-5 mr-2" />
                Create Course
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : filteredCourses.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-neutral-500 dark:text-dark-text-secondary text-lg font-medium">
            No courses found for Semester {selectedSemester}
          </p>
          <button
            onClick={() => setSelectedSemester('all')}
            className="mt-3 text-sm text-primary-600 dark:text-dark-green-500 hover:underline"
          >
            Show all semesters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCourses.map((course, index) => {
            const gradientColors = [
              'from-primary-500 to-primary-600 dark:from-dark-green-500 dark:to-dark-green-600',
              'from-secondary-500 to-secondary-600 dark:from-secondary-600 dark:to-secondary-700',
              'from-success-500 to-success-600 dark:from-success-600 dark:to-success-700',
              'from-accent-500 to-accent-600 dark:from-accent-600 dark:to-accent-700',
            ];

            return (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
                whileHover={{ scale: 1.02, y: -4 }}
              >
                <Card
                  onClick={() => navigate(`/teacher/courses/${course.id}`)}
                  className="cursor-pointer hover:shadow-xl transition-all duration-300 overflow-hidden"
                >
                  {/* Header with Gradient */}
                  <div className={`bg-gradient-to-br ${gradientColors[index % 4]} p-6 text-white relative`}>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-bold">{course.code}</h3>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-white/25 text-white border-white/30 hover:bg-white/35">
                          Sem {course.semester}
                        </Badge>
                        <button
                          onClick={(e) => handleMenuOpen(e, course)}
                          className="text-white hover:bg-white/20 p-1 rounded transition-colors"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-white/95">{course.name}</p>
                  </div>

                  <CardContent className="p-6 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-neutral-600 dark:text-dark-text-secondary">
                        Credits
                      </span>
                      <Badge variant="outline">{course.credits || 3}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-neutral-600 dark:text-dark-text-secondary">
                        Academic Year
                      </span>
                      <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text-primary">
                        {course.year}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-neutral-600 dark:text-dark-text-secondary">
                        Students Enrolled
                      </span>
                      <Badge>
                        <Users className="w-3 h-3 mr-1" />
                        {course.enrolled_students || 0}
                      </Badge>
                    </div>

                    {course.description && (
                      <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mt-2 truncate">
                        {course.description}
                      </p>
                    )}

                    <div className="pt-3 mt-3 border-t border-neutral-200 dark:border-dark-border flex items-center justify-center gap-2 text-primary-600 dark:text-dark-green-500">
                      <BarChart3 className="w-4 h-4" />
                      <span className="text-sm font-semibold">View Analytics</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Course Menu */}
      {menuAnchor && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={handleMenuClose}
          />
          <div
            className="fixed z-50 bg-white dark:bg-dark-card rounded-lg shadow-lg border border-neutral-200 dark:border-dark-border overflow-hidden min-w-[180px]"
            style={{
              top: `${menuAnchor.getBoundingClientRect().bottom + 8}px`,
              right: `${window.innerWidth - menuAnchor.getBoundingClientRect().right}px`,
            }}
          >
            <button
              onClick={() => {
                handleDialogOpen(selectedCourse);
              }}
              className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-neutral-700 dark:text-dark-text-primary hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary transition-colors"
            >
              <Edit className="w-4 h-4" />
              Edit Course
            </button>
            <button
              onClick={() => {
                handleDelete(selectedCourse.id);
                handleMenuClose();
              }}
              className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-error-600 dark:text-error-500 hover:bg-error-50 dark:hover:bg-error-900/20 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Course
            </button>
          </div>
        </>
      )}

      {/* Create/Edit Dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              {/* Header */}
              <div className="p-6 border-b border-neutral-200 dark:border-dark-border">
                <h2 className="text-2xl font-bold text-neutral-800 dark:text-dark-text-primary">
                  {editMode ? 'Edit Course' : 'Create New Course'}
                </h2>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text-primary mb-2">
                    Course Code *
                  </label>
                  <Input
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    required
                    placeholder="e.g., CS101"
                    disabled={editMode}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text-primary mb-2">
                    Course Name *
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Data Structures"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text-primary mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    placeholder="Brief description of the course"
                    className="flex w-full rounded-lg border border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-800 dark:text-dark-text-primary px-3 py-2 text-sm transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:focus-visible:ring-dark-green-500 focus-visible:ring-offset-2 dark:ring-offset-dark-bg-primary resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text-primary mb-2">
                      Semester *
                    </label>
                    <Input
                      type="number"
                      value={formData.semester}
                      onChange={(e) => setFormData({ ...formData, semester: parseInt(e.target.value) })}
                      required
                      min={1}
                      max={8}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text-primary mb-2">
                      Academic Year *
                    </label>
                    <Input
                      type="number"
                      value={formData.year}
                      onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                      required
                      min={2020}
                      max={2030}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text-primary mb-2">
                    Credits *
                  </label>
                  <Input
                    type="number"
                    value={formData.credits}
                    onChange={(e) => {
                      const credits = parseInt(e.target.value);
                      // Reset course_type when credits change
                      const newType = formData.course_type === 'STANDALONE_LAB'
                        ? 'STANDALONE_LAB'
                        : 'STANDALONE_THEORY';
                      setFormData({ ...formData, credits, course_type: newType });
                    }}
                    required
                    min={1}
                    max={6}
                  />
                </div>

                {/* Lab toggle — only relevant for 4-credit courses */}
                {formData.credits === 4 && (
                  <div className="rounded-xl border border-neutral-200 dark:border-dark-border p-4 bg-neutral-50 dark:bg-dark-bg-secondary">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-neutral-800 dark:text-dark-text-primary">
                          Has Integrated Lab (IPCC)
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mt-0.5">
                          4-credit courses can have a combined theory + lab component. Enable this if the course has a lab section whose marks count toward final attainment.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          course_type: formData.course_type === 'IPCC' ? 'STANDALONE_THEORY' : 'IPCC',
                        })}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                          formData.course_type === 'IPCC'
                            ? 'bg-primary-500 dark:bg-dark-green-500'
                            : 'bg-neutral-300 dark:bg-dark-bg-tertiary'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                            formData.course_type === 'IPCC' ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                    {formData.course_type === 'IPCC' && (
                      <p className="mt-2 text-xs font-medium text-primary-600 dark:text-dark-green-400">
                        Lab marks will be uploaded separately and combined with theory CIE for attainment.
                      </p>
                    )}
                  </div>
                )}

                {/* Standalone lab — for 1-2 credit pure lab courses */}
                {formData.credits <= 2 && (
                  <div className="rounded-xl border border-neutral-200 dark:border-dark-border p-4 bg-neutral-50 dark:bg-dark-bg-secondary">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-neutral-800 dark:text-dark-text-primary">
                          Pure Lab Course
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mt-0.5">
                          Enable if this is a standalone lab course with no theory component.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          course_type: formData.course_type === 'STANDALONE_LAB' ? 'STANDALONE_THEORY' : 'STANDALONE_LAB',
                        })}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                          formData.course_type === 'STANDALONE_LAB'
                            ? 'bg-primary-500 dark:bg-dark-green-500'
                            : 'bg-neutral-300 dark:bg-dark-bg-tertiary'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                            formData.course_type === 'STANDALONE_LAB' ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="p-6 border-t border-neutral-200 dark:border-dark-border flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDialogClose}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {editMode ? 'Update Course' : 'Create Course'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Courses;