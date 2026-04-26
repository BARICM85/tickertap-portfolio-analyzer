import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Brain, FlaskConical, Loader2, Newspaper, RefreshCw, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { runPortfolioBacktest } from '@/lib/brokerClient';
import { formatCurrency, formatPercent } from '@/lib/portfolioAnalytics';

function StatPill({ label, value, tone = 'slate' }) {
  const palette = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${palette[tone] || palette.slate}`}>
      <p className="text-[10px] uppercase tracking-[0.24em] opacity-70">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function PerformanceBar({ value }) {
  const numeric = Number(value || 0);
  const width = Math.min(Math.abs(numeric), 100);
  const tone = numeric >= 0 ? 'bg-emerald-400' : 'bg-rose-400';

  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className={`min-w-16 text-right text-sm font-medium ${numeric >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
        {formatPercent(numeric)}
      </span>
    </div>
  );
}

export default function BacktestSection({ stocks = [] }) {
  const holdings = stocks.filter((stock) => stock?.symbol).slice(0, 12);
  const backtestQuery = useQuery({
    queryKey: ['portfolio-backtest', holdings.map((stock) => `${stock.id || stock.symbol}`).join('|')],
    queryFn: () => runPortfolioBacktest({
      holdings,
      range: '2y',
    }),
    enabled: holdings.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const data = backtestQuery.data;
  const items = data?.items || [];
  const successfulItems = items.filter((item) => !item.error);
  const erroredItems = items.filter((item) => item.error);
  const sortedItems = [...successfulItems].sort((left, right) => Number(right.strategyReturnPercent || 0) - Number(left.strategyReturnPercent || 0));

  const getHostLabel = (value = '') => {
    try {
      return new URL(value).hostname.replace(/^www\./i, '');
    } catch {
      return value;
    }
  };

  if (!holdings.length) {
    return (
      <section className="app-panel rounded-[32px] p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-600">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Per-stock Backtests</h2>
            <p className="mt-1 text-sm text-slate-500">Add holdings to run the backtest lane one symbol at a time.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="app-panel rounded-[32px] p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-orange-500 p-2 text-white">
              <FlaskConical className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Per-stock Backtests</h2>
              <p className="mt-1 text-sm text-slate-500">
                Runs each holding through a sequential long-only backtest and shows what held up, what lagged, and where the model is unsure.
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => backtestQuery.refetch()}
          disabled={backtestQuery.isFetching}
          className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={backtestQuery.isFetching ? 'animate-spin' : ''} />
          {backtestQuery.isFetching ? 'Backtesting' : 'Refresh backtests'}
        </Button>
      </div>

      {backtestQuery.isLoading ? (
        <div className="mt-6 flex items-center gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-5 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          Loading history and simulating each stock one by one...
        </div>
      ) : backtestQuery.isError ? (
        <div className="mt-6 rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-5 text-rose-700">
          Backtest data is unavailable right now. The holdings view still works, but the history feed or backtest endpoint needs attention.
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatPill
              label="Portfolio Strategy Return"
              value={formatPercent(data?.summary?.portfolioStrategyReturnPercent || 0)}
              tone={(data?.summary?.portfolioStrategyReturnPercent || 0) >= 0 ? 'emerald' : 'rose'}
            />
            <StatPill
              label="Average Stock Return"
              value={formatPercent(data?.summary?.averageStrategyReturnPercent || 0)}
              tone={(data?.summary?.averageStrategyReturnPercent || 0) >= 0 ? 'emerald' : 'rose'}
            />
            <StatPill
              label="Win Rate"
              value={formatPercent(data?.summary?.winRatePercent || 0)}
              tone="cyan"
            />
            <StatPill
              label="Max Drawdown"
              value={formatPercent(-(Math.abs(data?.summary?.maxDrawdownPercent || 0)))}
              tone="amber"
            />
          </div>

          <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Integration state</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className={`rounded-full border px-3 py-1 text-xs font-medium ${data?.integrations?.ollama ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                    {data?.integrations?.ollama ? 'Ollama configured' : 'Ollama not configured'}
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-xs font-medium ${data?.integrations?.firecrawl ? 'border-cyan-200 bg-cyan-50 text-cyan-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                    {data?.integrations?.firecrawl ? 'Firecrawl configured' : 'Firecrawl not configured'}
                  </div>
                  <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                    Engine {data?.integrations?.engine || 'sma-js'}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-white bg-white px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Best</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{data?.summary?.bestSymbol || '--'}</p>
                </div>
                <div className="rounded-2xl border border-white bg-white px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Worst</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{data?.summary?.worstSymbol || '--'}</p>
                </div>
                <div className="rounded-2xl border border-white bg-white px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Symbols</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{items.length}</p>
                </div>
              </div>
            </div>

            {data?.summary?.aiSummary ? (
              <div className="mt-4 flex gap-3 rounded-[22px] border border-cyan-200 bg-cyan-50 px-4 py-4 text-cyan-900">
                <Brain className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="text-sm leading-6">{data.summary.aiSummary}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 space-y-3">
            {sortedItems.map((item) => (
              <div key={`${item.symbol}-${item.exchange || 'NSE'}`} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-lg font-semibold text-slate-900">{item.symbol}</p>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {item.exchange || 'NSE'}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${item.strategyReturnPercent >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {item.strategyReturnPercent >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {formatPercent(item.strategyReturnPercent || 0)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{item.name || 'Unnamed holding'}</p>
                    {item.newsContext?.items?.length ? (
                      <div className="mt-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-cyan-950">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-cyan-700">
                          <Newspaper className="h-4 w-4" />
                          <span>News / context</span>
                        </div>
                        {item.newsContext.summary ? (
                          <p className="mt-3 text-sm leading-6 text-cyan-950/90">{item.newsContext.summary}</p>
                        ) : null}
                        <div className="mt-3 space-y-2">
                          {item.newsContext.items.slice(0, 3).map((newsItem) => (
                            <a
                              key={`${newsItem.title || newsItem.url}`}
                              href={newsItem.url || '#'}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-2xl border border-cyan-100 bg-white/80 px-3 py-2 transition hover:bg-white"
                            >
                              <p className="text-sm font-medium text-cyan-950">{newsItem.title || newsItem.description || 'Untitled result'}</p>
                              <p className="mt-1 text-xs text-cyan-700">
                                {newsItem.description || 'Firecrawl result'}
                                {newsItem.url ? ` · ${getHostLabel(newsItem.url)}` : ''}
                              </p>
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {item.aiSummary ? (
                      <div className="mt-3 flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                        <p>{item.aiSummary}</p>
                      </div>
                    ) : item.error ? (
                      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {item.error}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[420px] xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Backtest return</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{formatPercent(item.strategyReturnPercent || 0)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Buy & hold</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{formatPercent(item.buyHoldReturnPercent || 0)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Trades</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{item.trades || 0}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Max DD</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{formatPercent(-(Math.abs(item.maxDrawdownPercent || 0)))}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <PerformanceBar value={item.strategyReturnPercent || 0} />
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Last signal</p>
                    <p className="mt-2 font-medium text-slate-900">{item.lastSignal || 'HOLD'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Current price</p>
                    <p className="mt-2 font-medium text-slate-900">{formatCurrency(item.currentPrice || 0)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {erroredItems.length ? (
            <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
              {erroredItems.length} symbol{erroredItems.length === 1 ? '' : 's'} could not be backtested because the history feed was unavailable.
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
