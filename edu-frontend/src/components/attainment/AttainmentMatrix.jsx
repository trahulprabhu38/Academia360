import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LayoutGrid, Info } from 'lucide-react';
import { attainmentV2API } from '../../services/api';
import { Card, CardContent } from '../ui/card';

const LEVEL_BG = {
  3: 'bg-emerald-200 dark:bg-emerald-800/50 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700',
  2: 'bg-amber-100 dark:bg-amber-800/40 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-700',
  1: 'bg-red-100 dark:bg-red-800/30 text-red-900 dark:text-red-300 border border-red-200 dark:border-red-700',
  0: 'bg-neutral-50 dark:bg-dark-bg-tertiary text-neutral-300 dark:text-neutral-600',
};
const LEVEL_ATT = {
  3: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  2: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  1: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const pct = (v) => (v != null ? parseFloat(v).toFixed(1) : '—');

export default function AttainmentMatrix({ courseId }) {
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (courseId) load();
  }, [courseId]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await attainmentV2API.getMatrix(courseId);
      setMatrix(res.data.data);
    } catch {
      setMatrix(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!matrix) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <LayoutGrid className="w-10 h-10 text-neutral-400 mx-auto mb-3" />
          <p className="text-neutral-500 dark:text-dark-text-secondary">
            No matrix data yet. Run recalculation first.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { cos, pos, psos, coAttainment, poAttainment, psoAttainment, coPoDerivedMapping, coPsoDerivedMapping } = matrix;

  const coAttMap = {};
  coAttainment.forEach(r => { coAttMap[r.co_number] = r; });

  const poAttMap = {};
  poAttainment.forEach(r => { poAttMap[r.po_number] = r; });

  const psoAttMap = {};
  psoAttainment.forEach(r => { psoAttMap[r.pso_number] = r; });

  const coPoDerMap = {};
  coPoDerivedMapping.forEach(r => {
    if (!coPoDerMap[r.co_number]) coPoDerMap[r.co_number] = {};
    coPoDerMap[r.co_number][r.po_number] = r.derived_level;
  });

  const coPsoDerMap = {};
  coPsoDerivedMapping.forEach(r => {
    if (!coPsoDerMap[r.co_number]) coPsoDerMap[r.co_number] = {};
    coPsoDerMap[r.co_number][r.pso_number] = r.derived_level;
  });

  const allOutcomes = [
    ...pos.map(p => ({ key: `PO${p.po_number}`, type: 'po', num: p.po_number })),
    ...psos.map(p => ({ key: `PSO${p.pso_number}`, type: 'pso', num: p.pso_number }))
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-dark-text-primary flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-primary-500" />
          CO-PO-PSO Attainment Matrix
        </h3>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 items-center">
        {[3, 2, 1].map(l => (
          <span key={l} className={`px-3 py-1 rounded-full text-xs font-semibold ${LEVEL_ATT[l]}`}>
            Level {l} {l === 3 ? '≥ 80%' : l === 2 ? '≥ 60%' : '< 60%'}
          </span>
        ))}
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 dark:bg-dark-bg-tertiary text-neutral-400">
          — Not mapped
        </span>
        {psos.length > 0 && (
          <span className="ml-auto text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
            <Info className="w-3 h-3" /> PSO columns highlighted in purple
          </span>
        )}
      </div>

      {/* Matrix table */}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-dark-border">
        <table className="text-xs min-w-full border-collapse">
          <thead>
            <tr className="bg-neutral-50 dark:bg-dark-bg-secondary border-b border-neutral-200 dark:border-dark-border">
              <th className="px-3 py-3 text-left font-semibold text-neutral-700 dark:text-dark-text-primary sticky left-0 bg-neutral-50 dark:bg-dark-bg-secondary z-10 border-r border-neutral-200 dark:border-dark-border">
                CO
              </th>
              {allOutcomes.map(o => (
                <th
                  key={o.key}
                  className={`px-3 py-3 text-center font-semibold whitespace-nowrap ${
                    o.type === 'pso'
                      ? 'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/10'
                      : 'text-neutral-700 dark:text-dark-text-primary'
                  }`}
                >
                  {o.key}
                </th>
              ))}
              <th className="px-3 py-3 text-center font-semibold text-neutral-700 dark:text-dark-text-primary bg-neutral-100 dark:bg-dark-bg-tertiary whitespace-nowrap">
                CO Att. %
              </th>
              <th className="px-3 py-3 text-center font-semibold text-neutral-700 dark:text-dark-text-primary bg-neutral-100 dark:bg-dark-bg-tertiary">
                Level
              </th>
            </tr>
          </thead>
          <tbody>
            {cos.map((co, i) => {
              const att = coAttMap[co.co_number];
              return (
                <motion.tr
                  key={co.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-neutral-100 dark:border-dark-border hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary"
                >
                  <td className="px-3 py-2.5 font-semibold text-neutral-900 dark:text-dark-text-primary sticky left-0 bg-white dark:bg-dark-bg-primary z-10 border-r border-neutral-100 dark:border-dark-border">
                    CO{co.co_number}
                  </td>
                  {allOutcomes.map(o => {
                    const level = o.type === 'po'
                      ? coPoDerMap[co.co_number]?.[o.num] || 0
                      : coPsoDerMap[co.co_number]?.[o.num] || 0;
                    return (
                      <td key={o.key}
                        className={`px-3 py-2.5 text-center ${o.type === 'pso' ? 'bg-purple-50/50 dark:bg-purple-900/5' : ''}`}>
                        {level > 0
                          ? <span className={`inline-flex items-center justify-center w-6 h-6 rounded font-bold text-xs ${LEVEL_BG[level]}`}>{level}</span>
                          : <span className="text-neutral-300 dark:text-neutral-600">—</span>
                        }
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-center font-semibold text-neutral-900 dark:text-dark-text-primary bg-neutral-50 dark:bg-dark-bg-secondary whitespace-nowrap">
                    {att ? `${pct(att.final_attainment)}%` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center bg-neutral-50 dark:bg-dark-bg-secondary">
                    {att && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${LEVEL_ATT[att.attainment_level] || LEVEL_ATT[1]}`}>
                        L{att.attainment_level || '—'}
                      </span>
                    )}
                  </td>
                </motion.tr>
              );
            })}

            {/* PO/PSO Attainment row */}
            <tr className="border-t-2 border-neutral-300 dark:border-dark-border bg-neutral-50 dark:bg-dark-bg-secondary font-semibold">
              <td className="px-3 py-3 text-neutral-700 dark:text-dark-text-primary sticky left-0 bg-neutral-50 dark:bg-dark-bg-secondary text-xs border-r border-neutral-200 dark:border-dark-border whitespace-nowrap">
                Attainment %
              </td>
              {allOutcomes.map(o => {
                const att = o.type === 'po' ? poAttMap[o.num] : psoAttMap[o.num];
                return (
                  <td key={o.key}
                    className={`px-3 py-3 text-center text-xs font-semibold text-neutral-900 dark:text-dark-text-primary ${
                      o.type === 'pso' ? 'bg-purple-50 dark:bg-purple-900/10' : ''
                    }`}>
                    {att ? `${pct(att.final_attainment)}%` : '—'}
                  </td>
                );
              })}
              <td className="px-3 py-3" colSpan={2} />
            </tr>

            {/* Level row */}
            <tr className="border-t border-neutral-200 dark:border-dark-border bg-neutral-50 dark:bg-dark-bg-secondary">
              <td className="px-3 py-2 text-neutral-600 dark:text-dark-text-secondary text-xs sticky left-0 bg-neutral-50 dark:bg-dark-bg-secondary border-r border-neutral-200 dark:border-dark-border whitespace-nowrap">
                Level (1–3)
              </td>
              {allOutcomes.map(o => {
                const att = o.type === 'po' ? poAttMap[o.num] : psoAttMap[o.num];
                return (
                  <td key={o.key}
                    className={`px-3 py-2 text-center ${o.type === 'pso' ? 'bg-purple-50/50 dark:bg-purple-900/5' : ''}`}>
                    {att && att.attainment_level
                      ? <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${LEVEL_ATT[att.attainment_level]}`}>
                          {att.attainment_level}
                        </span>
                      : <span className="text-neutral-300 dark:text-neutral-600 text-xs">—</span>
                    }
                  </td>
                );
              })}
              <td className="px-3 py-2" colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
