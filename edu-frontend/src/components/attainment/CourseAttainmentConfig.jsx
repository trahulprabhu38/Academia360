import { useState, useEffect } from 'react';
import { Settings, Save, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { attainmentV2API } from '../../services/api';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

const COURSE_TYPES = [
  { value: 'STANDALONE_THEORY', label: 'Standalone Theory' },
  { value: 'STANDALONE_LAB', label: 'Standalone Lab' },
  { value: 'IPCC', label: 'IPCC (Theory + Lab)' },
];

const Field = ({ label, hint, children }) => (
  <div>
    <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text-primary mb-1">{label}</label>
    {hint && <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mb-1.5">{hint}</p>}
    {children}
  </div>
);

export default function CourseAttainmentConfig({ courseId }) {
  const [config, setConfig] = useState({
    course_type: 'STANDALONE_THEORY',
    attainment_threshold: 65,
    cie_weightage: 60,
    see_weightage: 40,
    direct_weightage: 90,
    ces_weightage: 10,
    target_attainment: 60,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (courseId) loadConfig();
  }, [courseId]);

  const loadConfig = async () => {
    try {
      const res = await attainmentV2API.getConfig(courseId);
      if (res.data.data) {
        setConfig(prev => ({ ...prev, ...res.data.data }));
      }
    } catch {
      // use defaults
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await attainmentV2API.updateConfig(courseId, config);
      toast.success('Configuration saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const set = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <h3 className="text-lg font-semibold text-neutral-900 dark:text-dark-text-primary flex items-center gap-2">
        <Settings className="w-5 h-5 text-primary-500" />
        Attainment Configuration
      </h3>

      <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        Changes take effect the next time you run the full pipeline recalculation.
      </div>

      <Card>
        <CardContent className="pt-5 space-y-5">
          <Field label="Course Type" hint="Determines which attainment sheets are combined in the CIE calculation.">
            <select
              value={config.course_type}
              onChange={e => set('course_type', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              {COURSE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Attainment Threshold (%)" hint="Student must score ≥ this % per question to qualify.">
              <input
                type="number" min="0" max="100" step="1"
                value={config.attainment_threshold}
                onChange={e => set('attainment_threshold', parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </Field>

            <Field label="Target Attainment (%)" hint="Minimum CO attainment to be classified as achieved.">
              <input
                type="number" min="0" max="100" step="1"
                value={config.target_attainment}
                onChange={e => set('target_attainment', parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </Field>
          </div>

          {/* Direct attainment weightages */}
          <div>
            <p className="text-sm font-medium text-neutral-700 dark:text-dark-text-primary mb-2">
              Direct Attainment Weightages
              <span className="ml-2 text-xs text-neutral-400">(CIE + SEE must = 100)</span>
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="CIE Weightage (%)">
                <input
                  type="number" min="0" max="100" step="5"
                  value={config.cie_weightage}
                  onChange={e => set('cie_weightage', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </Field>
              <Field label="SEE Weightage (%)">
                <input
                  type="number" min="0" max="100" step="5"
                  value={config.see_weightage}
                  onChange={e => set('see_weightage', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </Field>
            </div>
          </div>

          {/* Final attainment split */}
          <div>
            <p className="text-sm font-medium text-neutral-700 dark:text-dark-text-primary mb-2">
              Final Attainment Split
              <span className="ml-2 text-xs text-neutral-400">(Direct + CES must = 100)</span>
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Direct Attainment Weight (%)">
                <input
                  type="number" min="0" max="100" step="5"
                  value={config.direct_weightage}
                  onChange={e => set('direct_weightage', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </Field>
              <Field label="CES (Indirect) Weight (%)">
                <input
                  type="number" min="0" max="100" step="5"
                  value={config.ces_weightage}
                  onChange={e => set('ces_weightage', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </Field>
            </div>
          </div>

          {/* Formula preview */}
          <div className="p-3 rounded-lg bg-neutral-50 dark:bg-dark-bg-tertiary text-xs text-neutral-600 dark:text-dark-text-secondary font-mono">
            Final CO = {config.direct_weightage}% × ({config.cie_weightage}% × CIE + {config.see_weightage}% × SEE) + {config.ces_weightage}% × CES
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving…' : 'Save Configuration'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
