import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '@/lib/portfolioAnalytics';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const [invested, currentValue, pnl] = payload;
  return (
    <div className="rounded-[20px] border border-white/10 bg-[#09111b]/95 px-4 py-3 text-sm shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
      <p className="font-medium text-white">{label}</p>
      <p className="mt-2 text-slate-300">Invested: {formatCurrency(invested?.value || 0)}</p>
      <p className="text-cyan-300">Current value: {formatCurrency(currentValue?.value || 0)}</p>
      <p className={`${(pnl?.value || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>P&L: {formatCurrency(pnl?.value || 0)}</p>
    </div>
  );
}

export default function PortfolioHistoryChart({ analytics }) {
  const rows = analytics?.historySeries || [];

  if (!rows.length) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-[28px] border border-white/8 bg-white/[0.03] text-sm text-slate-400">
        Import your Excel portfolio to see how invested capital, current value, and profit evolved over time.
      </div>
    );
  }

  return (
    <div className="h-[320px] rounded-[28px] border border-white/8 bg-white/[0.03] p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="investedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.34} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.34} />
              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={84}
            tickFormatter={(value) => formatCurrency(value).replace('.00', '')}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="invested" stroke="#f59e0b" strokeWidth={2} fill="url(#investedFill)" />
          <Area type="monotone" dataKey="currentValue" stroke="#22d3ee" strokeWidth={2.2} fill="url(#valueFill)" />
          <Area type="monotone" dataKey="pnl" stroke="#22c55e" strokeWidth={1.8} fillOpacity={0} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
