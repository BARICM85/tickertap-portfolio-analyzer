import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Bot, Cable, Cpu, Play, RefreshCw, Rocket, ShieldCheck, Square, Waves } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALGO_ARCHITECTURE_BLOCKS, ALGO_STRATEGY_TEMPLATES, backtestStrategy, createAlgoStrategyDraft } from '@/lib/algoTrading';
import { getBrokerApiBase, getZerodhaRedirectUrl, getZerodhaStatus, getLiveMarketHistory } from '@/lib/brokerClient';
import { formatCurrency } from '@/lib/portfolioAnalytics';

function Section({ title, subtitle, action, children }) {
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

function ReadinessCard({ label, value, note, tone = 'slate' }) {
  const toneClasses = {
    emerald: 'text-emerald-200 bg-emerald-400/12 border-emerald-400/20',
    amber: 'text-amber-200 bg-amber-300/12 border-amber-300/20',
    cyan: 'text-cyan-200 bg-cyan-300/12 border-cyan-300/20',
    rose: 'text-rose-200 bg-rose-400/12 border-rose-400/20',
    slate: 'text-slate-200 bg-white/[0.03] border-white/8',
  };

  return (
    <div className={`rounded-[24px] border p-4 ${toneClasses[tone] || toneClasses.slate}`}>
      <p className="text-xs uppercase tracking-[0.22em] opacity-70">{label}</p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-sm opacity-80">{note}</p>
    </div>
  );
}

function StrategyMetric({ label, value, note }) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 text-xl font-semibold text-white">{value}</p>
      {note ? <p className="mt-2 text-sm text-slate-400">{note}</p> : null}
    </div>
  );
}

function defaultTemplateParams(templateId) {
  return { ...(ALGO_STRATEGY_TEMPLATES.find((item) => item.id === templateId)?.defaultParams || {}) };
}

