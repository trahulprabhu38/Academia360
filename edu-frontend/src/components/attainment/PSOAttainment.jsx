import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Star, Info } from 'lucide-react';
import { attainmentV2API } from '../../services/api';
import { Card, CardContent } from '../ui/card';

const LEVEL_COLORS = {
  3: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
  2: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  1: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
};
const LEVEL_BAR = {
  3: 'from-emerald-400 to-emerald-600',
  2: 'from-amber-400 to-amber-500',
  1: 'from-red-400 to-red-500',
};

const pct = (v) => (v != null ? parseFloat(v).toFixed(2) : '—');

export default function PSOAttainment({ courseId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (courseId) load();
  }, [courseId]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await attainmentV2API.getPSO(courseId);
      setData(res.data.data || []);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Star className="w-10 h-10 text-neutral-400 mx-auto mb-3" />
          <p className="text-neutral-500 dark:text-dark-text-secondary">
            No PSO attainment data. Set up CO-PSO mapping and recalculate.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-dark-text-primary flex items-center gap-2">
          <Star className="w-5 h-5 text-primary-500" />
          PSO Attainment — Program Specific Outcomes
        </h3>
        <div className="flex items-center gap-1 text-xs text-neutral-500 dark:text-dark-text-muted">
          <Info className="w-3 h-3" />
          PSO = weighted avg of mapped CO attainments
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((row, i) => (
          <motion.div
            key={row.pso_number}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.08 }}
            className={`rounded-xl border-2 bg-white dark:bg-dark-bg-secondary p-5 ${LEVEL_COLORS[row.attainment_level] || LEVEL_COLORS[1]}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-base font-bold text-neutral-900 dark:text-dark-text-primary">
                PSO{row.pso_number}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${LEVEL_COLORS[row.attainment_level] || LEVEL_COLORS[1]}`}>
                Level {row.attainment_level || 1}
              </span>
            </div>
            <p className="text-sm text-neutral-600 dark:text-dark-text-secondary mb-4 leading-relaxed line-clamp-3">
              {row.description}
            </p>
            <div className="text-3xl font-bold text-neutral-900 dark:text-dark-text-primary">
              {pct(row.final_attainment)}%
            </div>
            <div className="mt-3 h-2 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, parseFloat(row.final_attainment || 0))}%` }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className={`h-full rounded-full bg-gradient-to-r ${LEVEL_BAR[row.attainment_level] || LEVEL_BAR[1]}`}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
