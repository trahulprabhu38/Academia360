import { useState, useEffect } from 'react';
import { Users, ChevronDown, ChevronUp, Search, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { attainmentV2API } from '../../services/api';
import { Button } from '../ui/button';

const LEVEL_COLORS = {
  3: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  2: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  1: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};
const LEVEL_CELL = {
  3: 'bg-emerald-50 dark:bg-emerald-900/15',
  2: 'bg-amber-50 dark:bg-amber-900/15',
  1: 'bg-red-50 dark:bg-red-900/15',
};

function pct(val) {
  return val == null ? '—' : `${parseFloat(val).toFixed(1)}%`;
}

function LevelBadge({ level }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${LEVEL_COLORS[level] || LEVEL_COLORS[1]}`}>
      L{level}
    </span>
  );
}

function StudentDetailRow({ row, cos, colSpan, hasLab }) {
  return (
    <tr className="bg-neutral-50 dark:bg-dark-bg-tertiary border-b border-neutral-200 dark:border-dark-border">
      <td colSpan={colSpan} className="px-4 py-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cos.map(co => {
            const entry = row.cos.find(r => r.co_number === co.co_number);
            if (!entry) return null;
            return (
              <div key={co.co_number}
                className={`rounded-lg p-3 text-xs space-y-1 border ${LEVEL_CELL[entry.attainment_level]} border-neutral-200 dark:border-dark-border`}>
                <p className="font-semibold text-neutral-800 dark:text-dark-text-primary flex items-center gap-2">
                  CO{co.co_number}
                  <LevelBadge level={entry.attainment_level} />
                </p>
                <div className="text-neutral-600 dark:text-dark-text-secondary space-y-0.5">
                  <div className="flex justify-between">
                    <span>CIA {hasLab ? '(combined)' : ''}:</span>
                    <span className="font-medium">{pct(entry.theory_cia_pct)}</span>
                  </div>
                  {hasLab && parseFloat(entry.lab_cia_pct || 0) > 0 && (
                    <div className="flex justify-between text-neutral-400 dark:text-dark-text-muted">
                      <span>Lab CIA (ref):</span>
                      <span>{pct(entry.lab_cia_pct)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>SEE:</span>
                    <span className="font-medium">{pct(entry.see_pct)}</span>
                  </div>
                  <div className="flex justify-between border-t border-neutral-200 dark:border-dark-border pt-1 mt-1">
                    <span className="font-semibold text-neutral-800 dark:text-dark-text-primary">Final:</span>
                    <span className="font-bold text-neutral-900 dark:text-dark-text-primary">{pct(entry.final_pct)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </td>
    </tr>
  );
}

export default function StudentAttainmentGrid({ courseId }) {
  const [loading, setLoading] = useState(true);
  const [cos, setCos] = useState([]);
  const [rows, setRows] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');

  const hasLab = rows.some(r => r.cos.some(c => parseFloat(c.lab_cia_pct || 0) > 0));

  useEffect(() => {
    load();
  }, [courseId]);

  async function load() {
    try {
      setLoading(true);
      const res = await attainmentV2API.getAllStudentsAttainment(courseId);
      const rawData = res.data.data || [];
      const rawCos  = res.data.cos  || [];
      setCos(rawCos);

      const byStudent = {};
      for (const r of rawData) {
        if (!byStudent[r.student_id]) {
          byStudent[r.student_id] = {
            studentId: r.student_id,
            usn: r.usn,
            studentName: r.student_name,
            cos: []
          };
        }
        byStudent[r.student_id].cos.push(r);
      }
      setRows(Object.values(byStudent).sort((a, b) => (a.usn || '').localeCompare(b.usn || '')));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = rows.filter(r =>
    !search ||
    (r.usn || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.studentName || '').toLowerCase().includes(search.toLowerCase())
  );

  const l3All = rows.filter(r => r.cos.every(c => c.attainment_level === 3)).length;
  const l1Any = rows.filter(r => r.cos.some(c => c.attainment_level === 1)).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500 dark:text-dark-text-secondary">
        <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium">No student attainment data yet.</p>
        <p className="text-sm mt-1">Run the full pipeline to compute per-student attainment.</p>
      </div>
    );
  }

  const colSpan = cos.length + 3;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2 text-neutral-600 dark:text-dark-text-secondary">
            <Users className="w-4 h-4" />
            <span className="font-medium">{rows.length} students</span>
            <span className="text-neutral-400">·</span>
            <span>{cos.length} COs</span>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-xs text-neutral-500 dark:text-dark-text-muted">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 dark:bg-emerald-800 inline-block" />
              All L3: {l3All}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-200 dark:bg-red-800 inline-block" />
              Any L1: {l1Any}
            </span>
          </div>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student / USN…"
            className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-xs text-neutral-500 dark:text-dark-text-muted">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-100 dark:bg-emerald-900 inline-block border border-emerald-200 dark:border-emerald-800" /> L3 ≥ 80%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-100 dark:bg-amber-900 inline-block border border-amber-200 dark:border-amber-800" /> L2 ≥ 60%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-100 dark:bg-red-900 inline-block border border-red-200 dark:border-red-800" /> L1 &lt; 60%</span>
        <span className="ml-auto">Click a row to expand details</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-dark-border">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-neutral-50 dark:bg-dark-bg-secondary border-b border-neutral-200 dark:border-dark-border">
              <th className="px-3 py-2.5 text-left font-semibold text-neutral-700 dark:text-dark-text-primary whitespace-nowrap">USN</th>
              <th className="px-3 py-2.5 text-left font-semibold text-neutral-700 dark:text-dark-text-primary whitespace-nowrap">Student</th>
              {cos.map(co => (
                <th key={co.co_number}
                  className="px-3 py-2.5 text-center font-semibold text-neutral-700 dark:text-dark-text-primary whitespace-nowrap">
                  CO{co.co_number}
                </th>
              ))}
              <th className="px-3 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(student => {
              const isOpen = expanded === student.studentId;
              return (
                <>
                  <tr
                    key={student.studentId}
                    className="border-b border-neutral-100 dark:border-dark-border hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary cursor-pointer transition-colors"
                    onClick={() => setExpanded(isOpen ? null : student.studentId)}
                  >
                    <td className="px-3 py-2.5 font-mono text-xs text-neutral-600 dark:text-dark-text-secondary whitespace-nowrap">
                      {student.usn || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-800 dark:text-dark-text-primary whitespace-nowrap max-w-[180px] truncate">
                      {student.studentName}
                    </td>
                    {cos.map(co => {
                      const entry = student.cos.find(r => r.co_number === co.co_number);
                      if (!entry) return (
                        <td key={co.co_number} className="px-3 py-2.5 text-center text-neutral-400 text-xs">—</td>
                      );
                      return (
                        <td key={co.co_number}
                          className={`px-3 py-2.5 text-center ${LEVEL_CELL[entry.attainment_level]}`}>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-medium text-neutral-800 dark:text-dark-text-primary text-xs">
                              {parseFloat(entry.final_pct).toFixed(1)}%
                            </span>
                            <LevelBadge level={entry.attainment_level} />
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-neutral-400">
                      {isOpen
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />}
                    </td>
                  </tr>
                  {isOpen && (
                    <StudentDetailRow
                      key={`detail-${student.studentId}`}
                      row={student}
                      cos={cos}
                      colSpan={colSpan}
                      hasLab={hasLab}
                    />
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