function formatPercent(value) {
  if (!Number.isFinite(Number(value))) return '--';
  const numeric = Number(value);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}%`;
}

export default function AlgoTrading() {
  const queryClient = useQueryClient();
  const brokerApiBase = getBrokerApiBase();
  const redirectUrl = getZerodhaRedirectUrl();
  const [createOpen, setCreateOpen] = useState(false);
  const [runningId, setRunningId] = useState(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState(null);
  const [draft, setDraft] = useState(() => createAlgoStrategyDraft());

  const { data: stocks = [] } = useQuery({
    queryKey: ['stocks'],
    queryFn: () => base44.entities.Stock.list('-created_date'),
  });
  const { data: strategies = [] } = useQuery({
    queryKey: ['algo-strategies'],
    queryFn: () => base44.entities.AlgoStrategy.list('-created_date'),
  });
  const { data: runs = [] } = useQuery({
    queryKey: ['algo-runs'],
    queryFn: () => base44.entities.AlgoRun.list('-created_date'),
  });
  const { data: zerodhaStatus } = useQuery({
    queryKey: ['algo-zerodha-status'],
    queryFn: getZerodhaStatus,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!selectedStrategyId && strategies[0]?.id) {
      setSelectedStrategyId(strategies[0].id);
    }
  }, [selectedStrategyId, strategies]);

  const selectedStrategy = useMemo(
    () => strategies.find((item) => item.id === selectedStrategyId) || strategies[0] || null,
    [selectedStrategyId, strategies],
  );
  const selectedRuns = useMemo(
    () => runs.filter((item) => item.strategy_id === selectedStrategy?.id),
    [runs, selectedStrategy?.id],
  );
  const latestRun = selectedRuns[0] || null;
  const knownSymbols = useMemo(
    () => [...new Set(stocks.map((item) => item.symbol).filter(Boolean))].sort(),
    [stocks],
  );

  const createStrategy = async () => {
    try {
      const payload = {
        ...draft,
        symbol: String(draft.symbol || '').trim().toUpperCase(),
        capital: Number(draft.capital || 100000),
        risk_percent: Number(draft.risk_percent || 1),
        params: { ...draft.params },
      };
      if (!payload.name || !payload.symbol) {
        toast.error('Strategy name and symbol are required.');
        return;
      }
      await base44.entities.AlgoStrategy.create(payload);
      await queryClient.invalidateQueries({ queryKey: ['algo-strategies'] });
      setCreateOpen(false);
      setDraft(createAlgoStrategyDraft());
      toast.success('Algo strategy created.');
    } catch (error) {
      toast.error(error.message || 'Unable to create strategy.');
    }
  };

  const updateStrategyStatus = async (strategy, status) => {
    await base44.entities.AlgoStrategy.update(strategy.id, { status });
    await queryClient.invalidateQueries({ queryKey: ['algo-strategies'] });
    toast.success(`${strategy.name} is now ${status}.`);
  };

  const runBacktest = async (strategy) => {
    setRunningId(strategy.id);
    try {
      const history = await getLiveMarketHistory(strategy.symbol, strategy.range || '1y', strategy.interval || '1d');
      const result = backtestStrategy(strategy, history.points || []);
      await base44.entities.AlgoRun.create({
        strategy_id: strategy.id,
        strategy_name: strategy.name,
        symbol: strategy.symbol,
        mode: strategy.mode,
        interval: strategy.interval,
        range: strategy.range,
        source: history.source || 'broker',
        summary: result.summary,
        trades: result.trades.slice(-12),
      });
      await queryClient.invalidateQueries({ queryKey: ['algo-runs'] });
      setSelectedStrategyId(strategy.id);
      toast.success(`${strategy.name} backtest completed.`);
    } catch (error) {
      toast.error(error.message || 'Backtest failed.');
    } finally {
      setRunningId(null);
    }
  };

  const templateLabel = ALGO_STRATEGY_TEMPLATES.find((item) => item.id === selectedStrategy?.template_id)?.name || 'Strategy';
  const connected = Boolean(zerodhaStatus?.connected);
  const configured = Boolean(zerodhaStatus?.configured);

  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-white/10 bg-[linear-gradient(135deg,rgba(34,211,238,0.18),rgba(245,158,11,0.16)_48%,rgba(15,23,42,0.96))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">Mini Algo Trading System</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Algo Trading</h1>
            <p className="mt-3 text-base leading-7 text-slate-100/90">
              Architecture-first trading workspace built around Zerodha Kite Connect: broker auth on the backend, event-driven strategy logic, risk gating, and paper/live execution readiness in one operator screen.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Badge className={`rounded-full px-4 py-2 text-sm ${connected ? 'bg-emerald-400/15 text-emerald-100' : 'bg-white/10 text-slate-200'}`}>
              {connected ? 'Broker connected' : 'Broker standby'}
            </Badge>
            <Badge className="rounded-full bg-cyan-300/15 px-4 py-2 text-sm text-cyan-100">
              Backend {brokerApiBase || 'not set'}
            </Badge>
          </div>
        </div>
      </section>

      <Section title="Reference Architecture" subtitle="Mapped from Zerodha’s remote-backend requirement and event-driven trading-system patterns.">
        <div className="grid gap-4 xl:grid-cols-5">
          {ALGO_ARCHITECTURE_BLOCKS.map((block, index) => (
            <div key={block.title} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">Stage {index + 1}</p>
              <h3 className="mt-2 text-lg font-semibold text-white">{block.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{block.subtitle}</p>
              <div className="mt-4 space-y-2 text-sm text-slate-300">
                {block.points.map((point) => (
                  <p key={point}>• {point}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-400">
          <a className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 hover:bg-white/[0.06] hover:text-white" href="https://kite.trade/docs/connect/v3/" target="_blank" rel="noreferrer">
            Zerodha Kite Connect docs
          </a>
          <a className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 hover:bg-white/[0.06] hover:text-white" href="https://aws.amazon.com/event-driven-architecture/" target="_blank" rel="noreferrer">
            AWS event-driven architecture
          </a>
        </div>
      </Section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Section title="System Readiness" subtitle="Broker, backend, and operating guardrails before any strategy runs.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ReadinessCard
              label="Broker Auth"
              value={connected ? 'Connected' : configured ? 'Ready to connect' : 'Missing config'}
              note={connected ? 'Kite session available for execution data.' : configured ? 'Credentials exist but user session is not active.' : 'Set Zerodha credentials on backend first.'}
              tone={connected ? 'emerald' : configured ? 'amber' : 'rose'}
            />
            <ReadinessCard
              label="Callback Route"
              value={connected ? 'Healthy' : 'Configured'}
              note={redirectUrl}
              tone="cyan"
            />
            <ReadinessCard
              label="Execution Mode"
              value="Paper-first"
              note="Strategies can be drafted, backtested, and promoted to live-ready status after broker/risk checks."
              tone="slate"
            />
            <ReadinessCard
              label="Risk Gate"
              value="Mandatory"
              note="Every strategy carries capital and risk-per-trade limits before execution intent."
              tone="amber"
            />
            <ReadinessCard
              label="Strategy Runtime"
              value={`${strategies.length} loaded`}
              note="Saved strategies sync into the same operator view across web and Android."
              tone="slate"
            />
            <ReadinessCard
              label="Observability"
              value={`${runs.length} runs`}
              note="Each run stores summary metrics and recent trades for audit and tuning."
              tone="slate"
            />
          </div>
        </Section>

        <Section
          title="Create Strategy"
          subtitle="Persist a paper/live-ready strategy configuration."
          action={(
            <Button onClick={() => setCreateOpen(true)} className="rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200">
              <Bot className="h-4 w-4" />
              New Strategy
            </Button>
          )}
        >
          <div className="grid gap-3 md:grid-cols-3">
            {ALGO_STRATEGY_TEMPLATES.map((template) => (
              <div key={template.id} className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">{template.name}</p>
                <p className="mt-2 text-sm text-slate-400">{template.summary}</p>
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-cyan-300">{template.architectureRole}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Strategy Control Board" subtitle="Draft, activate, and backtest each strategy against Zerodha-backed history.">
        {strategies.length ? (
          <div className="grid gap-4 xl:grid-cols-3">
            {strategies.map((strategy) => {
              const isSelected = strategy.id === selectedStrategy?.id;
              const strategyTemplate = ALGO_STRATEGY_TEMPLATES.find((item) => item.id === strategy.template_id);
              return (
                <button
                  key={strategy.id}
                  type="button"
                  onClick={() => setSelectedStrategyId(strategy.id)}
                  className={`rounded-[24px] border p-5 text-left transition ${isSelected ? 'border-cyan-300/40 bg-cyan-300/10' : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-white">{strategy.name}</p>
                      <p className="mt-1 text-sm text-slate-400">{strategy.symbol} • {strategy.interval?.toUpperCase()} • {strategy.range?.toUpperCase()}</p>
                    </div>
                    <Badge className={`rounded-full ${strategy.mode === 'live' ? 'bg-rose-400/15 text-rose-100' : 'bg-emerald-400/15 text-emerald-100'}`}>
                      {strategy.mode}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">{strategyTemplate?.summary || strategy.notes}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
                    <span className="rounded-full border border-white/8 bg-black/20 px-3 py-1">Capital {formatCurrency(strategy.capital || 0)}</span>
                    <span className="rounded-full border border-white/8 bg-black/20 px-3 py-1">Risk {strategy.risk_percent}%</span>
                    <span className="rounded-full border border-white/8 bg-black/20 px-3 py-1">{strategy.status}</span>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void runBacktest(strategy);
                      }}
                      disabled={runningId === strategy.id}
                      className="rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                    >
                      {runningId === strategy.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      Backtest
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        void updateStrategyStatus(strategy, strategy.status === 'active' ? 'paused' : 'active');
                      }}
                      className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10"
                    >
                      {strategy.status === 'active' ? <Square className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
                      {strategy.status === 'active' ? 'Pause' : 'Activate'}
                    </Button>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center text-slate-400">
            No algo strategies yet. Create one from a template to start paper testing.
          </div>
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Section title="Selected Strategy Metrics" subtitle={selectedStrategy ? `${selectedStrategy.name} • ${templateLabel}` : 'Pick a strategy from the control board.'}>
          {selectedStrategy ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <StrategyMetric label="Template" value={templateLabel} note={selectedStrategy.notes} />
                <StrategyMetric label="Capital" value={formatCurrency(selectedStrategy.capital || 0)} note={`Risk per trade ${selectedStrategy.risk_percent}%`} />
                <StrategyMetric label="Broker Mode" value={selectedStrategy.mode} note={connected ? 'Broker session is available.' : 'Keep this in paper mode until broker is connected.'} />
                <StrategyMetric label="Trades" value={latestRun ? String(latestRun.summary?.tradeCount || 0) : '--'} note="From the latest recorded backtest" />
                <StrategyMetric label="Net Return" value={latestRun ? formatPercent(latestRun.summary?.totalReturnPercent || 0) : '--'} note={latestRun ? `${formatCurrency(latestRun.summary?.startCapital || 0)} → ${formatCurrency(latestRun.summary?.endCapital || 0)}` : 'Run a backtest to populate'} />
                <StrategyMetric label="Max Drawdown" value={latestRun ? formatPercent(-(latestRun.summary?.maxDrawdownPercent || 0)) : '--'} note={latestRun ? `Win rate ${formatPercent(latestRun.summary?.winRate || 0)}` : 'Drawdown from the equity curve'} />
              </div>

              <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                <p className="text-sm font-medium text-white">Execution settings</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {Object.entries(selectedStrategy.params || {}).map(([key, value]) => (
                    <div key={key} className="rounded-2xl border border-white/8 bg-[#111c2c] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{key}</p>
                      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center text-slate-400">
              Select a strategy to inspect metrics and execution settings.
            </div>
          )}
        </Section>

        <Section title="Run Journal" subtitle="Most recent trades and operator notes for the selected strategy.">
          {latestRun ? (
            <div className="space-y-3">
              <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="rounded-full bg-cyan-300/15 text-cyan-100">{latestRun.mode}</Badge>
                  <Badge className="rounded-full bg-white/10 text-slate-100">{latestRun.source}</Badge>
                  <span className="text-sm text-slate-400">{latestRun.interval?.toUpperCase()} • {latestRun.range?.toUpperCase()}</span>
                </div>
                <p className="mt-3 text-sm text-slate-300">{latestRun.summary?.lastSignal || 'No recent signal'}</p>
              </div>
              {(latestRun.trades || []).length ? latestRun.trades.map((trade, index) => (
                <div key={`${trade.entryDate}-${trade.exitDate}-${index}`} className="rounded-[22px] border border-white/8 bg-[#111c2c] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-white">
                      {new Date(trade.entryDate).toLocaleDateString('en-IN')} → {new Date(trade.exitDate).toLocaleDateString('en-IN')}
                    </p>
                    <span className={`text-sm font-semibold ${trade.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    Entry {formatCurrency(trade.entryPrice)} • Exit {formatCurrency(trade.exitPrice)} • Return {formatPercent(trade.pnlPercent)}
                  </p>
                </div>
              )) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-6 text-center text-slate-400">
                  Latest run completed, but it did not generate any closed trades.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center text-slate-400">
              Run a backtest to create the first algo execution journal.
            </div>
          )}
        </Section>
      </div>

      <Section title="Operator Rules" subtitle="Guardrails carried from the architecture into this first build.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: ShieldCheck, title: 'Kill switch first', text: 'Live activation is separated from strategy creation so accidental execution is harder.' },
            { icon: Cpu, title: 'Event-driven core', text: 'Strategies are modeled as signal workers fed by broker history/ticks, not one giant loop.' },
            { icon: Waves, title: 'Data before action', text: 'Warm-up candles and benchmark history are fetched before a run is judged useful.' },
            { icon: Cable, title: 'Broker adapter boundary', text: 'Zerodha auth/status stays in a separate adapter layer from strategy logic.' },
          ].map((item) => (
            <div key={item.title} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
              <item.icon className="h-5 w-5 text-amber-300" />
              <p className="mt-4 font-medium text-white">{item.title}</p>
              <p className="mt-2 text-sm text-slate-400">{item.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="border-white/10 bg-[#0c1422] text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Algo Strategy</DialogTitle>
            <DialogDescription className="text-slate-400">
              Define the first version of a paper/live-ready strategy. It will use broker-backed history for backtests and can be promoted later.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-slate-300">Template</span>
              <Select
                value={draft.template_id}
                onValueChange={(value) => setDraft((current) => ({
                  ...current,
                  template_id: value,
                  params: defaultTemplateParams(value),
                  name: `${ALGO_STRATEGY_TEMPLATES.find((item) => item.id === value)?.name || 'Strategy'} Strategy`,
                  notes: ALGO_STRATEGY_TEMPLATES.find((item) => item.id === value)?.summary || current.notes,
                }))}
              >
                <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-white/5 text-white">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {ALGO_STRATEGY_TEMPLATES.map((template) => (
                    <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">Strategy Name</span>
              <Input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">Symbol</span>
              <Input
                list="algo-known-symbols"
                value={draft.symbol}
                onChange={(event) => setDraft((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))}
                className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
              />
              <datalist id="algo-known-symbols">
                {knownSymbols.map((symbol) => <option key={symbol} value={symbol} />)}
              </datalist>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">Mode</span>
              <Select value={draft.mode} onValueChange={(value) => setDraft((current) => ({ ...current, mode: value }))}>
                <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-white/5 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paper">paper</SelectItem>
                  <SelectItem value="live">live-ready</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">Interval</span>
              <Select value={draft.interval} onValueChange={(value) => setDraft((current) => ({ ...current, interval: value }))}>
                <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-white/5 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['5m', '15m', '1h', '1d'].map((value) => (
                    <SelectItem key={value} value={value}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">History Range</span>
              <Select value={draft.range} onValueChange={(value) => setDraft((current) => ({ ...current, range: value }))}>
                <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-white/5 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['3mo', '6mo', '1y', '3y', '5y'].map((value) => (
                    <SelectItem key={value} value={value}>{value.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">Capital</span>
              <Input
                type="number"
                value={draft.capital}
                onChange={(event) => setDraft((current) => ({ ...current, capital: event.target.value }))}
                className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-300">Risk % Per Trade</span>
              <Input
                type="number"
                step="0.1"
                value={draft.risk_percent}
                onChange={(event) => setDraft((current) => ({ ...current, risk_percent: event.target.value }))}
                className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(draft.params || {}).map(([key, value]) => (
              <label key={key} className="space-y-2">
                <span className="text-sm capitalize text-slate-300">{key}</span>
                <Input
                  type="number"
                  value={value}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    params: {
                      ...current.params,
                      [key]: Number(event.target.value),
                    },
                  }))}
                  className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                />
              </label>
            ))}
          </div>

          <label className="space-y-2">
            <span className="text-sm text-slate-300">Operator Notes</span>
            <Textarea
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              className="min-h-[110px] rounded-2xl border-white/10 bg-white/5 text-white"
            />
          </label>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
              Cancel
            </Button>
            <Button onClick={() => void createStrategy()} className="rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200">
              Save Strategy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
