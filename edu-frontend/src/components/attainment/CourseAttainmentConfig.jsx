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
    attainment_threshold: 60,
    cie_weightage: 70,
    see_weightage: 20,
    direct_weightage: 90,
    ces_weightage: 10,
    target_attainment: 60,
    see_attainment_override: '',   // empty = use computed; number = override for all COs
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
        const d = res.data.data;
        setConfig(prev => ({
          ...prev,
          ...d,
          // Convert null override from DB back to empty string for the input
          see_attainment_override: d.see_attainment_override ?? '',
        }));
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
      const payload = {
        ...config,
        // Empty string → null (clears the override)
        see_attainment_override: config.see_attainment_override === '' ? null : config.see_attainment_override,
      };
      await attainmentV2API.updateConfig(courseId, payload);
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

          {/* Flat weightages: CIE + SEE + CES must sum to 100 */}
          <div>
            <p className="text-sm font-medium text-neutral-700 dark:text-dark-text-primary mb-2">
              CO Attainment Weightages
              <span className="ml-2 text-xs text-neutral-400">(CIE + SEE + CES must = 100)</span>
            </p>
            <div className="grid grid-cols-3 gap-4">
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
              <Field label="CES (Indirect) (%)">
                <input
                  type="number" min="0" max="100" step="5"
                  value={config.ces_weightage}
                  onChange={e => set('ces_weightage', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </Field>
            </div>
          </div>

          {/* SEE Attainment Override */}
          <Field
            label="SEE Attainment Override (%)"
            hint="Optional. When set, this value is used for all COs instead of computing from uploaded scores. Use this if you compute SEE attainment externally (e.g. from VTU grade-based formula). Leave blank to use the calculated value."
          >
            <div className="flex gap-2 items-center">
              <input
                type="number" min="0" max="100" step="0.01"
                placeholder="e.g. 34.41 — leave blank to auto-compute"
                value={config.see_attainment_override ?? ''}
                onChange={e => set('see_attainment_override', e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
              {config.see_attainment_override !== '' && config.see_attainment_override != null && (
                <button
                  type="button"
                  onClick={() => set('see_attainment_override', '')}
                  className="px-3 py-2 text-xs rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            {config.see_attainment_override !== '' && config.see_attainment_override != null && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Override active — all COs will use {parseFloat(config.see_attainment_override).toFixed(2)}% as SEE attainment.
              </p>
            )}
          </Field>

          {/* Formula preview */}
          <div className="p-3 rounded-lg bg-neutral-50 dark:bg-dark-bg-tertiary text-xs text-neutral-600 dark:text-dark-text-secondary font-mono">
            Final CO = {config.cie_weightage}% × CIE + {config.see_weightage}% × SEE + {config.ces_weightage}% × CES
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
