import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { FileQuestion, Plus, Save, Trash2, Info, Upload } from 'lucide-react';
import { cesAPI, courseAPI } from '../../services/api';
import PageLayout from '../../components/shared/PageLayout';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

const EMPTY_ROW = () => ({ question_label: '', co_number: '', max_marks: '' });

export default function SEEQuestionMapping() {
  const { id: courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [cos, setCos] = useState([]);
  const [rows, setRows] = useState([EMPTY_ROW()]);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [courseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [courseRes, mappingRes] = await Promise.all([
        courseAPI.getById(courseId),
        cesAPI.getSEEMapping(courseId),
      ]);
      setCourse(courseRes.data.data);
      const existing = mappingRes.data.data || [];
      setSaved(existing);
      if (existing.length > 0) {
        setRows(existing.map(r => ({
          question_label: r.question_label,
          co_number: String(r.co_number),
          max_marks: String(r.max_marks),
        })));
      }
      // Get COs from course
      const coRes = await courseRes.data.data;
    } catch {
      toast.error('Failed to load mapping data');
    } finally {
      setLoading(false);
    }
  };

  const addRow = () => setRows(prev => [...prev, EMPTY_ROW()]);
  const removeRow = (i) => setRows(prev => prev.filter((_, idx) => idx !== i));
  const updateRow = (i, field, value) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  const handleSave = async () => {
    const valid = rows.filter(r => r.question_label.trim() && r.co_number && r.max_marks);
    if (valid.length === 0) {
      toast.error('Add at least one valid mapping row');
      return;
    }

    const mappings = valid.map(r => ({
      question_label: r.question_label.trim().toLowerCase(),
      co_number: parseInt(r.co_number),
      max_marks: parseFloat(r.max_marks),
    }));

    try {
      setSaving(true);
      await cesAPI.saveSEEMapping(courseId, mappings);
      toast.success(`Saved ${mappings.length} SEE question mappings`);
      setSaved(mappings);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageLayout title="SEE Question Mapping">
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="SEE Question → CO Mapping"
      subtitle={course?.name}
      icon={FileQuestion}
      breadcrumbs={[
        { label: 'Courses', href: '/teacher/courses' },
        { label: course?.name || 'Course', href: `/teacher/courses/${courseId}` },
        { label: 'SEE Mapping' }
      ]}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={addRow}>
            <Plus className="w-4 h-4 mr-2" />
            Add Row
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving…' : 'Save Mapping'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Info */}
        <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-800 dark:text-blue-300">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            Map each SEE question (e.g. Q1a, Q2b) to its Course Outcome and maximum marks.
            This enables question-wise SEE CO attainment using the NBA formula:
            <strong> CO_attainment = ((Σ marks of students ≥ 65%) / attempts) / max_marks × 100</strong>
          </div>
        </div>

        <Card>
          <CardContent className="pt-5">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-3 mb-3 px-1">
              <div className="col-span-4 text-sm font-semibold text-neutral-600 dark:text-dark-text-secondary">Question Label</div>
              <div className="col-span-4 text-sm font-semibold text-neutral-600 dark:text-dark-text-secondary">CO Number</div>
              <div className="col-span-3 text-sm font-semibold text-neutral-600 dark:text-dark-text-secondary">Max Marks</div>
              <div className="col-span-1" />
            </div>

            <div className="space-y-2">
              {rows.map((row, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-12 gap-3 items-center"
                >
                  <div className="col-span-4">
                    <input
                      type="text"
                      placeholder="e.g. q1a"
                      value={row.question_label}
                      onChange={e => updateRow(i, 'question_label', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                  </div>
                  <div className="col-span-4">
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 3"
                      value={row.co_number}
                      onChange={e => updateRow(i, 'co_number', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="e.g. 10"
                      value={row.max_marks}
                      onChange={e => updateRow(i, 'max_marks', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button
                      onClick={() => removeRow(i)}
                      disabled={rows.length === 1}
                      className="text-neutral-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

            <button
              onClick={addRow}
              className="mt-4 w-full py-2 rounded-lg border border-dashed border-neutral-300 dark:border-dark-border text-sm text-neutral-500 dark:text-dark-text-secondary hover:border-primary-400 dark:hover:border-primary-600 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              + Add Question
            </button>
          </CardContent>
        </Card>

        {/* Saved summary */}
        {saved.length > 0 && (
          <Card>
            <CardContent className="pt-5">
              <h4 className="text-sm font-semibold text-neutral-700 dark:text-dark-text-primary mb-3">
                Saved Mapping — {saved.length} questions
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-neutral-500 dark:text-dark-text-secondary border-b border-neutral-100 dark:border-dark-border">
                      <th className="pb-2 pr-4">Question</th>
                      <th className="pb-2 pr-4">CO</th>
                      <th className="pb-2">Max Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saved.map((r, i) => (
                      <tr key={i} className="border-b border-neutral-50 dark:border-dark-border last:border-0">
                        <td className="py-1.5 pr-4 font-mono text-neutral-800 dark:text-dark-text-primary">{r.question_label}</td>
                        <td className="py-1.5 pr-4 text-primary-600 dark:text-primary-400">CO{r.co_number}</td>
                        <td className="py-1.5 text-neutral-600 dark:text-dark-text-secondary">{r.max_marks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
