import React from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency, formatPercent } from '@/lib/portfolioAnalytics';

function TimelineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const pricePoint = payload.find((entry) => entry.dataKey === 'price');
  const benchmarkPoint = payload.find((entry) => entry.dataKey === 'benchmark');

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1320] px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-white">{label}</p>
      <p className="text-amber-300">Price {formatCurrency(pricePoint?.value || 0)}</p>
      <p className="text-slate-300">Benchmark {formatCurrency(benchmarkPoint?.value || 0)}</p>
    </div>
  );
}

function ScenarioTooltip({ active, payload, label }) {
  if (!active || !payload?.[0]?.payload) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1320] px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-white">{label}</p>
      <p className="text-amber-300">{formatCurrency(point.price)}</p>
      <p className={point.move >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{formatPercent(point.move)}</p>
    </div>
  );
}

export default function StockCharts({ stock, compact = false }) {
  const timeline = stock?.timeline || [];
  const scenarios = stock?.scenarios || [];

  if (timeline.length === 0 && scenarios.length === 0) {
    return (
      <div className="rounded-[32px] border border-white/10 bg-[#0b1624]/90 p-6">
        <p className="text-sm text-slate-400">Charts will appear when price history and scenario data are available.</p>
      </div>
    );
  }

  const content = (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {!compact ? <h2 className="text-xl font-semibold text-white">Stock Charts</h2> : null}
          <p className="mt-1 text-sm text-slate-400">
            Track the simulated holding trend against a benchmark and compare bear, base, and bull case outcomes.
          </p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-2 text-xs text-slate-400">
          Current price <span className="font-semibold text-amber-300">{formatCurrency(stock.current_price)}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">Price Trend</p>
              <p className="text-xs text-slate-500">Simulated timeline from cost basis to current price</p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Buy {formatCurrency(stock.buy_price)}</p>
              <p>Current {formatCurrency(stock.current_price)}</p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={timeline} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.36} />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="benchmarkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} tickFormatter={(value) => formatCurrency(value).replace('.00', '')} />
              <Tooltip content={<TimelineTooltip />} cursor={{ stroke: 'rgba(245,158,11,0.25)', strokeWidth: 1 }} />
              <ReferenceLine y={stock.buy_price} stroke="rgba(248,250,252,0.22)" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="benchmark" stroke="#38BDF8" fill="url(#benchmarkFill)" strokeWidth={2} />
              <Area type="monotone" dataKey="price" stroke="#F59E0B" fill="url(#priceFill)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
          <div className="mb-4">
            <p className="text-sm font-medium text-white">Scenario Range</p>
            <p className="text-xs text-slate-500">Expected outcomes based on current volatility profile</p>
          </div>

          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={scenarios} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} tickFormatter={(value) => formatCurrency(value).replace('.00', '')} />
              <Tooltip content={<ScenarioTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="price" radius={[14, 14, 0, 0]}>
                {scenarios.map((scenario) => (
                  <Cell
                    key={scenario.label}
                    fill={scenario.move >= 0 ? '#10B981' : '#FB7185'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-4 space-y-2">
            {scenarios.map((scenario) => (
              <div key={scenario.label} className="flex items-center justify-between rounded-2xl border border-white/8 bg-[#111c2c] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{scenario.label}</p>
                  <p className="text-xs text-slate-500">{formatCurrency(scenario.price)}</p>
                </div>
                <p className={`text-sm font-semibold ${scenario.move >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatPercent(scenario.move)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  if (compact) return content;

  return (
    <section className="rounded-[32px] border border-white/10 bg-[#0b1624]/90 p-6">
      {content}
    </section>
  );
}
