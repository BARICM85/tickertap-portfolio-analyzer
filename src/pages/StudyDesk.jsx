import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  CandlestickChart,
  Crosshair,
  FolderKanban,
  Gauge,
  ListFilter,
  Loader2,
  MessageSquareText,
  Move3D,
  Plus,
  Radio,
  Ruler,
  Search,
  SlidersHorizontal,
  SquarePen,
  TrendingUp,
} from 'lucide-react';
import StockAutocompleteInput from '@/components/shared/StockAutocompleteInput';
import StudyDeskChart from '@/components/studydesk/StudyDeskChart';
import { base44 } from '@/api/base44Client';
import { getStockProfile } from '@/lib/marketData';
import { getLiveMarketHistory, getLiveMarketQuote, getZerodhaStatus } from '@/lib/brokerClient';
import { derivePortfolioAnalytics, formatCurrency, formatPercent } from '@/lib/portfolioAnalytics';

const LEFT_TOOLS = [
  { label: 'Crosshair', icon: Crosshair },
  { label: 'Trend Line', icon: Move3D },
  { label: 'Brush', icon: SquarePen },
  { label: 'Measure', icon: Ruler },
  { label: 'Indicators', icon: Activity },
  { label: 'Alerts', icon: AlertCircle },
];

const INTERVALS = ['1m', '5m', '15m', '1H', '4H', '1D', '1W', '1M'];
const RANGES = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', 'ALL'];

const RANGE_MAP = {
  '1D': '1d',
  '5D': '5d',
  '1M': '1mo',
  '3M': '3mo',
  '6M': '6mo',
  YTD: 'ytd',
  '1Y': '1y',
  ALL: 'all',
};

const INTERVAL_MAP = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1H': '1h',
  '4H': '3h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1mo',
};

function buildSideSymbols(holdings, activeSymbol) {
  return holdings.slice(0, 7).map((item) => ({
    symbol: item.symbol,
    name: item.name,
    change: item.day_change_percent ?? 0,
    active: item.symbol === activeSymbol,
  }));
}

function sourceLabel(source) {
  if (source === 'zerodha') return 'ZERODHA LIVE';
  if (source === 'yahoo') return 'MARKET FALLBACK';
  return 'CATALOG SNAPSHOT';
}

