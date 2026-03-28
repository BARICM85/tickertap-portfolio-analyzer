import React from 'react';
import { Activity, BarChart3, DollarSign, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { formatCompactCurrency, formatCurrency, formatPercent } from '@/lib/portfolioAnalytics';

const CARD_STYLES = [
  { icon: DollarSign, accent: 'text-amber-300', ring: 'from-amber-400/30 to-transparent' },
  { icon: Activity, accent: 'text-emerald-300', ring: 'from-emerald-400/30 to-transparent' },
  { icon: BarChart3, accent: 'text-cyan-300', ring: 'from-cyan-400/30 to-transparent' },
  { icon: ShieldCheck, accent: 'text-rose-300', ring: 'from-rose-400/30 to-transparent' },
  { icon: Sparkles, accent: 'text-indigo-300', ring: 'from-indigo-400/30 to-transparent' },
  { icon: Target, accent: 'text-fuchsia-300', ring: 'from-fuchsia-400/30 to-transparent' },
];

function StatCard({ title, value, subtitle, note, index }) {
  const style = CARD_STYLES[index % CARD_STYLES.length];
  const Icon = style.icon;

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#101826]/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${style.ring}`} />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{title}</p>
          <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
          {subtitle ? <p className="mt-2 text-sm text-slate-300">{subtitle}</p> : null}
          {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <Icon className={`h-5 w-5 ${style.accent}`} />
        </div>
      </div>
    </div>
  );
}

export default function PortfolioStats({ analytics }) {
  const { totals, holdings, topWinner, topLoser } = analytics;
  const positive = totals.totalPnL >= 0;

  const cards = [
    {
      title: 'Portfolio Value',
      value: formatCurrency(totals.totalValue),
      subtitle: `${holdings.length} live holdings`,
      note: `${formatPercent(totals.totalPnLPercent)} vs. cost`,
    },
    {
      title: 'Net P&L',
      value: `${positive ? '+' : '-'}${formatCompactCurrency(Math.abs(totals.totalPnL))}`,
      subtitle: positive ? 'Portfolio is ahead of cost basis' : 'Portfolio is below cost basis',
      note: formatPercent(totals.totalPnLPercent),
    },
    {
      title: 'One Day P&L',
      value: `${totals.totalDayPnL >= 0 ? '+' : '-'}${formatCompactCurrency(Math.abs(totals.totalDayPnL))}`,
      subtitle: totals.totalDayPnL >= 0 ? 'Today portfolio is in profit' : 'Today portfolio is in loss',
      note: 'Calculated from daily price change',
    },
    {
      title: 'Risk Score',
      value: `${totals.riskScore}/100`,
      subtitle: totals.riskScore >= 65 ? 'Higher than ideal risk profile' : 'Within manageable range',
      note: `Weighted beta ${totals.weightedBeta.toFixed(2)}`,
    },
    {
      title: 'Top Winner',
      value: topWinner ? topWinner.symbol : '--',
      subtitle: topWinner ? formatPercent(topWinner.pnlPercent) : 'No holdings yet',
      note: topWinner ? topWinner.name : 'Add stocks to track leaders',
    },
    {
      title: 'Top Drawdown',
      value: topLoser ? topLoser.symbol : '--',
      subtitle: topLoser ? formatPercent(topLoser.pnlPercent) : 'No holdings yet',
      note: topLoser ? topLoser.name : 'No laggards to highlight',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card, index) => (
        <StatCard key={card.title} index={index} {...card} />
      ))}
    </div>
  );
}
