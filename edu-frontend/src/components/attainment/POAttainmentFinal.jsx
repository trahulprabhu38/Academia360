import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Target, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react';
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

function LevelIcon({ level }) {
  if (level === 3) return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (level === 2) return <Minus className="w-4 h-4 text-amber-500" />;
  return <TrendingDown className="w-4 h-4 text-red-400" />;
}

export default function POAttainmentFinal({ courseId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (courseId) load();
  }, [courseId]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await attainmentV2API.getPOFinal(courseId);
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
          <Target className="w-10 h-10 text-neutral-400 mx-auto mb-3" />
          <p className="text-neutral-500 dark:text-dark-text-secondary">
            No PO attainment data. Run recalculation first.
          </p>
        </CardContent>
      </Card>
    );
  }

  const avgPO = (data.reduce((s, r) => s + parseFloat(r.final_attainment || 0), 0) / data.length).toFixed(1);
  const l3 = data.filter(r => r.attainment_level === 3).length;
  const l1 = data.filter(r => r.attainment_level === 1).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-dark-text-primary flex items-center gap-2">
          <Target className="w-5 h-5 text-primary-500" />
          PO Attainment
        </h3>
        <div className="flex gap-3 text-xs text-neutral-500 dark:text-dark-text-secondary">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> L3 ≥ 80%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> L2 ≥ 60%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> L1 &lt; 60%</span>
        </div>
      </div>

      {/* Summary strip */}
      <div className="flex gap-4 p-3 rounded-lg bg-neutral-50 dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border text-sm">
        <div>
          <span className="text-neutral-500 dark:text-dark-text-secondary">Avg: </span>
          <span className="font-semibold text-neutral-900 dark:text-dark-text-primary">{avgPO}%</span>
        </div>
        <div>
          <span className="text-neutral-500 dark:text-dark-text-secondary">Level 3: </span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{l3}</span>
        </div>
        <div>
          <span className="text-neutral-500 dark:text-dark-text-secondary">Level 1: </span>
          <span className="font-semibold text-red-500">{l1}</span>
        </div>
        <div className="ml-auto text-xs text-neutral-400 dark:text-dark-text-muted flex items-center gap-1">
          <Info className="w-3 h-3" />
          PO = weighted avg of mapped CO attainments
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {data.map((row, i) => (
          <motion.div
            key={row.po_number}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`rounded-xl border-2 bg-white dark:bg-dark-bg-secondary p-4 ${LEVEL_COLORS[row.attainment_level] || LEVEL_COLORS[1]}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-neutral-900 dark:text-dark-text-primary text-sm">PO{row.po_number}</span>
              <div className="flex items-center gap-1">
                <LevelIcon level={row.attainment_level} />
                <span className="text-xs font-medium">L{row.attainment_level || 1}</span>
              </div>
            </div>
            <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mb-3 line-clamp-2 leading-relaxed">
              {row.description}
            </p>
            <div className="text-2xl font-bold text-neutral-900 dark:text-dark-text-primary">
              {pct(row.final_attainment)}%
            </div>
            <div className="mt-2 h-1.5 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, parseFloat(row.final_attainment || 0))}%` }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className={`h-full rounded-full bg-gradient-to-r ${LEVEL_BAR[row.attainment_level] || LEVEL_BAR[1]}`}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
