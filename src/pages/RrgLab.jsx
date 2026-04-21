import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw, Waves } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getLiveMarketHistory, getZerodhaHoldings } from '@/lib/brokerClient';
import {
  buildRrgSnapshot,
  formatRrgSymbol,
  inspectRrgCoverage,
  quadrantTone,
  RRG_BENCHMARKS,
  RRG_DEFAULT_WATCHLISTS,
  RRG_UNIVERSES,
  toRrg100,
} from '@/lib/rrgLab';

function useRrgHistories({ benchmarkSymbol, symbols, range }) {
  const requestSymbols = useMemo(() => [benchmarkSymbol, ...symbols], [benchmarkSymbol, symbols]);

  return useQuery({
    queryKey: ['rrg-lab-history', benchmarkSymbol, requestSymbols, range],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const settled = await Promise.allSettled(
        requestSymbols.map(async (symbol) => {
          const payload = await getLiveMarketHistory(symbol, range, '1d');
          return [symbol, payload];
        }),
      );

      const historyMap = {};
      const failures = [];
      settled.forEach((entry, index) => {
        const symbol = requestSymbols[index];
        if (entry.status === 'fulfilled' && Array.isArray(entry.value?.points) && entry.value.points.length) {
          historyMap[symbol] = entry.value;
        } else {
          failures.push(symbol);
        }
      });

      return { historyMap, failures };
    },
  });
}

function formatRrgTooltipDate(dateLike) {
  try {
    return new Date(dateLike).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(dateLike || '');
  }
}

