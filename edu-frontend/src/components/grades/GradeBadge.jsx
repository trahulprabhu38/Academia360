import React from 'react';

const GRADE_COLORS = {
  'S':  { bg: 'bg-emerald-600',  text: 'text-white' },
  'A+': { bg: 'bg-green-600',    text: 'text-white' },
  'A':  { bg: 'bg-green-500',    text: 'text-white' },
  'B+': { bg: 'bg-lime-500',     text: 'text-white' },
  'B':  { bg: 'bg-yellow-400',   text: 'text-black' },
  'C+': { bg: 'bg-yellow-300',   text: 'text-black' },
  'C':  { bg: 'bg-amber-400',    text: 'text-black' },
  'D':  { bg: 'bg-orange-500',   text: 'text-white' },
  'E':  { bg: 'bg-orange-600',   text: 'text-white' },
  'P':  { bg: 'bg-blue-500',     text: 'text-white' },
  'F':  { bg: 'bg-red-600',      text: 'text-white' },
};

const GradeBadge = ({ grade, size = 'medium', showPoints = false, gradePoints = null }) => {
  const colors = GRADE_COLORS[grade] || { bg: 'bg-neutral-400', text: 'text-white' };
  const label = showPoints && gradePoints !== null ? `${grade} (${gradePoints})` : (grade || 'N/A');
  const sizeClass = size === 'small' ? 'text-xs px-2 py-0.5 min-w-[36px]' : 'text-sm px-2.5 py-1 min-w-[44px]';

  return (
    <span className={`inline-flex items-center justify-center rounded-md font-bold ${sizeClass} ${colors.bg} ${colors.text}`}>
      {label}
    </span>
  );
};

export default GradeBadge;
