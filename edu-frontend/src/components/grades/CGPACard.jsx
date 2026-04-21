import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const getCGPAColor = (cgpa) => {
  if (cgpa >= 9.0) return { ring: 'ring-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' };
  if (cgpa >= 8.0) return { ring: 'ring-green-500',   text: 'text-green-600 dark:text-green-400',   bar: 'bg-green-500',   bg: 'bg-green-50 dark:bg-green-900/20' };
  if (cgpa >= 7.0) return { ring: 'ring-lime-500',    text: 'text-lime-600 dark:text-lime-400',    bar: 'bg-lime-500',    bg: 'bg-lime-50 dark:bg-lime-900/20' };
  if (cgpa >= 6.0) return { ring: 'ring-yellow-500',  text: 'text-yellow-600 dark:text-yellow-400',  bar: 'bg-yellow-500',  bg: 'bg-yellow-50 dark:bg-yellow-900/20' };
  if (cgpa >= 5.0) return { ring: 'ring-amber-500',   text: 'text-amber-600 dark:text-amber-400',   bar: 'bg-amber-500',   bg: 'bg-amber-50 dark:bg-amber-900/20' };
  if (cgpa >= 4.0) return { ring: 'ring-orange-500',  text: 'text-orange-600 dark:text-orange-400',  bar: 'bg-orange-500',  bg: 'bg-orange-50 dark:bg-orange-900/20' };
  return             { ring: 'ring-red-500',     text: 'text-red-600 dark:text-red-400',     bar: 'bg-red-500',     bg: 'bg-red-50 dark:bg-red-900/20' };
};

const CGPACard = ({ cgpa, label = 'CGPA', maxCGPA = 10, trend = null, showProgress = true, size = 'medium' }) => {
  const value = parseFloat(cgpa) || 0;
  const pct = Math.min((value / maxCGPA) * 100, 100);
  const c = getCGPAColor(value);

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-neutral-400';

  const numSize = size === 'large' ? 'text-6xl' : size === 'small' ? 'text-3xl' : 'text-5xl';
  const cardH   = size === 'large' ? 'h-48' : size === 'small' ? 'h-28' : 'h-36';

  return (
    <div className={`${cardH} ${c.bg} border-2 ${c.ring.replace('ring-', 'border-')} rounded-2xl p-4 flex flex-col justify-between ring-2 ${c.ring} ring-offset-2 ring-offset-white dark:ring-offset-dark-bg-primary transition-transform hover:scale-[1.02]`}>
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">{label}</p>

      <div className="flex items-end gap-1">
        <span className={`${numSize} font-extrabold leading-none ${c.text}`}>{value.toFixed(2)}</span>
        <span className="text-neutral-400 text-lg mb-1">/{maxCGPA}</span>
        {trend && <TrendIcon className={`w-5 h-5 mb-1 ml-1 ${trendColor}`} />}
      </div>

      {showProgress && (
        <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
          <div className={`h-full ${c.bar} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
};

export default CGPACard;