function RrgCanvas({ snapshot }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const viewBox = { width: 860, height: 560 };
  const center = 100;
  const span = 9;
  const xMin = center - span;
  const xMax = center + span;
  const yMin = center - span;
  const yMax = center + span;
  const pad = { top: 42, right: 34, bottom: 54, left: 58 };
  const plotWidth = viewBox.width - pad.left - pad.right;
  const plotHeight = viewBox.height - pad.top - pad.bottom;

  const scaleX = (value) => pad.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
  const scaleY = (value) => pad.top + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight;
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

  const ticks = Array.from({ length: 19 }, (_, index) => center - 9 + index);

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
      <svg viewBox={`0 0 ${viewBox.width} ${viewBox.height}`} className="h-auto w-full">
        <rect x={0} y={0} width={viewBox.width} height={viewBox.height} fill="#ffffff" rx="26" />
        <rect x={pad.left} y={pad.top} width={plotWidth / 2} height={plotHeight / 2} fill="#dbe4ff" opacity="0.95" />
        <rect x={pad.left + plotWidth / 2} y={pad.top} width={plotWidth / 2} height={plotHeight / 2} fill="#dff4e2" opacity="0.95" />
        <rect x={pad.left} y={pad.top + plotHeight / 2} width={plotWidth / 2} height={plotHeight / 2} fill="#ffe0df" opacity="0.95" />
        <rect x={pad.left + plotWidth / 2} y={pad.top + plotHeight / 2} width={plotWidth / 2} height={plotHeight / 2} fill="#fff4cc" opacity="0.95" />

        {ticks.map((tick) => (
          <g key={`grid-x-${tick}`}>
            <line x1={scaleX(tick)} y1={pad.top} x2={scaleX(tick)} y2={pad.top + plotHeight} stroke="rgba(15,23,42,0.08)" strokeWidth="1" />
            <line x1={pad.left} y1={scaleY(tick)} x2={pad.left + plotWidth} y2={scaleY(tick)} stroke="rgba(15,23,42,0.08)" strokeWidth="1" />
          </g>
        ))}

        <line x1={scaleX(center)} y1={pad.top} x2={scaleX(center)} y2={pad.top + plotHeight} stroke="#64748b" strokeWidth="1.5" />
        <line x1={pad.left} y1={scaleY(center)} x2={pad.left + plotWidth} y2={scaleY(center)} stroke="#64748b" strokeWidth="1.5" />

        <text x={pad.left + 10} y={pad.top + 22} fill="#2563eb" fontSize="18" fontWeight="700">Improving</text>
        <text x={pad.left + plotWidth - 88} y={pad.top + 22} fill="#16a34a" fontSize="18" fontWeight="700">Leading</text>
        <text x={pad.left + 10} y={pad.top + plotHeight - 10} fill="#dc2626" fontSize="18" fontWeight="700">Lagging</text>
        <text x={pad.left + plotWidth - 112} y={pad.top + plotHeight - 10} fill="#d97706" fontSize="18" fontWeight="700">Weakening</text>
        <text x={viewBox.width / 2} y={pad.top + 22} textAnchor="middle" fill="#94a3b8" fontSize="16" fontWeight="600">
          Thanks to Sharpely for the inspiration
        </text>

        {snapshot.map((item) => {
          const color = quadrantTone(item.quadrant);
          const path = item.tail
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${scaleX(toRrg100(point.rsRatio))} ${scaleY(toRrg100(point.rsMomentum))}`)
            .join(' ');
          const latest = item.tail[item.tail.length - 1];
          return (
            <g key={item.symbol}>
              <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.7" />
              {item.tail.map((point, index) => (
                <g key={`${item.symbol}-${point.date}-${index}`}>
                  <circle
                    cx={scaleX(toRrg100(point.rsRatio))}
                    cy={scaleY(toRrg100(point.rsMomentum))}
                    r={10}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPoint({
                      label: item.label,
                      date: point.date,
                      rsRatio: toRrg100(point.rsRatio),
                      rsMomentum: toRrg100(point.rsMomentum),
                      x: scaleX(toRrg100(point.rsRatio)),
                      y: scaleY(toRrg100(point.rsMomentum)),
                      color,
                    })}
                    onMouseLeave={() => setHoveredPoint((current) => (current?.label === item.label && current?.date === point.date ? null : current))}
                  />
                  <circle
                    cx={scaleX(toRrg100(point.rsRatio))}
                    cy={scaleY(toRrg100(point.rsMomentum))}
                    r={index === item.tail.length - 1 ? 5.5 : 3}
                    fill={color}
                    opacity={index === item.tail.length - 1 ? 1 : 0.4}
                  />
                </g>
              ))}
              <text
                x={scaleX(toRrg100(latest.rsRatio)) + 8}
                y={scaleY(toRrg100(latest.rsMomentum)) - 8}
                fill={color}
                fontSize="12"
                fontWeight="700"
              >
                {item.label.toUpperCase()}
              </text>
            </g>
          );
        })}

        {hoveredPoint ? (() => {
          const boxWidth = 176;
          const boxHeight = 72;
          const preferredX = hoveredPoint.x - 22;
          const preferredY = hoveredPoint.y - boxHeight - 12;
          const tooltipX = clamp(preferredX, pad.left + 8, viewBox.width - boxWidth - 12);
          const tooltipY = preferredY < pad.top + 6 ? hoveredPoint.y + 12 : preferredY;

          return (
            <g pointerEvents="none">
              <rect
                x={tooltipX + 3}
                y={tooltipY + 4}
                width={boxWidth}
                height={boxHeight}
                rx="8"
                fill="rgba(37,99,235,0.18)"
              />
              <rect
                x={tooltipX}
                y={tooltipY}
                width={boxWidth}
                height={boxHeight}
                rx="8"
                fill="#ffffff"
                stroke="#2563eb"
                strokeWidth="1.2"
              />
              <text x={tooltipX + 12} y={tooltipY + 20} fill="#0f172a" fontSize="12" fontWeight="700">
                {formatRrgTooltipDate(hoveredPoint.date)}
              </text>
              <text x={tooltipX + 12} y={tooltipY + 42} fill="#0f172a" fontSize="12">
                JdK RS-Ratio: {hoveredPoint.rsRatio.toFixed(2)}
              </text>
              <text x={tooltipX + 12} y={tooltipY + 60} fill="#0f172a" fontSize="12">
                JdK RS-Momentum: {hoveredPoint.rsMomentum.toFixed(2)}
              </text>
            </g>
          );
        })() : null}

        {ticks.map((tick) => (
          <g key={`axis-${tick}`}>
            <text x={scaleX(tick)} y={pad.top + plotHeight + 22} textAnchor="middle" fill="#64748b" fontSize="10">{tick}</text>
            <text x={pad.left - 12} y={scaleY(tick) + 4} textAnchor="end" fill="#64748b" fontSize="10">{tick}</text>
          </g>
        ))}

        <text x={viewBox.width / 2} y={viewBox.height - 12} textAnchor="middle" fill="#64748b" fontSize="12">JdK RS-Ratio</text>
        <text
          x={18}
          y={viewBox.height / 2}
          textAnchor="middle"
          fill="#64748b"
          fontSize="12"
          transform={`rotate(-90 18 ${viewBox.height / 2})`}
        >
          JdK RS-Momentum
        </text>
      </svg>

      <div className="mt-4 flex flex-wrap justify-center gap-4">
        {snapshot.map((item) => (
          <div key={`legend-${item.symbol}`} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="h-2.5 w-5 rounded-full" style={{ backgroundColor: quadrantTone(item.quadrant) }} />
            <span>{item.label.toUpperCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RrgLab() {
  const [mode, setMode] = useState('Index');
  const [benchmarkKey, setBenchmarkKey] = useState('nifty50');
  const [timeframe, setTimeframe] = useState('weekly');
  const [tailLength, setTailLength] = useState(6);
  const [includePartial, setIncludePartial] = useState(false);
  const [watchlists, setWatchlists] = useState(RRG_DEFAULT_WATCHLISTS);
  const [search, setSearch] = useState('');

  const benchmark = RRG_BENCHMARKS[benchmarkKey];
  const universe = RRG_UNIVERSES[mode];
  const watchlist = watchlists[mode];
  const availableSymbols = Object.keys(universe);
  const labels = useMemo(
    () => ({
      ...Object.fromEntries(availableSymbols.map((symbol) => [symbol, formatRrgSymbol(symbol, mode)])),
      [benchmark.symbol]: benchmark.label,
    }),
    [availableSymbols, benchmark, mode],
  );

  const filteredSymbols = availableSymbols.filter((symbol) => {
    if (watchlist.includes(symbol)) return false;
    const label = formatRrgSymbol(symbol, mode);
    return label.toLowerCase().includes(search.toLowerCase()) || symbol.toLowerCase().includes(search.toLowerCase());
  });

  const { data, isLoading, refetch, isFetching } = useRrgHistories({
    benchmarkSymbol: benchmark.symbol,
    symbols: watchlist,
    range: timeframe === 'weekly' ? '5y' : '2y',
  });

  const snapshot = useMemo(
    () =>
      buildRrgSnapshot(data?.historyMap || {}, benchmark.symbol, {
        tailLength,
        timeframe,
        includePartial,
        labels,
      }),
    [data?.historyMap, benchmark.symbol, tailLength, timeframe, includePartial, labels],
  );

  const coverage = useMemo(
    () => inspectRrgCoverage(data?.historyMap || {}, benchmark.symbol, {
      tailLength,
      timeframe,
      includePartial,
      labels,
    }),
    [data?.historyMap, benchmark.symbol, tailLength, timeframe, includePartial, labels],
  );

  const missingSymbols = useMemo(
    () => [
      ...(coverage.benchmarkReady ? [] : [benchmark.label]),
      ...coverage.items.filter((item) => item.status === 'missing_history').map((item) => item.label),
    ],
    [coverage, benchmark.label],
  );

  const overlapSymbols = useMemo(
    () => coverage.items.filter((item) => item.status === 'insufficient_overlap'),
    [coverage],
  );

  const latestDate = useMemo(() => {
    const benchmarkPoints = data?.historyMap?.[benchmark.symbol]?.points || [];
    if (!benchmarkPoints.length) return null;
    return benchmarkPoints[benchmarkPoints.length - 1]?.date || null;
  }, [data?.historyMap, benchmark.symbol]);

  const addSymbol = (symbol) => {
    if (!symbol) return;
    setWatchlists((current) => ({
      ...current,
      [mode]: [...new Set([...current[mode], symbol])],
    }));
    setSearch('');
  };

  const removeSymbol = (symbol) => {
    setWatchlists((current) => ({
      ...current,
      [mode]: current[mode].filter((item) => item !== symbol),
    }));
  };

  const importHoldings = async () => {
    try {
      const holdings = await getZerodhaHoldings();
      const symbols = [...new Set((holdings || []).map((item) => `${item.tradingsymbol || ''}.NS`).filter(Boolean))];
      if (!symbols.length) {
        toast.info('No Zerodha holdings were returned for stock watchlist import.');
        return;
      }
      setMode('Stock');
      setWatchlists((current) => ({
        ...current,
        Stock: [...new Set([...current.Stock, ...symbols])],
      }));
      toast.success(`Imported ${symbols.length} Zerodha holdings into Stock watchlist.`);
    } catch (error) {
      toast.error(error.message || 'Unable to import Zerodha holdings.');
    }
  };

  const exportSvg = () => {
    toast.info('PNG export is not wired in this first in-app pass yet. The chart is live and linked, export is the next easy step.');
  };

  return (
    <div className="space-y-6">
      <section className="app-panel rounded-[32px] p-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-orange-500/80">Rotation Lab</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Relative Rotation Graph</h1>
          </div>
          <div className="text-xs leading-6 text-slate-500">
            Zerodha can help here for tradable stocks, ETFs, quotes, holdings, and daily historical candles.
            <br />
            Sector indices may still fall back to mixed provider symbols where Zerodha doesn&apos;t expose the same index history cleanly.
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.7fr_0.65fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
            <div className="mb-5 flex flex-wrap items-end gap-4">
              <label className="min-w-[180px]">
                <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-500">Benchmark</span>
                <select
                  value={benchmarkKey}
                  onChange={(event) => setBenchmarkKey(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                >
                  {Object.entries(RRG_BENCHMARKS).map(([key, item]) => (
                    <option key={key} value={key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="min-w-[240px] flex-1">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.16em] text-slate-500">
                  <span>Tail length</span>
                  <span>{tailLength} weeks</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="52"
                  step="1"
                  value={tailLength}
                  onChange={(event) => setTailLength(Number(event.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-orange-500"
                />
              </div>

              <label className="min-w-[180px]">
                <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-500">Candle timeframe</span>
                <select
                  value={timeframe}
                  onChange={(event) => setTimeframe(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                >
                  <option value="weekly">Weekly candle</option>
                  <option value="daily">Daily candle</option>
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={includePartial}
                  onChange={(event) => setIncludePartial(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 bg-transparent"
                />
                Include partial candles
              </label>
            </div>

            <p className="mb-3 text-sm text-slate-600">
              Showing data for {tailLength + 1} {timeframe === 'weekly' ? 'weeks' : 'sessions'}
              {latestDate ? ` ending ${new Date(latestDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            </p>

            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(((tailLength + 1) / 52) * 100, 100)}%` }} />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                  <Waves className="mr-2 h-4 w-4" />
                  Animate
                </Button>
                <Button onClick={exportSvg} variant="outline" className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                  <Download className="h-4 w-4" />
                </Button>
                <Button onClick={() => refetch()} disabled={isFetching} variant="outline" className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                  <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>

            <p className="mb-3 text-xs text-slate-500">Note: drag/zoom is not in this first linked pass yet, but the data and structure are now inside TickerTap.</p>

            {isLoading ? (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-10 text-center text-slate-500">Loading RRG history...</div>
            ) : snapshot.length ? (
              <RrgCanvas snapshot={snapshot} />
            ) : (
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                No RRG snapshot could be created from the current backend history set.
                <div className="mt-2 text-amber-800">
                  Most likely reasons: backend sleep, provider gaps, or too few overlapping candles for the selected watchlist.
                </div>
                <div className="mt-3 text-amber-800">
                  No synthetic graph is shown now. This panel only renders when real overlapping history is strong enough.
                </div>
              </div>
            )}

            {missingSymbols.length ? (
              <div className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                Missing history for: {missingSymbols.join(', ')}
              </div>
            ) : null}

            {overlapSymbols.length ? (
              <div className="mt-4 rounded-[20px] border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                Insufficient overlapping candles for:{' '}
                {overlapSymbols.map((item) => `${item.label} (${item.alignedPoints}/${item.minimumAligned})`).join(', ')}
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
              <div className="mb-4 flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1">
                {['Index', 'Stock', 'ETF'].map((item) => (
                  <button
                    key={item}
                    onClick={() => setMode(item)}
                    className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
                      mode === item ? 'bg-orange-500 text-white shadow-[0_10px_24px_rgba(249,115,22,0.18)]' : 'text-slate-500 hover:bg-white'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <p className="text-sm font-medium text-slate-900">Quickly add from your watchlists</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                This is now linked into TickerTap. Use static sector/index universes or import Zerodha holdings into stock mode.
              </p>

              <div className="mt-4 space-y-3">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={`Search and add ${mode.toLowerCase()}s`}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />

                {mode === 'Stock' ? (
                  <Button onClick={importHoldings} className="w-full rounded-2xl bg-orange-500 text-white hover:bg-orange-400">
                    Import Zerodha holdings
                  </Button>
                ) : null}

                {filteredSymbols.slice(0, 8).map((symbol) => (
                  <button
                    key={`add-${symbol}`}
                    onClick={() => addSymbol(symbol)}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-white"
                  >
                    <span>{formatRrgSymbol(symbol, mode)}</span>
                    <span className="text-xs text-slate-400">Add</span>
                  </button>
                ))}
              </div>

              <div className="mt-5 space-y-2">
                {watchlist.map((symbol, index) => (
                  <div
                    key={`${mode}-${symbol}`}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-3 text-sm"
                    style={{ backgroundColor: ['#e8f5e9', '#fff8db', '#efe8ff', '#fdecec', '#e8f0ff'][index % 5] }}
                  >
                    <button onClick={() => removeSymbol(symbol)} className="text-slate-500">×</button>
                    <span className="text-slate-800">{formatRrgSymbol(symbol, mode)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 text-sm leading-7 text-slate-600 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
              <p className="font-semibold text-slate-900">RRG in TickerTap</p>
              <p className="mt-2">
                Zerodha helps us with holdings, tradable stocks, ETFs, quotes, and daily historical candles through your existing backend.
                Sector indices still rely on your mixed backend path, because not every index behaves like a normal tradable instrument in Zerodha.
              </p>
              <p className="mt-3 text-xs text-slate-500">
                This linked version now avoids synthetic fallback charts. If overlap is weak, it will show diagnostics instead of pretending the plotted rotation is real.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
