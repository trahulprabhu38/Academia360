import { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  Upload,
  BarChart3,
  Users,
  ClipboardList,
  ArrowRight,
  UserSearch,
  LineChart,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { courseAPI } from '../../services/api';
import { Spinner } from '../../components/ui/progress';

/* ── Animated number counter ── */
function AnimatedNumber({ value, suffix = '', decimals = 0 }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === null || value === undefined) return;
    const target = parseFloat(value);
    if (isNaN(target)) return;

    const duration = 1400;
    const start = Date.now();

    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4); // easeOutQuart
      const current = target * eased;
      setDisplay(decimals > 0 ? parseFloat(current.toFixed(decimals)) : Math.floor(current));
      if (progress < 1) requestAnimationFrame(tick);
      else setDisplay(decimals > 0 ? parseFloat(target.toFixed(decimals)) : target);
    };

    requestAnimationFrame(tick);
  }, [value, decimals]);

  return (
    <>
      {decimals > 0 ? display.toFixed(decimals) : display}
      {suffix}
    </>
  );
}

/* ── 3-D tilt card wrapper ── */
function TiltCard({ children, className = '' }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [6, -6]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-6, 6]), { stiffness: 300, damping: 30 });

  const handleMouse = (e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const reset = () => { x.set(0); y.set(0); };

  return (
    <motion.div
      ref={ref}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 800 }}
      onMouseMove={handleMouse}
      onMouseLeave={reset}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ────────────────────────────── main component ────────────────────────────── */
const TeacherDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalCourses: 0,
    totalStudents: 0,
    totalAssessments: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { loadDashboardData(); }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      /* Fetch dashboard summary + course list in parallel */
      const [dashRes, coursesRes] = await Promise.all([
        courseAPI.getDashboard().catch(() => null),
        courseAPI.getAll().catch(() => ({ data: { data: [] } })),
      ]);

      const dashData = dashRes?.data?.data || {};
      const courses  = coursesRes?.data?.data || [];

      const totalCourses     = dashData.totalCourses     ?? courses.length;
      const totalStudents    = dashData.totalStudents    ?? 0;
      const totalAssessments = dashData.totalAssessments ?? 0;

      setStats({ totalCourses, totalStudents, totalAssessments });
      setStatsLoaded(true);
    } catch (err) {
      console.error('Dashboard load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ── loading state ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-4">
          <div className="relative inline-block">
            <Spinner size="lg" />
            <div className="absolute inset-0 animate-ping rounded-full bg-primary-400/20" />
          </div>
          <p className="text-sm text-neutral-500 dark:text-dark-text-muted animate-pulse tracking-wide">
            Loading your dashboard…
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-4">
          <p className="text-error-600 font-medium">Failed to load dashboard</p>
          <button onClick={loadDashboardData} className="btn-primary">Retry</button>
        </div>
      </div>
    );
  }

  /* ── data ── */
  const initials = (user?.name || '')
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '??';

  const statCards = [
    {
      label: 'Total Courses',
      value: stats.totalCourses,
      icon: GraduationCap,
      from: '#41644A',
      to: '#0D4715',
      suffix: '',
      decimals: 0,
    },
    {
      label: 'Total Students',
      value: stats.totalStudents,
      icon: Users,
      from: '#56945f',
      to: '#2d4634',
      suffix: '',
      decimals: 0,
    },
    {
      label: 'Assessments',
      value: stats.totalAssessments,
      icon: ClipboardList,
      from: '#E9762B',
      to: '#a9511d',
      suffix: '',
      decimals: 0,
    },
  ];

  const quickAccess = [
    {
      title: 'Upload Assessments',
      desc: 'Upload marks and question papers',
      icon: Upload,
      gradient: 'linear-gradient(135deg,#41644A,#0D4715)',
      path: '/teacher/upload',
    },
    {
      title: 'View Analytics',
      desc: 'CO/PO attainment analysis',
      icon: BarChart3,
      gradient: 'linear-gradient(135deg,#E9762B,#a9511d)',
      path: '/teacher/analytics',
    },
    {
      title: 'Manage Courses',
      desc: 'View and edit course details',
      icon: GraduationCap,
      gradient: 'linear-gradient(135deg,#56945f,#2d4634)',
      path: '/teacher/courses',
    },
    {
      title: 'Attainment Dashboard',
      desc: 'Detailed CO/PO attainment view',
      icon: LineChart,
      gradient: 'linear-gradient(135deg,#0D4715,#41644A)',
      path: '/teacher/attainment',
    },
    {
      title: 'Student Analysis',
      desc: 'Individual student performance',
      icon: UserSearch,
      gradient: 'linear-gradient(135deg,#c96324,#E9762B)',
      path: '/teacher/student-analysis',
    },
    {
      title: 'Student Progression',
      desc: 'Track semester-wise progression',
      icon: Layers,
      gradient: 'linear-gradient(135deg,#375541,#6a9673)',
      path: '/teacher/progression',
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-8">

      {/* ══════════════ HERO ══════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative overflow-hidden rounded-3xl shadow-2xl min-h-[220px]">
          {/* animated mesh background */}
          <div className="mesh-animated absolute inset-0" />

          {/* floating orbs */}
          <div
            className="animate-float-slow absolute -top-16 -right-16 w-72 h-72 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
          />
          <div
            className="animate-float-medium absolute -bottom-20 left-8 w-80 h-80 rounded-full opacity-15"
            style={{ background: 'radial-gradient(circle, #E9762B 0%, transparent 70%)' }}
          />
          <div
            className="animate-float-fast absolute top-1/3 left-1/2 w-40 h-40 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #56945f 0%, transparent 70%)' }}
          />

          {/* dot-grid texture */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />

          {/* content */}
          <div className="relative z-10 p-8 md:p-10 text-white">
            <div className="flex flex-col md:flex-row md:items-center gap-6">

              {/* avatar */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.25, duration: 0.55, type: 'spring', stiffness: 200 }}
                className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-2xl font-extrabold shadow-xl flex-shrink-0"
              >
                {initials}
              </motion.div>

              {/* text */}
              <div className="flex-1 min-w-0">
                <motion.p
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-white/60 text-xs font-semibold uppercase tracking-[0.2em] mb-1 flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Welcome back
                </motion.p>

                <motion.h1
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.36 }}
                  className="text-4xl md:text-5xl font-extrabold tracking-tight leading-none mb-2"
                >
                  {user?.name}!
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.42 }}
                  className="text-white/75 text-base md:text-lg mb-4 max-w-xl"
                >
                  Manage your courses, track assessments, and analyze CO/PO attainment.
                </motion.p>

                {user?.department && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="flex flex-wrap gap-2"
                  >
                    <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/25 text-sm font-medium">
                      {user.department}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/25 text-sm font-medium">
                      Faculty
                    </span>
                  </motion.div>
                )}
              </div>

            </div>
          </div>
        </div>
      </motion.div>

      {/* ══════════════ STATS ══════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 32, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.09, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -6 }}
              className="group relative cursor-default"
            >
              {/* glow halo */}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-60 transition-opacity duration-500 blur-xl"
                style={{ background: `radial-gradient(circle at center, ${card.from}66, transparent 70%)` }}
              />

              <div className="relative rounded-2xl border border-neutral-200/70 dark:border-dark-border bg-white dark:bg-dark-card shadow-sm group-hover:shadow-2xl transition-all duration-300 overflow-hidden">
                {/* top colour stripe */}
                <div
                  className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
                  style={{ background: `linear-gradient(90deg, ${card.from}, ${card.to})` }}
                />
                {/* shimmer on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 stat-shimmer pointer-events-none" />

                <div className="p-5 pt-6">
                  {/* icon */}
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 shadow-md"
                    style={{ background: `linear-gradient(135deg, ${card.from}, ${card.to})` }}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>

                  <p className="text-[11px] font-bold text-neutral-400 dark:text-dark-text-muted uppercase tracking-widest mb-1">
                    {card.label}
                  </p>

                  <p className="text-3xl font-extrabold text-neutral-800 dark:text-dark-text-primary">
                    {card.isNull ? (
                      <span className="text-2xl text-neutral-400 dark:text-dark-text-muted">N/A</span>
                    ) : statsLoaded ? (
                      <AnimatedNumber value={card.value} suffix={card.suffix} decimals={card.decimals} />
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ══════════════ QUICK ACCESS ══════════════ */}
      <div>
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.55 }}
          className="flex items-center gap-3 mb-5"
        >
          <div
            className="w-1 h-7 rounded-full flex-shrink-0"
            style={{ background: 'linear-gradient(to bottom, #41644A, #E9762B)' }}
          />
          <div>
            <h2 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary">
              Quick Access
            </h2>
            <p className="text-sm text-neutral-500 dark:text-dark-text-muted">
              Navigate to commonly used features
            </p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickAccess.map((card, i) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 22, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.65 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
              >
                <TiltCard className="h-full">
                  <motion.div
                    whileHover={{ y: -5 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => navigate(card.path)}
                    className="group cursor-pointer relative rounded-2xl border border-neutral-200/70 dark:border-dark-border bg-white dark:bg-dark-card shadow-sm hover:shadow-2xl transition-all duration-300 overflow-hidden h-full"
                  >
                    {/* gradient wash on hover */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-[0.06] transition-opacity duration-300"
                      style={{ background: card.gradient }}
                    />

                    {/* bottom accent line */}
                    <div
                      className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{ background: card.gradient }}
                    />

                    <div className="relative p-6 flex flex-col h-full">
                      {/* icon */}
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300"
                        style={{ background: card.gradient }}
                      >
                        <Icon className="w-7 h-7 text-white" />
                      </div>

                      <h3 className="text-base font-bold text-neutral-800 dark:text-dark-text-primary mb-1">
                        {card.title}
                      </h3>
                      <p className="text-sm text-neutral-500 dark:text-dark-text-muted flex-1 mb-5">
                        {card.desc}
                      </p>

                      <div className="flex items-center gap-1.5 text-sm font-semibold text-primary-600 dark:text-dark-green-500 group-hover:gap-3 transition-all duration-200">
                        Open <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </motion.div>
                </TiltCard>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ══════════════ FOOTER HINT ══════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1 }}
        className="text-center pb-2"
      >
        <p className="text-xs text-neutral-400 dark:text-dark-text-muted">
          Academia360 · CO/PO Attainment System
        </p>
      </motion.div>
    </div>
  );
};

export default TeacherDashboard;
