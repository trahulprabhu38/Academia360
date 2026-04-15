import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, RefreshCw, CheckCircle, XCircle, Info, BarChart2, Award } from 'lucide-react';
import { attainmentV2API } from '../../services/api';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import toast from 'react-hot-toast';

const LEVEL_COLORS = {
  3: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  2: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  1: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};
const LEVEL_BAR = {
  3: 'from-emerald-400 to-emerald-600',
  2: 'from-amber-400 to-amber-500',
  1: 'from-red-400 to-red-500',
};
const LEVEL_LABEL = { 3: 'L3 — High', 2: 'L2 — Medium', 1: 'L1 — Low' };

const pct = (v) => (v != null ? parseFloat(v).toFixed(2) : '—');

function MiniBar({ value, level }) {
  const width = Math.min(100, Math.max(0, parseFloat(value || 0)));
  return (
    <div className="w-full h-1.5 bg-neutral-100 dark:bg-dark-bg-tertiary rounded-full overflow-hidden mt-1">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${LEVEL_BAR[level] || LEVEL_BAR[1]}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function SummaryCard({ label, value, sublabel, color }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sublabel && <p className="text-xs opacity-60 mt-0.5">{sublabel}</p>}
    </div>
  );
}

export default function COAttainmentFinal({ courseId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    if (courseId) loadData();
  }, [courseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await attainmentV2API.getCOFinal(courseId);
      setData(res.data.data || []);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      await attainmentV2API.recalculate(courseId);
      toast.success('Attainment recalculated');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Recalculation failed');
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <TrendingUp className="w-10 h-10 text-neutral-400 mx-auto mb-3" />
          <p className="text-neutral-500 dark:text-dark-text-secondary mb-4">
            No CO attainment data yet. Upload marksheets and run recalculation.
          </p>
          <Button onClick={handleRecalculate} disabled={recalculating}>
            {recalculating ? 'Calculating…' : 'Calculate Now'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const attained = data.filter(r => r.is_attained).length;
  const avgFinal = data.length
    ? (data.reduce((s, r) => s + parseFloat(r.final_attainment || 0), 0) / data.length).toFixed(1)
    : '—';
  const l3Count = data.filter(r => r.attainment_level === 3).length;
  const hasCES  = data.some(r => parseFloat(r.ces_attainment || 0) > 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-dark-text-primary flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary-500" />
          CO Attainment — Final
        </h3>
        <Button variant="outline" size="sm" onClick={handleRecalculate} disabled={recalculating}>
          <RefreshCw className={`w-4 h-4 mr-2 ${recalculating ? 'animate-spin' : ''}`} />
          {recalculating ? 'Recalculating…' : 'Recalculate'}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Avg Final Attainment"
          value={`${avgFinal}%`}
          sublabel="across all COs"
          color="border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text-primary"
        />
        <SummaryCard
          label="COs Attained"
          value={`${attained} / ${data.length}`}
          sublabel="≥ target threshold"
          color="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-300"
        />
        <SummaryCard
          label="Level 3 COs"
          value={l3Count}
          sublabel="final ≥ 80%"
          color="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-300"
        />
        <SummaryCard
          label="CES"
          value={hasCES ? 'Included' : 'No Data'}
          sublabel={hasCES ? 'indirect attainment' : 'using direct only'}
          color={hasCES
            ? 'border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-300'
            : 'border-neutral-200 dark:border-dark-border bg-neutral-50 dark:bg-dark-bg-secondary text-neutral-500 dark:text-dark-text-secondary'}
        />
      </div>

      {/* Formula banner */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-800 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p>
            {hasCES
              ? <><strong>Final = 0.7 × CIA + 0.2 × SEE + 0.1 × CES</strong> (indirect included)</>
              : <><strong>Final = 0.7 × CIA + 0.2 × SEE</strong> (no CES data, normalized to 100%)</>
            }
          </p>
          <p className="text-xs opacity-80">
            Threshold: 65% per question &nbsp;|&nbsp; Level 3 ≥ 80%, Level 2 ≥ 60%, Level 1 &lt; 60%
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-dark-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-50 dark:bg-dark-bg-secondary border-b border-neutral-200 dark:border-dark-border">
              <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-dark-text-primary">CO</th>
              <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-dark-text-primary hidden lg:table-cell">Description</th>
              <th className="px-4 py-3 text-center font-semibold text-neutral-700 dark:text-dark-text-primary">CIA</th>
              <th className="px-4 py-3 text-center font-semibold text-neutral-700 dark:text-dark-text-primary">SEE</th>
              {hasCES && (
                <th className="px-4 py-3 text-center font-semibold text-neutral-700 dark:text-dark-text-primary">CES</th>
              )}
              <th className="px-4 py-3 text-center font-semibold text-neutral-700 dark:text-dark-text-primary">Direct</th>
              <th className="px-4 py-3 text-center font-semibold text-neutral-900 dark:text-dark-text-primary">Final</th>
              <th className="px-4 py-3 text-center font-semibold text-neutral-700 dark:text-dark-text-primary">Level</th>
              <th className="px-4 py-3 text-center font-semibold text-neutral-700 dark:text-dark-text-primary">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <motion.tr
                key={row.co_id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="border-b border-neutral-100 dark:border-dark-border last:border-0 hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary"
              >
                <td className="px-4 py-3">
                  <span className="font-bold text-neutral-900 dark:text-dark-text-primary">CO{row.co_number}</span>
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-dark-text-secondary hidden lg:table-cell max-w-xs truncate text-xs">
                  {row.description}
                </td>
                <td className="px-4 py-3 text-center text-neutral-700 dark:text-dark-text-secondary">
                  {pct(row.theory_cia_attainment)}%
                </td>
                <td className="px-4 py-3 text-center text-neutral-700 dark:text-dark-text-secondary">
                  {pct(row.see_attainment)}%
                </td>
                {hasCES && (
                  <td className="px-4 py-3 text-center text-neutral-700 dark:text-dark-text-secondary">
                    {pct(row.ces_attainment)}%
                  </td>
                )}
                <td className="px-4 py-3 text-center text-neutral-700 dark:text-dark-text-secondary">
                  {pct(row.direct_attainment)}%
                </td>
                <td className="px-4 py-3 text-center min-w-[90px]">
                  <span className="font-bold text-neutral-900 dark:text-dark-text-primary">
                    {pct(row.final_attainment)}%
                  </span>
                  <MiniBar value={row.final_attainment} level={row.attainment_level} />
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${LEVEL_COLORS[row.attainment_level] || LEVEL_COLORS[1]}`}>
                    {LEVEL_LABEL[row.attainment_level] || 'L1'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {row.is_attained
                    ? <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto" />
                    : <XCircle className="w-5 h-5 text-red-400 mx-auto" />}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
