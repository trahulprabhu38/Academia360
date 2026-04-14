import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ClipboardList, ToggleLeft, ToggleRight, RefreshCw,
  Users, BarChart2, Info, CheckCircle, Upload, X, FileSpreadsheet,
} from 'lucide-react';
import { cesAPI, courseAPI } from '../../services/api';
import PageLayout from '../../components/shared/PageLayout';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

// ── CSV parser (no external deps) ──────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n').map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
  if (lines.length < 2) return { headers: [], rows: [] };
  return { headers: lines[0], rows: lines.slice(1) };
}

// Detect CO columns: look for headers like CO1, CO2, Q1, Q2, or "CO 1" etc.
function detectCOCols(headers) {
  const cols = {};
  headers.forEach((h, i) => {
    const m = h.match(/^(?:CO|Q)\s*(\d+)$/i);
    if (m) cols[parseInt(m[1])] = i;
  });
  return cols;  // { 1: colIdx, 2: colIdx, ... }
}

const LEVEL_COLORS = {
  3: 'text-green-600 dark:text-green-400',
  2: 'text-yellow-600 dark:text-yellow-400',
  1: 'text-red-500 dark:text-red-400',
};

export default function CESAdmin({ courseId: propCourseId, embedded = false }) {
  const { id: paramCourseId } = useParams();
  const courseId = propCourseId || paramCourseId;
  const [course, setCourse] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attainment, setAttainment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activating, setActivating] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [surveyActive, setSurveyActive] = useState(false);

  // Manual upload state
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualFile, setManualFile] = useState(null);
  const [manualParsed, setManualParsed] = useState(null);  // { coAggregates: [{co_number, r5..r1}] }
  const [manualUploading, setManualUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadData();
  }, [courseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [courseRes, qRes, attRes] = await Promise.all([
        courseAPI.getById(courseId),
        cesAPI.getQuestions(courseId),
        cesAPI.getCESAttainment(courseId).catch(() => ({ data: { data: [] } })),
      ]);
      setCourse(courseRes.data.data);
      const qs = qRes.data.data || [];
      setQuestions(qs);
      setSurveyActive(qs.some(q => q.is_active));
      setAttainment(attRes.data.data || []);
    } catch {
      toast.error('Failed to load CES data');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuestions = async () => {
    try {
      setGenerating(true);
      await cesAPI.createQuestions(courseId, []);
      toast.success('Survey questions generated from COs');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate questions');
    } finally {
      setGenerating(false);
    }
  };

  const handleToggle = async () => {
    try {
      setActivating(true);
      const newState = !surveyActive;
      await cesAPI.setActive(courseId, newState);
      setSurveyActive(newState);
      toast.success(newState ? 'Survey opened for students' : 'Survey closed');
    } catch {
      toast.error('Failed to update survey status');
    } finally {
      setActivating(false);
    }
  };

  const handleCalculate = async () => {
    try {
      setCalculating(true);
      await cesAPI.calculateCES(courseId);
      toast.success('CES attainment calculated');
      const attRes = await cesAPI.getCESAttainment(courseId);
      setAttainment(attRes.data.data || []);
    } catch {
      toast.error('Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const handleManualFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setManualFile(f);
    setManualParsed(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { headers, rows } = parseCSV(ev.target.result);
        const coCols = detectCOCols(headers);
        const coNums = Object.keys(coCols).map(Number).sort((a, b) => a - b);

        if (coNums.length === 0) {
          toast.error('No CO columns found. Expected headers like CO1, CO2, Q1, Q2…');
          return;
        }

        // Aggregate rating counts per CO
        const agg = {};
        coNums.forEach(n => { agg[n] = { r5: 0, r4: 0, r3: 0, r2: 0, r1: 0 }; });

        rows.forEach(row => {
          coNums.forEach(coNum => {
            const val = parseInt(row[coCols[coNum]]);
            if (isNaN(val) || val < 1 || val > 5) return;
            agg[coNum][`r${val}`]++;
          });
        });

        const coAggregates = coNums.map(n => ({ co_number: n, ...agg[n] }));
        setManualParsed({ coAggregates, rowCount: rows.length, coNums });
      } catch {
        toast.error('Failed to parse CSV file');
      }
    };
    reader.readAsText(f);
  };

  const handleManualUpload = async () => {
    if (!manualParsed?.coAggregates?.length) return;
    try {
      setManualUploading(true);
      await cesAPI.uploadManualCES(courseId, manualParsed.coAggregates);
      toast.success('CES data uploaded successfully');
      const attRes = await cesAPI.getCESAttainment(courseId);
      setAttainment(attRes.data.data || []);
      setManualModalOpen(false);
      setManualFile(null);
      setManualParsed(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setManualUploading(false);
    }
  };

  const actionButtons = (
    <div className="flex flex-wrap gap-2">
      {questions.length === 0 && (
        <Button onClick={handleGenerateQuestions} disabled={generating} variant="outline">
          {generating ? 'Generating…' : 'Generate Questions'}
        </Button>
      )}
      <Button
        onClick={handleToggle}
        disabled={activating || questions.length === 0}
        variant={surveyActive ? 'destructive' : 'default'}
      >
        {surveyActive
          ? <><ToggleRight className="w-4 h-4 mr-2" />Close Survey</>
          : <><ToggleLeft className="w-4 h-4 mr-2" />Open Survey</>}
      </Button>
      <Button onClick={handleCalculate} disabled={calculating} variant="outline">
        <RefreshCw className={`w-4 h-4 mr-2 ${calculating ? 'animate-spin' : ''}`} />
        Calculate Attainment
      </Button>
      <Button onClick={() => setManualModalOpen(true)} variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20">
        <Upload className="w-4 h-4 mr-2" />
        Upload Result Manually
      </Button>
    </div>
  );

  if (loading) {
    const spinner = (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
    if (embedded) return spinner;
    return <PageLayout title="CES Management">{spinner}</PageLayout>;
  }

  const content = (
    <div className="space-y-6">
        {/* Status banner */}
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
          surveyActive
            ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
            : 'bg-neutral-100 dark:bg-dark-bg-secondary text-neutral-600 dark:text-dark-text-secondary'
        }`}>
          {surveyActive
            ? <CheckCircle className="w-5 h-5" />
            : <Info className="w-5 h-5" />}
          {surveyActive
            ? 'Survey is OPEN — students can submit responses'
            : 'Survey is CLOSED — students cannot submit responses'}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Questions panel */}
          <Card>
            <CardContent className="pt-5">
              <h3 className="font-semibold text-neutral-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-primary-500" />
                Survey Questions ({questions.length})
              </h3>

              {questions.length === 0 ? (
                <div className="py-8 text-center text-neutral-400 dark:text-neutral-500">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No questions yet.</p>
                  <p className="text-xs mt-1">Click "Generate Questions" to auto-create from COs.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {questions.map((q, i) => (
                    <motion.div
                      key={q.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-start gap-3 p-3 rounded-lg bg-neutral-50 dark:bg-dark-bg-tertiary"
                    >
                      <span className="shrink-0 text-xs font-bold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 px-2 py-1 rounded">
                        CO{q.co_number}
                      </span>
                      <p className="text-sm text-neutral-700 dark:text-dark-text-secondary leading-relaxed">
                        {q.question_text}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attainment results panel */}
          <Card>
            <CardContent className="pt-5">
              <h3 className="font-semibold text-neutral-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary-500" />
                CES Attainment Results
              </h3>

              {attainment.length === 0 ? (
                <div className="py-8 text-center text-neutral-400 dark:text-neutral-500">
                  <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No attainment data yet.</p>
                  <p className="text-xs mt-1">Click "Calculate Attainment" after responses are in.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {attainment.map((row, i) => {
                    const avg = parseFloat(row.ces_attainment || 0);
                    const pct = avg > 0 ? ((avg - 1) / 2) * 100 : 0;
                    return (
                      <motion.div
                        key={row.co_number}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="p-3 rounded-lg bg-neutral-50 dark:bg-dark-bg-tertiary"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-neutral-900 dark:text-dark-text-primary">
                            CO{row.co_number}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500 dark:text-dark-text-secondary">
                              {row.response_count} responses
                            </span>
                            <span className="text-sm font-bold text-neutral-900 dark:text-dark-text-primary">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-neutral-200 dark:bg-dark-bg-primary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary-500 to-secondary-500"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <div className="mt-1 flex gap-1 text-xs text-neutral-400">
                          {[5,4,3,2,1].map(r => (
                            <span key={r} title={`Rating ${r}`}>
                              {r}★:{row[`rating_${r}_count`] || 0}
                            </span>
                          ))}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
  );

  // ── Manual Upload Modal ────────────────────────────────────────────────────
  const manualUploadModal = (
    <AnimatePresence>
      {manualModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-orange-500" />
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-dark-text-primary">
                  Upload CES Result Manually
                </h3>
              </div>
              <button onClick={() => { setManualModalOpen(false); setManualFile(null); setManualParsed(null); }} className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-130px)] space-y-4">
              {/* Instructions */}
              <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold mb-1">CSV Format Required</p>
                  <p>Export your spreadsheet as CSV. The file must have column headers named <strong>CO1, CO2, …</strong> (or <strong>Q1, Q2, …</strong>) with student ratings (1–5) in each row.</p>
                  <p className="mt-1 text-xs">Example: <code className="bg-blue-100 dark:bg-blue-800/40 px-1 rounded">USN, Name, CO1, CO2, CO3, CO4, CO5, CO6</code></p>
                </div>
              </div>

              {/* File picker */}
              <div>
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleManualFileSelect} className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-neutral-300 dark:border-dark-border rounded-xl p-6 text-center hover:border-primary-400 dark:hover:border-dark-green-500 transition-colors group"
                >
                  <Upload className="w-8 h-8 mx-auto mb-2 text-neutral-400 group-hover:text-primary-500 transition-colors" />
                  <p className="text-sm font-medium text-neutral-600 dark:text-dark-text-secondary">
                    {manualFile ? manualFile.name : 'Click to select CSV file'}
                  </p>
                  {!manualFile && <p className="text-xs text-neutral-400 mt-1">Supports .csv files</p>}
                </button>
              </div>

              {/* Preview */}
              {manualParsed && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <p className="text-sm font-medium text-neutral-700 dark:text-dark-text-primary">
                      Parsed {manualParsed.rowCount} student responses across {manualParsed.coNums.length} COs
                    </p>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-dark-border">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 dark:bg-dark-bg-tertiary">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-neutral-600 dark:text-dark-text-secondary">CO</th>
                          {[5,4,3,2,1].map(r => (
                            <th key={r} className="px-3 py-2 text-center font-semibold text-neutral-600 dark:text-dark-text-secondary">★{r}</th>
                          ))}
                          <th className="px-3 py-2 text-center font-semibold text-neutral-600 dark:text-dark-text-secondary">Total</th>
                          <th className="px-3 py-2 text-center font-semibold text-neutral-600 dark:text-dark-text-secondary">Avg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manualParsed.coAggregates.map(row => {
                          const total = row.r5 + row.r4 + row.r3 + row.r2 + row.r1;
                          const avg = total > 0 ? ((row.r5*5 + row.r4*4 + row.r3*3 + row.r2*2 + row.r1*1) / total) : 0;
                          return (
                            <tr key={row.co_number} className="border-t border-neutral-100 dark:border-dark-border">
                              <td className="px-3 py-2 font-semibold text-primary-600 dark:text-dark-green-400">CO{row.co_number}</td>
                              {[5,4,3,2,1].map(r => (
                                <td key={r} className="px-3 py-2 text-center text-neutral-700 dark:text-dark-text-secondary">{row[`r${r}`]}</td>
                              ))}
                              <td className="px-3 py-2 text-center font-medium text-neutral-800 dark:text-dark-text-primary">{total}</td>
                              <td className="px-3 py-2 text-center font-semibold text-primary-600 dark:text-dark-green-400">{avg.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-neutral-200 dark:border-dark-border flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setManualModalOpen(false); setManualFile(null); setManualParsed(null); }}>
                Cancel
              </Button>
              <Button
                onClick={handleManualUpload}
                disabled={!manualParsed || manualUploading}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {manualUploading ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Uploading…</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" />Upload & Calculate</>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (embedded) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-5 h-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-dark-text-primary">
              Course Exit Survey
            </h2>
          </div>
          {actionButtons}
        </div>
        {content}
        {manualUploadModal}
      </div>
    );
  }

  return (
    <PageLayout
      title="Course Exit Survey"
      subtitle={course?.name}
      icon={ClipboardList}
      breadcrumbs={[
        { label: 'Courses', href: '/teacher/courses' },
        { label: course?.name || 'Course', href: `/teacher/courses/${courseId}` },
        { label: 'CES Management' }
      ]}
      actions={actionButtons}
    >
      {content}
      {manualUploadModal}
    </PageLayout>
  );
}