export default function StudyDesk() {
  const [symbolInput, setSymbolInput] = useState('MARUTI');
  const [interval, setInterval] = useState('1D');
  const [range, setRange] = useState('YTD');
  const [leftTool, setLeftTool] = useState('Crosshair');

  const activeSymbol = (symbolInput || 'MARUTI').toUpperCase();

  const { data: stocks = [] } = useQuery({
    queryKey: ['stocks'],
    queryFn: () => base44.entities.Stock.list('-created_date'),
  });

  const analytics = useMemo(() => derivePortfolioAnalytics(stocks), [stocks]);
  const profile = useMemo(() => getStockProfile(activeSymbol), [activeSymbol]);

  const { data: zerodhaStatus } = useQuery({
    queryKey: ['study-desk-zerodha-status'],
    queryFn: getZerodhaStatus,
    retry: false,
    staleTime: 15000,
  });

  const { data: liveQuote, isFetching: quoteLoading } = useQuery({
    queryKey: ['study-desk-quote', activeSymbol],
    queryFn: () => getLiveMarketQuote(activeSymbol),
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const { data: history, isFetching: historyLoading } = useQuery({
    queryKey: ['study-desk-history', activeSymbol, range, interval],
    queryFn: () => getLiveMarketHistory(activeSymbol, RANGE_MAP[range] || 'ytd', INTERVAL_MAP[interval] || '1d'),
    staleTime: 15000,
    refetchInterval: interval === '1D' || interval === '1W' || interval === '1M' ? 60000 : 30000,
  });

  const displayedPrice = liveQuote?.price ?? profile.current_price;
  const displayedChange = liveQuote?.changePercent ?? profile.day_change_percent;
  const displayedChangeAmount = liveQuote?.change ?? ((displayedPrice * displayedChange) / 100);
  const feedSource = liveQuote?.source || history?.source || 'catalog';

  const stock = useMemo(() => ({
    id: `study-${activeSymbol}`,
    symbol: activeSymbol,
    name: profile.name,
    exchange: profile.exchange,
    current_price: displayedPrice,
    day_change_percent: displayedChange,
    sector: profile.sector,
    pe_ratio: profile.pe_ratio,
    market_cap: profile.market_cap,
    beta: profile.beta,
  }), [activeSymbol, displayedChange, displayedPrice, profile]);

  const sideSymbols = useMemo(
    () => buildSideSymbols(analytics.holdings.length ? analytics.holdings : [stock], stock.symbol),
    [analytics.holdings, stock],
  );

  const liveStats = [
    {
      label: 'Price',
      value: formatCurrency(displayedPrice),
      tone: 'text-white',
    },
    {
      label: 'Today',
      value: `${displayedChangeAmount >= 0 ? '+' : ''}${formatCurrency(Math.abs(displayedChangeAmount)).replace('₹', '₹')}`,
      tone: displayedChangeAmount >= 0 ? 'text-emerald-300' : 'text-rose-300',
    },
    {
      label: 'Move',
      value: formatPercent(displayedChange, 2),
      tone: displayedChange >= 0 ? 'text-emerald-300' : 'text-rose-300',
    },
    {
      label: 'Feed',
      value: sourceLabel(feedSource),
      tone: 'text-cyan-200',
    },
  ];

  const studyBlocks = [
    { label: 'Broker link', value: zerodhaStatus?.connected ? 'Connected' : 'Standby', icon: Radio },
    { label: 'Candles loaded', value: String(history?.points?.length || 0), icon: CandlestickChart },
    { label: 'Active tool', value: leftTool, icon: SlidersHorizontal },
    { label: 'Layout', value: `${interval} / ${range}`, icon: Gauge },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-[32px] border border-white/8 bg-[#0b1017] p-3 shadow-[0_28px_90px_rgba(0,0,0,0.44)]">
        <div className="flex flex-col gap-3 border-b border-white/6 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-300">
                <CandlestickChart className="h-4 w-4" />
              </div>
              <div className="w-[250px]">
                <StockAutocompleteInput
                  value={symbolInput}
                  onChange={setSymbolInput}
                  onSelect={(item) => setSymbolInput(item.symbol)}
                  placeholder="Search symbol or company"
                  className="h-11 rounded-full border-white/8 bg-[#111722]"
                />
              </div>
              <button type="button" className="rounded-full border border-white/10 bg-[#111722] px-3 py-2 text-sm text-white">
                NSE
              </button>
              <button type="button" className="rounded-full border border-white/10 bg-[#111722] px-3 py-2 text-sm text-white">
                {interval}
              </button>
              <button type="button" className="rounded-full border border-white/10 bg-[#111722] px-3 py-2 text-sm text-white">
                Indicators
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-semibold tracking-[0.18em] text-cyan-100">
                {sourceLabel(feedSource)}
              </span>
              <span className={`rounded-full border px-3 py-2 text-xs font-semibold tracking-[0.18em] ${
                zerodhaStatus?.connected ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/20 bg-amber-300/10 text-amber-100'
              }`}>
                {zerodhaStatus?.connected ? 'BROKER LIVE' : 'BROKER STANDBY'}
              </span>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            {liveStats.map((item) => (
              <div key={item.label} className="rounded-[20px] border border-white/8 bg-[#111722] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{item.label}</p>
                <p className={`mt-2 text-lg font-semibold ${item.tone}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 pt-3 xl:grid-cols-[58px_minmax(0,1fr)_320px]">
          <aside className="rounded-[26px] border border-white/8 bg-[#0f141d] p-2">
            <div className="flex flex-col gap-2">
              {LEFT_TOOLS.map((tool) => (
                <button
                  key={tool.label}
                  type="button"
                  onClick={() => setLeftTool(tool.label)}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border text-slate-300 transition ${
                    leftTool === tool.label
                      ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100'
                      : 'border-white/6 bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                  title={tool.label}
                >
                  <tool.icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </aside>

          <div className="rounded-[30px] border border-white/8 bg-[#0f141d] p-3">
            <div className="mb-3 flex flex-col gap-3 border-b border-white/6 pb-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-semibold text-white">{stock.name}</h1>
                  <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs uppercase tracking-[0.18em] text-slate-300">
                    {stock.exchange}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  {stock.symbol} | {stock.sector} | Beta {stock.beta.toFixed(2)} | PE {stock.pe_ratio.toFixed(1)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {INTERVALS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setInterval(item)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                      interval === item
                        ? 'border-amber-300/40 bg-amber-300/15 text-amber-100'
                        : 'border-white/10 bg-white/[0.03] text-slate-300'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <StudyDeskChart stock={stock} history={history} loading={historyLoading} />

            <div className="mt-3 flex flex-col gap-3 rounded-[22px] border border-white/8 bg-[#111722] px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {RANGES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setRange(item)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      range === item ? 'bg-cyan-300/15 text-cyan-100' : 'bg-white/[0.04] text-slate-300'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="inline-flex items-center gap-2">
                  {(quoteLoading || historyLoading) ? <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" /> : <TrendingUp className="h-3.5 w-3.5 text-cyan-300" />}
                  {quoteLoading || historyLoading ? 'Refreshing live market feed...' : 'Live feed active'}
                </span>
                <span>{history?.points?.length || 0} candles</span>
                <span>{sourceLabel(feedSource)}</span>
              </div>
            </div>
          </div>

          <aside className="rounded-[30px] border border-white/8 bg-[#0f141d] p-3">
            <div className="flex items-center justify-between border-b border-white/6 pb-3">
              <div className="flex items-center gap-2 text-white">
                <FolderKanban className="h-4 w-4 text-cyan-300" />
                <p className="font-medium">Study Panel</p>
              </div>
              <button type="button" className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">
                Layout
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <div className="rounded-[22px] border border-white/8 bg-[#111722] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">{stock.symbol}</p>
                  <span className="text-xs text-slate-500">{stock.exchange}</span>
                </div>
                <p className="mt-3 text-4xl font-semibold text-white">{formatCurrency(displayedPrice).replace('.00', '')}</p>
                <p className={`mt-2 text-sm ${displayedChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {formatPercent(displayedChange, 2)} today
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <div className="rounded-xl bg-white/[0.03] p-2">
                    Market Cap
                    <span className="block pt-1 text-sm text-white">{stock.market_cap}</span>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] p-2">
                    Sector
                    <span className="block pt-1 text-sm text-white">{stock.sector}</span>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] p-2">
                    Tool
                    <span className="block pt-1 text-sm text-cyan-200">{leftTool}</span>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] p-2">
                    Broker
                    <span className="block pt-1 text-sm text-white">{zerodhaStatus?.connected ? 'Connected' : 'Standby'}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-[#111722] p-3">
                <p className="text-sm font-medium text-white">Live Study Blocks</p>
                <div className="mt-3 grid gap-2">
                  {studyBlocks.map((item) => (
                    <div key={item.label} className="flex items-center gap-3 rounded-[14px] border border-white/6 bg-white/[0.03] px-3 py-2">
                      <item.icon className="h-4 w-4 text-amber-300" />
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                        <p className="text-sm text-slate-200">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-[#111722] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">Watch / Study List</p>
                  <button type="button" className="rounded-full border border-white/10 bg-white/[0.03] p-1.5 text-slate-300">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-2">
                  {sideSymbols.map((item) => (
                    <button
                      key={item.symbol}
                      type="button"
                      onClick={() => setSymbolInput(item.symbol)}
                      className={`flex w-full items-center justify-between rounded-[16px] border px-3 py-2 text-left ${
                        item.active ? 'border-cyan-300/30 bg-cyan-300/10' : 'border-white/8 bg-white/[0.03]'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-white">{item.symbol}</p>
                        <p className="text-xs text-slate-500">{item.name}</p>
                      </div>
                      <div className={`text-sm font-medium ${item.change >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {formatPercent(item.change, 2)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-[#111722] p-3">
                <p className="text-sm font-medium text-white">Study Components</p>
                <div className="mt-3 grid gap-2">
                  {[
                    { label: 'Live symbol search', icon: Search },
                    { label: 'Zerodha-ready quote + history feed', icon: Radio },
                    { label: 'Candle, volume, RSI, MACD panes', icon: Gauge },
                    { label: 'Left drawing and study rail', icon: SlidersHorizontal },
                    { label: 'Watchlist driven from holdings', icon: ListFilter },
                    { label: 'Notes and thesis panel next', icon: MessageSquareText },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3 rounded-[14px] border border-white/6 bg-white/[0.03] px-3 py-2">
                      <item.icon className="h-4 w-4 text-amber-300" />
                      <span className="text-sm text-slate-300">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
