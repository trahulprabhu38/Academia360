import React from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-xl p-3 shadow-lg text-xs">
      <p className="font-bold text-neutral-800 dark:text-dark-text-primary mb-1">{payload[0]?.payload?.semester}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: <span className="font-semibold">{Number(entry.value).toFixed(2)}</span>
        </p>
      ))}
      {payload[0]?.payload?.year && (
        <p className="text-neutral-400 mt-1">Year: {payload[0].payload.year}</p>
      )}
    </div>
  );
};

const CGPATrendChart = ({ cgpaHistory, height = 280 }) => {
  if (!cgpaHistory || cgpaHistory.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 bg-neutral-50 dark:bg-dark-bg-secondary rounded-2xl border-2 border-dashed border-neutral-200 dark:border-dark-border">
        <p className="text-sm text-neutral-400 dark:text-dark-text-muted">No CGPA history yet — add grades to see trend</p>
      </div>
    );
  }

  const data = cgpaHistory.map(item => ({
    semester: `Sem ${item.semester}`,
    SGPA: parseFloat(item.sgpa) || 0,
    CGPA: parseFloat(item.cgpa) || 0,
    year: item.academicYear
  }));

  return (
    <div className="bg-white dark:bg-dark-bg-primary rounded-2xl border-2 border-neutral-200 dark:border-dark-border p-4">
      <p className="text-sm font-bold text-neutral-700 dark:text-dark-text-primary mb-4">CGPA / SGPA Trend</p>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 5, right: 16, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="cgpaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.6} />
          <XAxis dataKey="semester" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          <Area type="monotone" dataKey="CGPA" stroke="#3b82f6" strokeWidth={0} fill="url(#cgpaGrad)" />
          <Line type="monotone" dataKey="SGPA" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4, fill: '#22c55e' }} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="CGPA" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CGPATrendChart;
