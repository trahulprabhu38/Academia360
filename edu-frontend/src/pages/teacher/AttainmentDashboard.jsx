import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  TrendingUp, Target, Star, LayoutGrid, Settings,
  RefreshCw, ClipboardList, FileQuestion, Users,
  BookOpen, FlaskConical, CheckCircle2, AlertCircle
} from 'lucide-react';
import { courseAPI, attainmentV2API } from '../../services/api';
import PageLayout from '../../components/shared/PageLayout';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import COAttainmentFinal from '../../components/attainment/COAttainmentFinal';
import POAttainmentFinal from '../../components/attainment/POAttainmentFinal';
import PSOAttainment from '../../components/attainment/PSOAttainment';
import AttainmentMatrix from '../../components/attainment/AttainmentMatrix';
import CourseAttainmentConfig from '../../components/attainment/CourseAttainmentConfig';
import StudentAttainmentGrid from '../../components/attainment/StudentAttainmentGrid';

const TABS = [
  { id: 'co',       label: 'CO Attainment',      icon: TrendingUp },
  { id: 'po',       label: 'PO Attainment',      icon: Target },
  { id: 'pso',      label: 'PSO Attainment',     icon: Star },
  { id: 'matrix',   label: 'CO-PO-PSO Matrix',   icon: LayoutGrid },
  { id: 'students', label: 'Student Attainment', icon: Users },
  { id: 'config',   label: 'Configuration',      icon: Settings },
];

function CourseTypeBadge({ courseType }) {
  if (!courseType) return null;
  const isIPCC = courseType === 'IPCC';
  const isLab  = courseType === 'STANDALONE_LAB';
  if (isIPCC) return (
    <Badge className="gap-1 bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800">
      <FlaskConical className="w-3 h-3" /> IPCC (Theory + Lab)
    </Badge>
  );
  if (isLab) return (
    <Badge className="gap-1 bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
      <FlaskConical className="w-3 h-3" /> Lab
    </Badge>
  );
  return (
    <Badge className="gap-1 bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-dark-bg-tertiary dark:text-dark-text-secondary dark:border-dark-border">
      <BookOpen className="w-3 h-3" /> Theory
    </Badge>
  );
}

export default function AttainmentDashboard() {
  const { id: courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [activeTab, setActiveTab] = useState('co');
  const [recalculating, setRecalculating] = useState(false);
  const [pipelineResult, setPipelineResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    courseAPI.getById(courseId)
      .then(res => setCourse(res.data.data))
      .catch(() => toast.error('Failed to load course'))
      .finally(() => setLoading(false));
  }, [courseId]);

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      setPipelineResult(null);
      const res = await attainmentV2API.recalculate(courseId);
      const summary = res.data.summary || {};
      setPipelineResult({
        success: true,
        co: summary.co_count || 0,
        po: summary.po_count || 0,
        pso: summary.pso_count || 0,
      });
      toast.success(`Pipeline complete — ${summary.co_count || 0} COs, ${summary.po_count || 0} POs, ${summary.pso_count || 0} PSOs`);
    } catch (err) {
      setPipelineResult({ success: false, error: err.response?.data?.error || 'Recalculation failed' });
      toast.error(err.response?.data?.error || 'Recalculation failed');
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) {
    return (
      <PageLayout title="Attainment Dashboard">
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Attainment Dashboard"
      subtitle={course?.name}
      icon={TrendingUp}
      maxWidth="2xl"
      breadcrumbs={[
        { label: 'Courses', href: '/teacher/courses' },
        { label: course?.name || 'Course', href: `/teacher/courses/${courseId}` },
        { label: 'Attainment' }
      ]}
      actions={
        <div className="flex gap-2 flex-wrap">
          <Link to={`/teacher/courses/${courseId}/ces`}>
            <Button variant="outline" size="sm">
              <ClipboardList className="w-4 h-4 mr-2" />
              Manage CES
            </Button>
          </Link>
          <Button onClick={handleRecalculate} disabled={recalculating} size="sm"
            className="bg-gradient-to-r from-primary-500 to-secondary-500 text-white border-0">
            <RefreshCw className={`w-4 h-4 mr-2 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Running Pipeline…' : 'Run Full Pipeline'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Course info strip */}
        <div className="flex items-center gap-3 flex-wrap">
          <CourseTypeBadge courseType={course?.course_type} />
          {course?.course_code && (
            <span className="text-sm text-neutral-500 dark:text-dark-text-secondary font-mono">
              {course.course_code}
            </span>
          )}
          {course?.semester && (
            <span className="text-sm text-neutral-500 dark:text-dark-text-secondary">
              Sem {course.semester}
            </span>
          )}
        </div>

        {/* Pipeline result notification */}
        {pipelineResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${
              pipelineResult.success
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
            }`}
          >
            {pipelineResult.success
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <AlertCircle className="w-4 h-4 shrink-0" />}
            {pipelineResult.success
              ? <span>Pipeline complete: <strong>{pipelineResult.co} COs</strong>, <strong>{pipelineResult.po} POs</strong>, <strong>{pipelineResult.pso} PSOs</strong> calculated.</span>
              : <span>{pipelineResult.error}</span>
            }
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-neutral-100 dark:bg-dark-bg-secondary p-1 rounded-xl overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-dark-bg-primary text-neutral-900 dark:text-dark-text-primary shadow-sm'
                    : 'text-neutral-500 dark:text-dark-text-secondary hover:text-neutral-700 dark:hover:text-dark-text-primary'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'co'       && <COAttainmentFinal courseId={courseId} />}
          {activeTab === 'po'       && <POAttainmentFinal courseId={courseId} />}
          {activeTab === 'pso'      && <PSOAttainment courseId={courseId} />}
          {activeTab === 'matrix'   && <AttainmentMatrix courseId={courseId} />}
          {activeTab === 'students' && <StudentAttainmentGrid courseId={courseId} />}
          {activeTab === 'config'   && <CourseAttainmentConfig courseId={courseId} />}
        </motion.div>
      </div>
    </PageLayout>
  );
}
