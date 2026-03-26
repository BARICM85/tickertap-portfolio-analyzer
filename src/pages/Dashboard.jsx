import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Bell, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import PortfolioStats from '@/components/dashboard/PortfolioStats';
import AllocationChart from '@/components/dashboard/AllocationChart';
import PnLChart from '@/components/dashboard/PnLChart';
import { derivePortfolioAnalytics, deriveWatchlistAnalytics, formatCurrency, formatPercent, getMarketLaggards, getMarketLeaders } from '@/lib/portfolioAnalytics';

function Panel({ title, subtitle, action, children }) {
  return (
    <section className="rounded-[32px] border border-white/10 bg-[#0b1624]/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const [groupBy, setGroupBy] = useState('stock');
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const { data: stocks = [] } = useQuery({
    queryKey: ['stocks'],
    queryFn: () => base44.entities.Stock.list('-created_date'),
  });
  const { data: watchlist = [] } = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => base44.entities.Watchlist.list('-created_date'),
  });

  const analytics = derivePortfolioAnalytics(stocks);
  const watchlistInsights = deriveWatchlistAnalytics(watchlist, analytics.holdings);
  const leaders = getMarketLeaders();
  const laggards = getMarketLaggards();

  const refreshAll = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['stocks'] });
    await queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    setRefreshing(false);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-white/10 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(59,130,246,0.12)_45%,rgba(15,23,42,0.94))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Portfolio command center</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">TickerTap-style stock portfolio analyzing app</h1>
            <p className="mt-3 text-base leading-7 text-slate-200/90">
              Track holdings, scan allocation drift, review watchlist opportunities, and pressure-test risk without leaving the browser.
            </p>
          </div>
          <Button onClick={refreshAll} disabled={refreshing} className="rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200">
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing' : 'Refresh Snapshot'}
          </Button>
        </div>
      </section>

      <PortfolioStats analytics={analytics} />

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
        <Panel
          title="Allocation Map"
          subtitle="Understand how portfolio weight is distributed."
          action={(
            <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-1 text-sm">
              {['stock', 'sector'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setGroupBy(mode)}
                  className={`rounded-full px-4 py-1.5 capitalize ${groupBy === mode ? 'bg-amber-300 text-slate-950' : 'text-slate-300'}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}
        >
          <AllocationChart analytics={analytics} groupBy={groupBy} />
        </Panel>

        <Panel title="P&L Heatmap" subtitle="Quickly spot contributors and drags.">
          <PnLChart analytics={analytics} />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Watchlist Triggers" subtitle="Targets close to your entry zone.">
          <div className="space-y-3">
            {watchlistInsights.slice(0, 4).map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-4">
                <div>
                  <p className="font-medium text-white">{item.symbol}</p>
                  <p className="text-sm text-slate-400">{item.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-300">Current {formatCurrency(item.current_price)}</p>
                  <p className="text-sm text-amber-300">Target {formatCurrency(item.target_price)}</p>
                  <p className="text-xs text-slate-500">{item.status}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Portfolio Pulse" subtitle="The highest-signal stats at a glance.">
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { label: 'Diversification', value: `${analytics.totals.diversificationScore}/100`, detail: 'Higher is better' },
              { label: 'Weighted Beta', value: analytics.totals.weightedBeta.toFixed(2), detail: 'Volatility vs market' },
              { label: 'Largest Position', value: analytics.holdings[0] ? `${analytics.holdings[0].symbol} ${analytics.holdings[0].allocation.toFixed(1)}%` : '--', detail: 'Concentration driver' },
              { label: 'Income Run Rate', value: formatCurrency(analytics.totals.monthlyIncome * 12), detail: 'Annualized dividend estimate' },
            ].map((card) => (
              <div key={card.label} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{card.label}</p>
                <p className="mt-3 text-2xl font-semibold text-white">{card.value}</p>
                <p className="mt-2 text-sm text-slate-400">{card.detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Top Movers" subtitle="Best performing names in the local market snapshot.">
          <div className="space-y-3">
            {leaders.map((stock) => (
              <div key={stock.symbol} className="flex items-center justify-between rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-4">
                <div>
                  <p className="font-medium text-white">{stock.symbol}</p>
                  <p className="text-sm text-slate-400">{stock.name}</p>
                </div>
                <div className="flex items-center gap-2 text-emerald-300">
                  <TrendingUp className="h-4 w-4" />
                  <span>{formatPercent(stock.day_change_percent)}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Pressure List" subtitle="Names cooling off in the same snapshot universe.">
          <div className="space-y-3">
            {laggards.map((stock) => (
              <div key={stock.symbol} className="flex items-center justify-between rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-4">
                <div>
                  <p className="font-medium text-white">{stock.symbol}</p>
                  <p className="text-sm text-slate-400">{stock.name}</p>
                </div>
                <div className="flex items-center gap-2 text-rose-300">
                  <TrendingDown className="h-4 w-4" />
                  <span>{formatPercent(stock.day_change_percent)}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="What to do next" subtitle="Simple operating checklist for this portfolio.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Bell,
              title: 'Review near-target watchlist names',
              text: watchlistInsights.some((item) => item.status === 'Buy zone' || item.status === 'Near target')
                ? 'At least one watchlist name is in or near your preferred buy zone.'
                : 'No watchlist names are near target right now, so patience is okay.',
            },
            {
              icon: ArrowUpRight,
              title: 'Trim concentration if needed',
              text: analytics.rebalanceIdeas[0]?.reason || 'Portfolio concentration looks manageable at the moment.',
            },
            {
              icon: TrendingUp,
              title: 'Protect your winners',
              text: analytics.topWinner
                ? `${analytics.topWinner.symbol} leads performance at ${formatPercent(analytics.topWinner.pnlPercent)}. Decide whether to let it run or rebalance.`
                : 'No winner identified yet because the portfolio is empty.',
            },
          ].map((item) => (
            <div key={item.title} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
              <item.icon className="h-5 w-5 text-amber-300" />
              <p className="mt-4 font-medium text-white">{item.title}</p>
              <p className="mt-2 text-sm text-slate-400">{item.text}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
