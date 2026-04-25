import React, { useState, useEffect } from 'react';
import {
  Search, Download, ChevronDown, ChevronUp, User, GraduationCap,
  TrendingUp, RefreshCw, BookOpen, Award, AlertTriangle, Clock,
  CheckCircle2, XCircle, BarChart3, Target, Layers
} from 'lucide-react';
import {
  CGPACard, SemesterCard, CourseGradeTable,
  CGPATrendChart, SemesterSubjectManager
} from '../../components/grades';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Alert } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

const API = 'http://localhost:8080/api';
const token = () => localStorage.getItem('token');
const headers = () => ({ Authorization: `Bearer ${token()}` });

// ── helpers ───────────────────────────────────────────────────────────────────
const cgpaColor = (v) => {
  if (v >= 9) return 'text-emerald-600 dark:text-emerald-400';
  if (v >= 8) return 'text-green-600 dark:text-green-400';
  if (v >= 7) return 'text-lime-600 dark:text-lime-400';
  if (v >= 6) return 'text-yellow-600 dark:text-yellow-400';
  if (v >= 4) return 'text-orange-500 dark:text-orange-400';
  return 'text-red-600 dark:text-red-500';
};

const statusConfig = {
  completed:   { label: 'Completed',   icon: CheckCircle2,    cls: 'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' },
  in_progress: { label: 'In Progress', icon: Clock,           cls: 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400' },
  detained:    { label: 'Detained',    icon: XCircle,         cls: 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400' },
  not_started: { label: 'Not Started', icon: Layers,          cls: 'text-neutral-500 bg-neutral-50 border-neutral-200 dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-neutral-400' },
};

// ── Stat chip ─────────────────────────────────────────────────────────────────
const StatChip = ({ label, value, color = 'text-neutral-800 dark:text-dark-text-primary' }) => (
  <div className="flex flex-col items-center">
    <span className={`text-2xl font-extrabold ${color}`}>{value}</span>
    <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 whitespace-nowrap">{label}</span>
  </div>
);

// ── Inline semester card (new, richer than the shared SemesterCard) ───────────
const SemCard = ({ sem, isActive, onClick }) => {
  const sc = statusConfig[sem.status] || statusConfig.not_started;
  const Icon = sc.icon;
  const isNotStarted = sem.status === 'not_started';

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -3, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 320, damping: 20 }}
      className={`
        relative w-full text-left rounded-2xl border-2 p-4 transition-all duration-200
        ${sc.cls}
        ${isActive ? 'ring-2 ring-offset-2 ring-primary-500 dark:ring-dark-green-500 shadow-xl' : 'hover:shadow-md'}
        ${isNotStarted ? 'opacity-50 cursor-default' : 'cursor-pointer'}
      `}
    >
      {/* Semester number + status */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest opacity-60">Sem {sem.semester}</span>
        <Icon className="w-4 h-4" />
      </div>

      {/* SGPA */}
      <div className="mb-3">
        <span className={`text-3xl font-extrabold leading-none ${isNotStarted ? 'text-neutral-300 dark:text-neutral-600' : ''}`}>
          {sem.sgpa !== null ? sem.sgpa.toFixed(2) : '--'}
        </span>
        <span className="text-xs opacity-50 ml-1">/10</span>
      </div>

      {/* Details */}
      <div className="space-y-1 text-xs opacity-80">
        {!isNotStarted && (
          <>
            <div className="flex justify-between">
              <span>Courses</span>
              <span className="font-semibold">{sem.coursesPassed}/{sem.coursesRegistered}</span>
            </div>
            <div className="flex justify-between">
              <span>Credits</span>
              <span className="font-semibold">{sem.creditsEarned}/{sem.credits}</span>
            </div>
          </>
        )}
        {sem.year && <div className="opacity-60 pt-1">{sem.year}</div>}
      </div>

      {/* Status pill */}
      <div className="mt-3">
        <span className={`inline-flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${sc.cls}`}>
          <Icon className="w-2.5 h-2.5" />
          {sc.label}
        </span>
      </div>

      {isActive && (
        <div className="absolute bottom-2 right-2 opacity-60">
          <ChevronUp className="w-4 h-4" />
        </div>
      )}
    </motion.button>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
const StudentProgression = () => {
  const [students, setStudents]           = useState([]);
  const [selectedStudent, setSelected]    = useState(null);
  const [progressionData, setProgression] = useState(null);
  const [selectedSem, setSelectedSem]     = useState(null);
  const [loading, setLoading]             = useState(false);
  const [recalculating, setRecalc]        = useState(false);
  const [error, setError]                 = useState(null);
  const [search, setSearch]               = useState('');
  const [showSearch, setShowSearch]       = useState(false);

  useEffect(() => { loadStudents(); }, []);

  const loadStudents = async () => {
    try {
      const r = await fetch(`${API}/students/all`, { headers: headers() });
      const d = await r.json();
      if (d.success) setStudents(d.data || []);
    } catch { /* ignore */ }
  };

  const loadProgression = async (studentId, { autoRecalc = true } = {}) => {
    setLoading(true);
    setError(null);
    setProgression(null);
    setSelectedSem(null);
    try {
      const r = await fetch(`${API}/progression/students/${studentId}`, { headers: headers() });
      const d = await r.json();
      if (d.success) {
        setProgression(d.data);

        // Auto-recalc when:
        //   (a) stale course count (semester_results computed before new courses were enrolled), OR
        //   (b) courses exist with grades but SGPA is still null (pipeline not yet run), OR
        //   (c) courses exist but NO grades at all — marks may be uploaded but pipeline never ran, OR
        //   (d) any course has marks uploaded (hasSeeMarks) but no grade computed yet
        if (autoRecalc) {
          const needsRecalc = d.data?.semesters?.some(s => {
            if (!s.courses?.length) return false;
            if (s.coursesRegistered > 0 && s.courses.length !== s.coursesRegistered) return true;
            const hasGrades = s.courses.some(c => c.gradePoints !== null);
            if (hasGrades && s.sgpa === null) return true;
            // Courses exist but zero are graded — marks may be uploaded, pipeline not run
            if (s.coursesRegistered > 0 && !hasGrades && s.status !== 'not_started') return true;
            // Any course has marks uploaded but no grade — new upload since last recalc
            if (s.courses.some(c => c.hasSeeMarks && c.gradePoints === null)) return true;
            return false;
          });
          if (needsRecalc) {
            await fetch(`${API}/progression/students/${studentId}/recalculate`, {
              method: 'POST', headers: headers()
            });
            // Reload once after recalc (no further auto-recalc loop)
            await loadProgression(studentId, { autoRecalc: false });
          }
        }
      } else {
        setError(d.message || 'Failed to load progression data');
      }
    } catch (e) {
      setError('Failed to load: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (student) => {
    setSelected(student);
    setSearch('');
    setShowSearch(false);
    if (student) loadProgression(student.id);
    else setProgression(null);
  };

  const handleRecalculate = async () => {
    if (!selectedStudent) return;
    setRecalc(true);
    setError(null);
    try {
      const r = await fetch(`${API}/progression/students/${selectedStudent.id}/recalculate`, {
        method: 'POST', headers: headers()
      });
      const d = await r.json();
      if (!d.success) setError('Recalculate failed: ' + (d.message || 'unknown error'));
      await loadProgression(selectedStudent.id, { autoRecalc: false });
    } catch (e) {
      setError('Recalculate failed: ' + e.message);
    } finally {
      setRecalc(false);
    }
  };

  const handleExport = () => {
    if (!progressionData) return;
    const blob = new Blob([JSON.stringify(progressionData, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `progression_${progressionData.student.usn}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const filtered = students.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.usn?.toLowerCase().includes(search.toLowerCase())
  );

  const activeSems = progressionData?.semesters?.filter(s => s.status !== 'not_started') || [];
  const bestSGPA   = activeSems.length ? Math.max(...activeSems.map(s => s.sgpa || 0)).toFixed(2) : '--';
  const passRate   = progressionData
    ? progressionData.totalCoursesCompleted + progressionData.totalCoursesFailed > 0
      ? Math.round(progressionData.totalCoursesCompleted / (progressionData.totalCoursesCompleted + progressionData.totalCoursesFailed) * 100)
      : 0
    : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* ── Header ── */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-neutral-800 dark:text-dark-text-primary">
            Student Progression
          </h1>
          <p className="mt-1 text-neutral-500 dark:text-dark-text-secondary text-sm">
            8-semester academic journey · SGPA & CGPA tracking
          </p>
        </div>
      </div>

      {/* ── Student search ── */}
      <Card className="mb-8">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setShowSearch(true); }}
                onFocus={() => setShowSearch(true)}
                placeholder="Search by USN or name…"
                className="w-full pl-9 pr-4 py-2.5 border-2 border-neutral-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-bg-primary text-sm text-neutral-800 dark:text-dark-text-primary placeholder:text-neutral-400 focus:outline-none focus:border-primary-500"
              />
              {showSearch && search && filtered.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto border-2 border-neutral-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-bg-primary shadow-xl">
                  {filtered.slice(0, 10).map(s => (
                    <button key={s.id} onClick={() => handleSelect(s)}
                      className="w-full px-4 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary border-b border-neutral-100 dark:border-dark-border last:border-0">
                      <p className="font-semibold text-sm text-neutral-800 dark:text-dark-text-primary">{s.usn}</p>
                      <p className="text-xs text-neutral-500 dark:text-dark-text-secondary">{s.name} · {s.department}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedStudent && (
              <button onClick={() => handleSelect(null)}
                className="text-xs text-neutral-400 hover:text-neutral-600 whitespace-nowrap">
                Clear
              </button>
            )}
          </div>

          {selectedStudent && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-white font-bold text-xs">
                {selectedStudent.name?.[0]?.toUpperCase()}
              </div>
              <div>
                <span className="font-semibold text-neutral-800 dark:text-dark-text-primary">{selectedStudent.name}</span>
                <span className="mx-2 text-neutral-300">·</span>
                <span className="text-neutral-500">{selectedStudent.usn}</span>
                {selectedStudent.department && (
                  <>
                    <span className="mx-2 text-neutral-300">·</span>
                    <span className="text-neutral-500">{selectedStudent.department}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-neutral-500">Loading progression data…</p>
        </div>
      )}

      {error && <Alert variant="error" className="mb-6">{error}</Alert>}

      {/* ── Progression dashboard ── */}
      <AnimatePresence>
      {progressionData && !loading && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>

          {/* ── Student info bar ── */}
          <Card className="mb-6 border-l-4 border-l-primary-500 dark:border-l-dark-green-500">
            <CardContent className="p-5">
              <div className="flex flex-wrap gap-6 items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-white font-extrabold text-xl shadow-md">
                    {progressionData.student.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-neutral-800 dark:text-dark-text-primary">
                      {progressionData.student.name}
                    </h2>
                    <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                      {progressionData.student.usn}
                      {progressionData.student.department && ` · ${progressionData.student.department}`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex flex-wrap gap-8">
                    <StatChip label="Current Sem" value={`Sem ${progressionData.currentSemester}`}
                      color="text-primary-600 dark:text-dark-green-500" />
                    <StatChip label="Total Credits" value={progressionData.totalCredits}
                      color="text-green-600 dark:text-green-400" />
                    <StatChip label="Courses Passed" value={progressionData.totalCoursesCompleted}
                      color="text-blue-600 dark:text-blue-400" />
                    <StatChip label="Pass Rate" value={`${passRate}%`}
                      color={passRate >= 80 ? 'text-green-600' : passRate >= 60 ? 'text-yellow-600' : 'text-red-600'} />
                    <StatChip label="Best SGPA" value={bestSGPA}
                      color="text-purple-600 dark:text-purple-400" />
                  </div>
                  <button
                    onClick={handleRecalculate}
                    disabled={recalculating}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors shadow-sm"
                  >
                    <RefreshCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
                    {recalculating ? 'Recalculating…' : 'Recalculate'}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── CGPA + Chart row ── */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
            <div className="md:col-span-2 flex flex-col gap-4">
              <CGPACard cgpa={progressionData.cgpa} label="Cumulative GPA (CGPA)" size="large" />
              {/* Quick stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-neutral-50 dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border p-3 text-center">
                  <p className="text-2xl font-bold text-primary-600 dark:text-dark-green-500">
                    {progressionData.semestersCompleted}/8
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">Sems done</p>
                </div>
                <div className="rounded-2xl bg-neutral-50 dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border p-3 text-center">
                  <p className={`text-2xl font-bold ${progressionData.totalCoursesFailed > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {progressionData.totalCoursesFailed}
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">Failed</p>
                </div>
              </div>
            </div>
            <div className="md:col-span-3">
              <CGPATrendChart cgpaHistory={progressionData.cgpaHistory} height={220} />
            </div>
          </div>

          {/* ── Semester grid ── */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-neutral-800 dark:text-dark-text-primary flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary-500" />
                  Semester Overview
                </h2>
                <p className="text-xs text-neutral-400">Click a semester to see course details</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {progressionData.semesters.map(sem => (
                  <SemCard
                    key={sem.semester}
                    sem={sem}
                    isActive={selectedSem === sem.semester}
                    onClick={() => sem.status !== 'not_started' && setSelectedSem(selectedSem === sem.semester ? null : sem.semester)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ── Expanded semester details ── */}
          <AnimatePresence>
          {selectedSem !== null && (() => {
            const sem = progressionData.semesters.find(s => s.semester === selectedSem);
            if (!sem) return null;
            const sc = statusConfig[sem.status] || statusConfig.not_started;
            const Icon = sc.icon;

            return (
              <motion.div
                key={selectedSem}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="mb-6"
              >
                <Card className="border-2 border-primary-200 dark:border-dark-green-900">
                  <CardContent className="p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                          <BookOpen className="w-5 h-5 text-primary-600 dark:text-dark-green-500" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-neutral-800 dark:text-dark-text-primary">
                            Semester {sem.semester}
                          </h3>
                          <p className="text-xs text-neutral-500 dark:text-dark-text-secondary">
                            {sem.year ? `Academic Year ${sem.year}` : 'Year not set'}
                          </p>
                        </div>
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${sc.cls}`}>
                          <Icon className="w-3 h-3" /> {sc.label}
                        </span>
                      </div>
                      <button onClick={() => setSelectedSem(null)}
                        className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary transition-colors">
                        <ChevronUp className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                      <div className="rounded-xl bg-neutral-50 dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border p-3">
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">SGPA</p>
                        <p className={`text-2xl font-extrabold ${sem.sgpa !== null ? cgpaColor(sem.sgpa) : 'text-neutral-400'}`}>
                          {sem.sgpa !== null ? sem.sgpa.toFixed(2) : '—'}
                        </p>
                        <p className="text-xs text-neutral-400">/10.0</p>
                      </div>
                      <div className="rounded-xl bg-neutral-50 dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border p-3">
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Credits Earned</p>
                        <p className="text-2xl font-extrabold text-green-600 dark:text-green-400">
                          {sem.creditsEarned}
                          <span className="text-sm text-neutral-400">/{sem.credits}</span>
                        </p>
                      </div>
                      <div className="rounded-xl bg-neutral-50 dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border p-3">
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Courses</p>
                        <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                          {sem.coursesPassed}
                          <span className="text-sm text-neutral-400">/{sem.coursesRegistered}</span>
                        </p>
                        <p className="text-xs text-neutral-400">passed</p>
                      </div>
                      <div className="rounded-xl bg-neutral-50 dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border p-3">
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Failed</p>
                        <p className={`text-2xl font-extrabold ${sem.coursesFailed > 0 ? 'text-red-600 dark:text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                          {sem.coursesFailed}
                        </p>
                        <p className="text-xs text-neutral-400">courses</p>
                      </div>
                    </div>

                    <div className="h-px bg-neutral-200 dark:bg-dark-border mb-5" />

                    {/* Course table */}
                    {sem.courses?.length > 0 ? (
                      <CourseGradeTable courses={sem.courses} showSummary={false} />
                    ) : (
                      <div className="text-center py-10 text-neutral-400">
                        <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No course data yet for this semester.</p>
                        <p className="text-xs mt-1">Add subjects below using the Subject Manager.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })()}
          </AnimatePresence>

          {/* ── Subject Manager ──
          {selectedSem && selectedStudent && (
            <motion.div
              key={`mgr-${selectedSem}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-8"
            >
              <Card className="border-2 border-dashed border-primary-200 dark:border-dark-green-900">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Target className="w-5 h-5 text-primary-500" />
                    <h3 className="font-bold text-neutral-800 dark:text-dark-text-primary">
                      Manage Subjects — Semester {selectedSem}
                    </h3>
                  </div>
                  <SemesterSubjectManager
                    studentId={selectedStudent.id}
                    semester={selectedSem}
                    academicYear={
                      progressionData.semesters.find(s => s.semester === selectedSem)?.year ||
                      new Date().getFullYear()
                    }
                    onUpdate={() => loadProgression(selectedStudent.id)}
                  />
                </CardContent>
              </Card>
            </motion.div>
          )} */}

          {/* ── Full performance summary table ── */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <h2 className="text-lg font-bold text-neutral-800 dark:text-dark-text-primary flex items-center gap-2 mb-5">
                <Award className="w-5 h-5 text-yellow-500" />
                Full Semester Summary
              </h2>
              <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-dark-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-100 dark:bg-dark-bg-secondary">
                      {['Semester', 'Year', 'Courses', 'Credits', 'SGPA', 'CGPA*', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-bold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-dark-border">
                    {(() => {
                      let cumGP = 0, cumCr = 0;
                      return progressionData.semesters.map(sem => {
                        const sc = statusConfig[sem.status] || statusConfig.not_started;
                        const Icon = sc.icon;
                        const isNA = sem.status === 'not_started';

                        // Running CGPA
                        if (sem.sgpa !== null && sem.creditsEarned > 0) {
                          cumGP += sem.sgpa * sem.creditsEarned;
                          cumCr += sem.creditsEarned;
                        }
                        const runningCGPA = cumCr > 0 ? (cumGP / cumCr).toFixed(2) : '—';

                        return (
                          <tr key={sem.semester}
                            className={`hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary transition-colors ${isNA ? 'opacity-40' : ''}`}>
                            <td className="px-4 py-3 font-semibold text-neutral-800 dark:text-dark-text-primary">
                              Semester {sem.semester}
                            </td>
                            <td className="px-4 py-3 text-neutral-500">{sem.year || '—'}</td>
                            <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">
                              {isNA ? '—' : `${sem.coursesPassed}/${sem.coursesRegistered}`}
                            </td>
                            <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">
                              {isNA ? '—' : `${sem.creditsEarned}/${sem.credits}`}
                            </td>
                            <td className={`px-4 py-3 font-bold ${sem.sgpa !== null ? cgpaColor(sem.sgpa) : 'text-neutral-400'}`}>
                              {sem.sgpa !== null ? sem.sgpa.toFixed(2) : '—'}
                            </td>
                            <td className={`px-4 py-3 font-bold ${!isNA && runningCGPA !== '—' ? cgpaColor(parseFloat(runningCGPA)) : 'text-neutral-400'}`}>
                              {isNA ? '—' : runningCGPA}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${sc.cls}`}>
                                <Icon className="w-3 h-3" /> {sc.label}
                              </span>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-neutral-400 mt-2">* CGPA shown is running cumulative after each semester.</p>
            </CardContent>
          </Card>

        </motion.div>
      )}
      </AnimatePresence>

      {/* ── Empty state ── */}
      {!selectedStudent && !loading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-3xl bg-neutral-100 dark:bg-dark-bg-secondary flex items-center justify-center mb-4">
            <GraduationCap className="w-10 h-10 text-neutral-300 dark:text-neutral-600" />
          </div>
          <h3 className="text-lg font-bold text-neutral-600 dark:text-dark-text-primary mb-1">
            No student selected
          </h3>
          <p className="text-sm text-neutral-400 dark:text-dark-text-muted max-w-xs">
            Search for a student by USN or name to view their complete 8-semester progression.
          </p>
        </div>
      )}
    </div>
  );
};

export default StudentProgression;
