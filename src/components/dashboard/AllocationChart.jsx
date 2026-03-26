import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/portfolioAnalytics';

const COLORS = ['#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#EC4899', '#F97316', '#8B5CF6'];

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]?.payload) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1320] px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-white">{point.name}</p>
      <p className="text-slate-300">{point.allocation.toFixed(1)}% allocation</p>
      <p className="text-amber-300">{formatCurrency(point.value)}</p>
    </div>
  );
}

export default function AllocationChart({ analytics, groupBy = 'stock' }) {
  const data = groupBy === 'sector'
    ? analytics.sectorExposure.map((sector) => ({
      name: sector.sector,
      allocation: sector.allocation,
      value: sector.value,
    }))
    : analytics.holdings.map((holding) => ({
      name: holding.symbol,
      allocation: holding.allocation,
      value: holding.value,
    }));

  if (data.length === 0) {
    return <div className="flex h-72 items-center justify-center text-sm text-slate-500">Add holdings to visualize allocation.</div>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="allocation"
              nameKey="name"
              innerRadius={56}
              outerRadius={92}
              paddingAngle={3}
            >
              {data.map((entry, index) => (
                <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-3">
        {data.map((entry, index) => (
          <div key={entry.name} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <div>
                  <p className="font-medium text-white">{entry.name}</p>
                  <p className="text-xs text-slate-500">{formatCurrency(entry.value)}</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-amber-300">{entry.allocation.toFixed(1)}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
