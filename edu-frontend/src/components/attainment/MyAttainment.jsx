import { useState, useEffect } from 'react';
import { TrendingUp, Target, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { attainmentV2API } from '../../services/api';
import { Card, CardContent } from '../ui/card';

const LEVEL_LABEL = { 3: 'L3', 2: 'L2', 1: 'L1' };
const LEVEL_COLOR = {
  3: 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30',
  2: 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
  1: 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
};
const BAR_COLOR = {
  3: 'bg-emerald-500',
  2: 'bg-amber-500',
  1: 'bg-red-500',
};

function LevelBadge({ level }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${LEVEL_COLOR[level] || LEVEL_COLOR[1]}`}>
      {LEVEL_LABEL[level] || 'L1'}
    </span>
  );
}

function Bar({ pct, level }) {
  return (
    <div className="h-2 rounded-full bg-neutral-200 dark:bg-dark-bg-tertiary overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${BAR_COLOR[level] || 'bg-neutral-400'}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function COSection({ cos }) {
  const [open, setOpen] = useState(true);
  if (!cos || cos.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full text-left mb-3"
      >
        <TrendingUp className="w-4 h-4 text-primary-500" />
        <span className="font-semibold text-neutral-800 dark:text-dark-text-primary text-sm">
          Course Outcome Attainment
        </span>
        {open ? <ChevronUp className="w-4 h-4 ml-auto text-neutral-400" />
               : <ChevronDown className="w-4 h-4 ml-auto text-neutral-400" />}
      </button>
      {open && (
        <div className="space-y-3">
          {cos.map(co => (
            <div key={co.co_number} className="rounded-xl border border-neutral-200 dark:border-dark-border p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-neutral-800 dark:text-dark-text-primary text-sm">
                    CO{co.co_number}
                  </span>
                  {co.co_description && (
                    <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mt-0.5 line-clamp-1">
                      {co.co_description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-neutral-800 dark:text-dark-text-primary">
                    {parseFloat(co.final_pct || 0).toFixed(1)}%
                  </span>
                  <LevelBadge level={co.attainment_level} />
                </div>
              </div>
              <Bar pct={parseFloat(co.final_pct || 0)} level={co.attainment_level} />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-dark-text-secondary">
                <span>CIE: {parseFloat(co.cie_pct || 0).toFixed(1)}%</span>
                <span>SEE: {parseFloat(co.see_pct || 0).toFixed(1)}%</span>
                {parseFloat(co.ces_pct || 0) > 0 && (
                  <span>CES: {parseFloat(co.ces_pct || 0).toFixed(1)}%</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function POSection({ pos }) {
  const [open, setOpen] = useState(false);
  if (!pos || pos.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full text-left mb-3"
      >
        <Target className="w-4 h-4 text-primary-500" />
        <span className="font-semibold text-neutral-800 dark:text-dark-text-primary text-sm">
          Program Outcome Attainment
        </span>
        {open ? <ChevronUp className="w-4 h-4 ml-auto text-neutral-400" />
               : <ChevronDown className="w-4 h-4 ml-auto text-neutral-400" />}
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-2">
          {pos.map(po => (
            <div key={po.po_number}
              className="rounded-xl border border-neutral-200 dark:border-dark-border p-3 text-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-neutral-800 dark:text-dark-text-primary">
                  PO{po.po_number}
                </span>
                <LevelBadge level={po.attainment_level} />
              </div>
              <Bar pct={parseFloat(po.po_attainment_pct || 0)} level={po.attainment_level} />
              <p className="mt-1 text-xs text-neutral-500 dark:text-dark-text-secondary">
                {parseFloat(po.po_attainment_pct || 0).toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PSOSection({ psos }) {
  const [open, setOpen] = useState(false);
  if (!psos || psos.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full text-left mb-3"
      >
        <Star className="w-4 h-4 text-primary-500" />
        <span className="font-semibold text-neutral-800 dark:text-dark-text-primary text-sm">
          Program Specific Outcome Attainment
        </span>
        {open ? <ChevronUp className="w-4 h-4 ml-auto text-neutral-400" />
               : <ChevronDown className="w-4 h-4 ml-auto text-neutral-400" />}
      </button>
      {open && (
        <div className="grid grid-cols-3 gap-2">
          {psos.map(pso => (
            <div key={pso.pso_number}
              className="rounded-xl border border-neutral-200 dark:border-dark-border p-3 text-sm text-center">
              <p className="font-semibold text-neutral-800 dark:text-dark-text-primary">
                PSO{pso.pso_number}
              </p>
              <p className="text-xl font-bold mt-1 text-neutral-900 dark:text-dark-text-primary">
                {parseFloat(pso.pso_attainment_pct || 0).toFixed(1)}%
              </p>
              <div className="mt-1"><LevelBadge level={pso.attainment_level} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyAttainment({ courseId }) {
  const [loading, setLoading] = useState(true);
  const [data, setData]       = useState(null);
  const [empty, setEmpty]     = useState(false);

  useEffect(() => {
    load();
  }, [courseId]);

  async function load() {
    try {
      setLoading(true);
      const res = await attainmentV2API.getMyAttainment(courseId);
      const d = res.data.data;
      if (!d?.co?.length) {
        setEmpty(true);
      } else {
        setData(d);
      }
    } catch {
      setEmpty(true);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (empty || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-neutral-500 dark:text-dark-text-secondary">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="font-medium">Attainment not calculated yet.</p>
          <p className="text-sm mt-1">Your teacher will run the pipeline to generate your attainment report.</p>
        </CardContent>
      </Card>
    );
  }

  // Quick summary stat
  const coCount    = data.co?.length || 0;
  const attained   = data.co?.filter(c => c.is_attained).length || 0;
  const avgFinal   = coCount > 0
    ? (data.co.reduce((s, c) => s + parseFloat(c.final_pct || 0), 0) / coCount).toFixed(1)
    : '0.0';

  return (
    <Card>
      <CardContent className="pt-5 space-y-5">
        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-neutral-50 dark:bg-dark-bg-secondary p-3">
            <p className="text-2xl font-bold text-neutral-900 dark:text-dark-text-primary">{avgFinal}%</p>
            <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mt-0.5">Avg CO Attainment</p>
          </div>
          <div className="rounded-xl bg-neutral-50 dark:bg-dark-bg-secondary p-3">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{attained}</p>
            <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mt-0.5">COs Attained</p>
          </div>
          <div className="rounded-xl bg-neutral-50 dark:bg-dark-bg-secondary p-3">
            <p className="text-2xl font-bold text-neutral-900 dark:text-dark-text-primary">{coCount}</p>
            <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mt-0.5">Total COs</p>
          </div>
        </div>

        <COSection  cos={data.co}  />
        <POSection  pos={data.po}  />
        <PSOSection psos={data.pso} />
      </CardContent>
    </Card>
  );
}
