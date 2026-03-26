import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompactCurrency, formatPercent } from '@/lib/portfolioAnalytics';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]?.payload) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1320] px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-white">{point.symbol}</p>
      <p className={point.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
        {point.pnl >= 0 ? '+' : '-'}
        {formatCompactCurrency(Math.abs(point.pnl))}
      </p>
      <p className="text-slate-300">{formatPercent(point.pnlPercent)}</p>
    </div>
  );
}

export default function PnLChart({ analytics }) {
  const data = [...analytics.performanceSeries].sort((left, right) => right.pnl - left.pnl);

  if (data.length === 0) {
    return <div className="flex h-72 items-center justify-center text-sm text-slate-500">No profit and loss data yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
        <XAxis dataKey="symbol" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey="pnl" radius={[12, 12, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.symbol} fill={entry.pnl >= 0 ? '#10B981' : '#FB7185'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
