import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertCircle, CandlestickChart, Crosshair, FolderKanban, Gauge, ListFilter, MessageSquareText, Move3D, Plus, Ruler, Search, SlidersHorizontal, SquarePen } from 'lucide-react';
import StockAutocompleteInput from '@/components/shared/StockAutocompleteInput';
import StudyDeskChart from '@/components/studydesk/StudyDeskChart';
import { base44 } from '@/api/base44Client';
import { getStockProfile } from '@/lib/marketData';
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

function buildSideSymbols(holdings, activeSymbol) {
  return holdings.slice(0, 5).map((item) => ({
    symbol: item.symbol,
    name: item.name,
    change: item.day_change_percent ?? 0,
    active: item.symbol === activeSymbol,
  }));
}

export default function StudyDesk() {
  const [symbolInput, setSymbolInput] = useState('MARUTI');
  const [interval, setInterval] = useState('1D');
  const [range, setRange] = useState('YTD');
  const [leftTool, setLeftTool] = useState('Crosshair');

  const { data: stocks = [] } = useQuery({
    queryKey: ['stocks'],
    queryFn: () => base44.entities.Stock.list('-created_date'),
  });

  const analytics = derivePortfolioAnalytics(stocks);
  const profile = useMemo(() => getStockProfile(symbolInput || 'MARUTI'), [symbolInput]);
  const stock = useMemo(() => ({
    id: `study-${symbolInput}`,
    symbol: (symbolInput || 'MARUTI').toUpperCase(),
    name: profile.name,
    exchange: profile.exchange,
    current_price: profile.current_price,
    day_change_percent: profile.day_change_percent,
    sector: profile.sector,
    pe_ratio: profile.pe_ratio,
    market_cap: profile.market_cap,
    beta: profile.beta,
  }), [profile, symbolInput]);

  const sideSymbols = useMemo(() => buildSideSymbols(analytics.holdings.length ? analytics.holdings : [stock], stock.symbol), [analytics.holdings, stock]);

  return (
    <div className="space-y-4">
      <section className="rounded-[30px] border border-white/8 bg-[#0d1118]/95 p-3 shadow-[0_30px_80px_rgba(0,0,0,0.38)]">
        <div className="flex flex-col gap-3 border-b border-white/6 pb-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full bg-white/5 px-2.5 py-2 text-slate-300">
              <CandlestickChart className="h-4 w-4" />
            </div>
            <div className="w-[220px]">
              <StockAutocompleteInput
                value={symbolInput}
                onChange={setSymbolInput}
                onSelect={(item) => setSymbolInput(item.symbol)}
                placeholder="Symbol"
                className="h-10 rounded-full border-white/8 bg-[#131722]"
              />
            </div>
            <button type="button" className="rounded-full border border-white/10 bg-[#131722] px-3 py-2 text-sm text-white">NSE</button>
            <button type="button" className="rounded-full border border-white/10 bg-[#131722] px-3 py-2 text-sm text-white">{interval}</button>
            <button type="button" className="rounded-full border border-white/10 bg-[#131722] px-3 py-2 text-sm text-white">Indicators</button>
            <button type="button" className="rounded-full border border-white/10 bg-[#131722] px-3 py-2 text-sm text-white">Alert</button>
            <button type="button" className="rounded-full border border-white/10 bg-[#131722] px-3 py-2 text-sm text-white">Replay</button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200">Trade</button>
            <button type="button" className="rounded-full border border-white/10 bg-white text-sm font-medium text-slate-950 px-4 py-2">Publish</button>
          </div>
        </div>

        <div className="grid gap-3 pt-3 xl:grid-cols-[50px_minmax(0,1fr)_300px]">
          <aside className="rounded-[24px] border border-white/8 bg-[#10151f] p-2">
            <div className="flex flex-col gap-2">
              {LEFT_TOOLS.map((tool) => (
                <button
                  key={tool.label}
                  type="button"
                  onClick={() => setLeftTool(tool.label)}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border text-slate-300 transition ${
                    leftTool === tool.label ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100' : 'border-white/6 bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                  title={tool.label}
                >
                  <tool.icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </aside>

          <div className="rounded-[28px] border border-white/8 bg-[#10151f] p-3">
            <div className="mb-3 flex flex-col gap-3 border-b border-white/6 pb-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold text-white">{stock.name}</h1>
                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs uppercase tracking-[0.18em] text-slate-300">{stock.exchange}</span>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  {stock.symbol} · {formatCurrency(stock.current_price)} · <span className={stock.day_change_percent >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{formatPercent(stock.day_change_percent)}</span>
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {INTERVALS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setInterval(item)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${interval === item ? 'border-amber-300/40 bg-amber-300/15 text-amber-100' : 'border-white/10 bg-white/[0.03] text-slate-300'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <StudyDeskChart stock={stock} />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-white/8 bg-[#131722] px-3 py-2">
              <div className="flex flex-wrap gap-2">
                {RANGES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setRange(item)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${range === item ? 'bg-cyan-300/15 text-cyan-100' : 'bg-white/[0.04] text-slate-300'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="text-xs text-slate-500">Theme workspace only for now. Zerodha live feed can plug into this next.</div>
            </div>
          </div>

          <aside className="rounded-[28px] border border-white/8 bg-[#10151f] p-3">
            <div className="flex items-center justify-between border-b border-white/6 pb-3">
              <div className="flex items-center gap-2 text-white">
                <FolderKanban className="h-4 w-4 text-cyan-300" />
                <p className="font-medium">Study Panel</p>
              </div>
              <button type="button" className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">Layout</button>
            </div>

            <div className="mt-3 space-y-3">
              <div className="rounded-[22px] border border-white/8 bg-[#131722] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">{stock.symbol}</p>
                  <span className="text-xs text-slate-500">{stock.exchange}</span>
                </div>
                <p className="mt-3 text-4xl font-semibold text-white">{formatCurrency(stock.current_price).replace('.00', '')}</p>
                <p className={`mt-2 text-sm ${stock.day_change_percent >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatPercent(stock.day_change_percent)} today</p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <div className="rounded-xl bg-white/[0.03] p-2">Beta <span className="block pt-1 text-sm text-white">{stock.beta.toFixed(2)}</span></div>
                  <div className="rounded-xl bg-white/[0.03] p-2">P/E <span className="block pt-1 text-sm text-white">{stock.pe_ratio.toFixed(1)}</span></div>
                  <div className="rounded-xl bg-white/[0.03] p-2">MCap <span className="block pt-1 text-sm text-white">{stock.market_cap}</span></div>
                  <div className="rounded-xl bg-white/[0.03] p-2">Tool <span className="block pt-1 text-sm text-cyan-200">{leftTool}</span></div>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-[#131722] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">Watch / Study List</p>
                  <button type="button" className="rounded-full border border-white/10 bg-white/[0.03] p-1.5 text-slate-300"><Plus className="h-3.5 w-3.5" /></button>
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
                      <div className={`text-sm font-medium ${item.change >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatPercent(item.change, 2)}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-[#131722] p-3">
                <p className="text-sm font-medium text-white">Study Components</p>
                <div className="mt-3 grid gap-2">
                  {[
                    { label: 'Symbol search', icon: Search },
                    { label: 'Interval and range bar', icon: Gauge },
                    { label: 'Left drawing rail', icon: SlidersHorizontal },
                    { label: 'Indicator shelf', icon: Activity },
                    { label: 'Watchlist panel', icon: ListFilter },
                    { label: 'Notes / thesis panel', icon: MessageSquareText },
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
