import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Bar, Cell, ComposedChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, Download, Maximize2, Minimize2, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StockAutocompleteInput from '@/components/shared/StockAutocompleteInput';
import { Input } from '@/components/ui/input';
import { namespacedKey } from '@/lib/appConfig';
import { formatCurrency } from '@/lib/portfolioAnalytics';

const RANGE_OPTIONS = [
  { label: '1D', value: '1d' },
  { label: '5D', value: '5d' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
];

const INTERVAL_OPTIONS = [
  { label: '1m', value: '1m' },
  { label: '3m', value: '3m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1h', value: '60m' },
  { label: '3h', value: '180m' },
];

const DEFAULT_TOGGLES = {
  sma20: true,
  sma50: true,
  sma200: true,
  bollinger: false,
  pivots: true,
  fibonacci: false,
  rsi: true,
  macd: false,
  vwap: true,
  volume: true,
  compare: false,
};

const DRAWING_STORAGE_KEY = namespacedKey('portfolio_analyzer_chart_layouts');

function getStoredLayouts() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(DRAWING_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveLayoutForStock(stockId, layout) {
  if (typeof window === 'undefined' || !stockId) return;
  const current = getStoredLayouts();
  current[stockId] = layout;
  window.localStorage.setItem(DRAWING_STORAGE_KEY, JSON.stringify(current));
}

function getLayoutForStock(stockId) {
  if (!stockId) return null;
  return getStoredLayouts()[stockId] || null;
}

function ema(previous, value, period) {
  const multiplier = 2 / (period + 1);
  if (previous === null || previous === undefined) return value;
  return ((value - previous) * multiplier) + previous;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildIndicators(points = []) {
  const closes = points.map((point) => Number(point.close));
  let cumulativeVolume = 0;
  let cumulativeVolumePrice = 0;
  let ema12 = null;
  let ema26 = null;
  let signal = null;

  const enriched = points.map((point, index) => {
    const slice20 = closes.slice(Math.max(0, index - 19), index + 1);
    const slice50 = closes.slice(Math.max(0, index - 49), index + 1);
    const slice200 = closes.slice(Math.max(0, index - 199), index + 1);

    const sma20 = slice20.length === 20 ? average(slice20) : null;
    const sma50 = slice50.length === 50 ? average(slice50) : null;
    const sma200 = slice200.length === 200 ? average(slice200) : null;
    const variance20 = slice20.length === 20
      ? slice20.reduce((sum, value) => sum + ((value - sma20) ** 2), 0) / slice20.length
      : null;
    const deviation20 = variance20 !== null ? Math.sqrt(variance20) : null;

    cumulativeVolume += Number(point.volume || 0);
    cumulativeVolumePrice += Number(point.close || 0) * Number(point.volume || 0);
    ema12 = ema(ema12, Number(point.close), 12);
    ema26 = ema(ema26, Number(point.close), 26);
    const macdLine = ema12 !== null && ema26 !== null ? ema12 - ema26 : null;
    signal = macdLine === null ? signal : ema(signal, macdLine, 9);

    return {
      ...point,
      sma20,
      sma50,
      sma200,
      vwap: cumulativeVolume > 0 ? cumulativeVolumePrice / cumulativeVolume : null,
      macdLine,
      macdSignal: signal,
      macdHistogram: macdLine !== null && signal !== null ? macdLine - signal : null,
      bollingerUpper: sma20 !== null && deviation20 !== null ? sma20 + (2 * deviation20) : null,
      bollingerLower: sma20 !== null && deviation20 !== null ? sma20 - (2 * deviation20) : null,
      rsi14: null,
      bullish: point.close >= point.open,
    };
  });

  let avgGain = null;
  let avgLoss = null;
  for (let index = 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    if (index === 14) {
      let gains = 0;
      let losses = 0;
      for (let seedIndex = 1; seedIndex <= 14; seedIndex += 1) {
        const seedChange = closes[seedIndex] - closes[seedIndex - 1];
        gains += Math.max(seedChange, 0);
        losses += Math.max(-seedChange, 0);
      }
      avgGain = gains / 14;
      avgLoss = losses / 14;
    } else if (index > 14 && avgGain !== null && avgLoss !== null) {
      avgGain = ((avgGain * 13) + gain) / 14;
      avgLoss = ((avgLoss * 13) + loss) / 14;
    }

    if (index >= 14 && avgGain !== null && avgLoss !== null) {
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      enriched[index].rsi14 = Number((100 - (100 / (1 + rs))).toFixed(2));
    }
  }

  return enriched;
}

function buildPivotLevels(points = []) {
  if (!points.length) return null;
  const anchor = points[points.length - 2] || points[points.length - 1];
  return {
    pivot: (anchor.high + anchor.low + anchor.close) / 3,
    r1: (2 * ((anchor.high + anchor.low + anchor.close) / 3)) - anchor.low,
    s1: (2 * ((anchor.high + anchor.low + anchor.close) / 3)) - anchor.high,
  };
}

function buildFibonacciLevels(points = []) {
  if (points.length < 2) return null;
  const highs = points.map((point) => point.high);
  const lows = points.map((point) => point.low);
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const diff = high - low;
  if (!Number.isFinite(diff) || diff <= 0) return null;

  return {
    high,
    low,
    levels: [
      { label: '0.236', value: high - (diff * 0.236) },
      { label: '0.382', value: high - (diff * 0.382) },
      { label: '0.500', value: high - (diff * 0.5) },
      { label: '0.618', value: high - (diff * 0.618) },
      { label: '0.786', value: high - (diff * 0.786) },
    ],
  };
}

function aggregateCandles(points = [], bucketSize = 1) {
  if (bucketSize <= 1) return points;
  const result = [];

  for (let index = 0; index < points.length; index += bucketSize) {
    const bucket = points.slice(index, index + bucketSize);
    if (!bucket.length) continue;

    result.push({
      date: bucket[0].date,
      open: bucket[0].open,
      high: Math.max(...bucket.map((point) => point.high)),
      low: Math.min(...bucket.map((point) => point.low)),
      close: bucket[bucket.length - 1].close,
      volume: bucket.reduce((sum, point) => sum + (point.volume || 0), 0),
    });
  }

  return result;
}

function getIntervalConfig(interval) {
  switch (interval) {
    case '1m':
      return { requestInterval: 'minute', aggregate: 1, refreshMs: 15000 };
    case '3m':
      return { requestInterval: '3minute', aggregate: 1, refreshMs: 15000 };
    case '5m':
      return { requestInterval: '5minute', aggregate: 1, refreshMs: 20000 };
    case '15m':
      return { requestInterval: '15minute', aggregate: 1, refreshMs: 30000 };
    case '30m':
      return { requestInterval: '30minute', aggregate: 1, refreshMs: 45000 };
    case '60m':
      return { requestInterval: '60minute', aggregate: 1, refreshMs: 60000 };
    case '180m':
      return { requestInterval: '60minute', aggregate: 3, refreshMs: 60000 };
    default:
      return { requestInterval: 'day', aggregate: 1, refreshMs: 60000 };
  }
}

function formatDateLabel(dateString, range, interval) {
  const date = new Date(dateString);
  if (range === '1d' || ['1m', '3m', '5m', '15m', '30m', '60m', '180m'].includes(interval)) {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function buildCompareSeries(primaryPoints = [], compareSeries = []) {
  if (!primaryPoints.length || !compareSeries.length) return primaryPoints;

  return primaryPoints.map((point, index) => {
    const next = { ...point };

    compareSeries.forEach((series, seriesIndex) => {
      const compareBase = Number(series?.[0]?.close || 0);
      const comparePoint = series?.[index];
      const primaryBase = Number(primaryPoints[0]?.close || 0);
      const key = `compareCloseScaled${seriesIndex}`;

      next[key] = comparePoint?.close && compareBase && primaryBase
        ? primaryBase * (Number(comparePoint.close) / compareBase)
        : null;
    });

    return next;
  });
}

function CandleShape(props) {
  const {
    x, width, yAxis, payload,
  } = props;

  if (!payload || !yAxis?.scale) return null;

  const candleWidth = Math.max(4, Math.min(width * 0.66, 12));
  const centerX = x + (width / 2);
  const openY = yAxis.scale(payload.open);
  const closeY = yAxis.scale(payload.close);
  const highY = yAxis.scale(payload.high);
  const lowY = yAxis.scale(payload.low);
  const bodyY = Math.min(openY, closeY);
  const bodyHeight = Math.max(1, Math.abs(closeY - openY));
  const color = payload.bullish ? '#10B981' : '#F43F5E';

  return (
    <g>
      <line x1={centerX} x2={centerX} y1={highY} y2={lowY} stroke={color} strokeWidth={1.3} />
      <rect
        x={centerX - (candleWidth / 2)}
        y={bodyY}
        width={candleWidth}
        height={bodyHeight}
        rx={1.5}
        fill={color}
      />
    </g>
  );
}

function ChartTooltip({ active, payload, label, currency = 'INR', compareSymbol = '' }) {
  if (!active || !payload?.[0]?.payload) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1320] px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-white">{label}</p>
      <p className="text-slate-300">O {formatCurrency(point.open, currency)}</p>
      <p className="text-slate-300">H {formatCurrency(point.high, currency)}</p>
      <p className="text-slate-300">L {formatCurrency(point.low, currency)}</p>
      <p className="text-amber-300">C {formatCurrency(point.close, currency)}</p>
      {point.sma20 ? <p className="text-cyan-300">SMA 20 {formatCurrency(point.sma20, currency)}</p> : null}
      {point.sma50 ? <p className="text-violet-300">SMA 50 {formatCurrency(point.sma50, currency)}</p> : null}
      {point.sma200 ? <p className="text-emerald-300">SMA 200 {formatCurrency(point.sma200, currency)}</p> : null}
      {point.rsi14 ? <p className="text-rose-300">RSI 14 {point.rsi14.toFixed(2)}</p> : null}
      {compareSymbol && point.compareCloseScaled ? <p className="text-cyan-200">Compare {compareSymbol}</p> : null}
    </div>
  );
}

export default function MarketHistoryChart({ stock, onStockSelect }) {
  const chartWrapRef = useRef(null);
  const dragZoomRef = useRef({ active: false, startY: 0, startZoom: 1 });
  const savedLayout = useMemo(() => getLayoutForStock(stock?.id), [stock?.id]);
  const [range, setRange] = useState(savedLayout?.range || '1d');
  const [interval, setInterval] = useState(savedLayout?.interval || '5m');
  const [autoRefresh, setAutoRefresh] = useState(savedLayout?.autoRefresh ?? true);
  const [expanded, setExpanded] = useState(savedLayout?.expanded ?? false);
  const [fullWindow, setFullWindow] = useState(false);
  const [showTools, setShowTools] = useState(savedLayout?.showTools ?? false);
  const [priceZoom, setPriceZoom] = useState(savedLayout?.priceZoom ?? 1);
  const [toggles, setToggles] = useState({ ...DEFAULT_TOGGLES, ...(savedLayout?.toggles || {}) });
  const [searchInput, setSearchInput] = useState(stock?.symbol || '');
  const [compareInput, setCompareInput] = useState(savedLayout?.compareSymbol || '');
  const [compareSymbol, setCompareSymbol] = useState(savedLayout?.compareSymbol || '');
  const [horizontalLineInput, setHorizontalLineInput] = useState(savedLayout?.drawings?.horizontalLine ? String(savedLayout.drawings.horizontalLine) : '');
  const [trendStartInput, setTrendStartInput] = useState(savedLayout?.drawings?.trendStart ? String(savedLayout.drawings.trendStart) : '');
  const [trendEndInput, setTrendEndInput] = useState(savedLayout?.drawings?.trendEnd ? String(savedLayout.drawings.trendEnd) : '');
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const intervalConfig = getIntervalConfig(interval);

  useEffect(() => {
    if (['1m', '3m', '5m'].includes(interval) && !['1d', '5d'].includes(range)) {
      setRange('1d');
      return;
    }
    if (['15m', '30m'].includes(interval) && !['1d', '5d', '1mo'].includes(range)) {
      setRange('5d');
      return;
    }
    if (['60m', '180m'].includes(interval) && !['1d', '5d', '1mo', '3mo'].includes(range)) {
      setRange('1mo');
    }
  }, [interval, range]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (event.key === '1') setInterval('1m');
      if (event.key === '2') setInterval('3m');
      if (event.key === '3') setInterval('5m');
      if (event.key === '4') setInterval('15m');
      if (event.key === '5') setInterval('30m');
      if (event.key === '6') setInterval('60m');
      if (event.key === '7') setInterval('180m');
      if (event.key.toLowerCase() === 'r') {
        mainQuery.refetch();
      }
      if (event.key.toLowerCase() === 'a') {
        setAutoRefresh((value) => !value);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    setSearchInput(stock?.symbol || '');
  }, [stock?.symbol]);

  useEffect(() => {
    saveLayoutForStock(stock?.id, {
      range,
      interval,
      autoRefresh,
      expanded,
      showTools,
      priceZoom,
      compareSymbol,
      toggles,
      drawings: {
        horizontalLine: horizontalLineInput ? Number(horizontalLineInput) : null,
        trendStart: trendStartInput ? Number(trendStartInput) : null,
        trendEnd: trendEndInput ? Number(trendEndInput) : null,
      },
    });
  }, [autoRefresh, compareSymbol, expanded, horizontalLineInput, interval, priceZoom, range, showTools, stock?.id, toggles, trendEndInput, trendStartInput]);

  useEffect(() => {
    if (!fullWindow) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fullWindow]);

  const mainQuery = useQuery({
    queryKey: ['market-history', stock?.symbol, range, interval],
    enabled: Boolean(stock?.symbol),
    refetchInterval: autoRefresh ? intervalConfig.refreshMs : false,
    queryFn: async () => {
      const response = await fetch(
        `${apiBaseUrl}/api/market/history?symbol=${encodeURIComponent(stock.symbol)}&range=${range}&interval=${intervalConfig.requestInterval}`,
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to load market history.');
      }
      return response.json();
    },
  });

  const compareSymbols = useMemo(
    () => compareSymbol.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean).slice(0, 3),
    [compareSymbol],
  );

  const compareQueries = useQueries({
    queries: compareSymbols.map((symbol) => ({
      queryKey: ['compare-history', symbol, range, interval],
      enabled: Boolean(symbol),
      refetchInterval: autoRefresh ? intervalConfig.refreshMs : false,
      queryFn: async () => {
        const response = await fetch(
          `${apiBaseUrl}/api/market/history?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${intervalConfig.requestInterval}`,
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Unable to load compare symbol ${symbol}.`);
        }
        return response.json();
      },
    })),
  });

  const mainPoints = aggregateCandles(mainQuery.data?.points || [], intervalConfig.aggregate);
  const comparePointsSeries = compareQueries.map((query) => aggregateCandles(query.data?.points || [], intervalConfig.aggregate));
  const baseData = useMemo(() => mainPoints.map((point) => ({
    ...point,
    label: formatDateLabel(point.date, range, interval),
  })), [interval, mainPoints, range]);
  const comparedData = useMemo(
    () => buildCompareSeries(baseData, comparePointsSeries),
    [baseData, comparePointsSeries],
  );
  const chartData = useMemo(() => buildIndicators(comparedData), [comparedData]);
  const pivots = buildPivotLevels(chartData);
  const fib = buildFibonacciLevels(chartData);
  const latestPoint = chartData[chartData.length - 1];

  const horizontalLine = horizontalLineInput ? Number(horizontalLineInput) : null;
  const trendStart = trendStartInput ? Number(trendStartInput) : null;
  const trendEnd = trendEndInput ? Number(trendEndInput) : null;
  const trendlineData = useMemo(() => {
    if (!trendStart || !trendEnd || chartData.length < 2) return [];
    return chartData.map((point, index) => ({
      ...point,
      manualTrend: trendStart + (((trendEnd - trendStart) * index) / Math.max(chartData.length - 1, 1)),
    }));
  }, [chartData, trendEnd, trendStart]);
  const renderedData = trendlineData.length ? trendlineData : chartData;
  const priceDomain = useMemo(() => {
    if (!renderedData.length) return ['auto', 'auto'];

    const values = [];
    renderedData.forEach((point) => {
      ['open', 'high', 'low', 'close'].forEach((key) => {
        const value = Number(point[key]);
        if (Number.isFinite(value)) values.push(value);
      });
      if (toggles.sma20 && Number.isFinite(point.sma20)) values.push(point.sma20);
      if (toggles.sma50 && Number.isFinite(point.sma50)) values.push(point.sma50);
      if (toggles.sma200 && Number.isFinite(point.sma200)) values.push(point.sma200);
      if (toggles.vwap && Number.isFinite(point.vwap)) values.push(point.vwap);
      if (toggles.bollinger) {
        if (Number.isFinite(point.bollingerUpper)) values.push(point.bollingerUpper);
        if (Number.isFinite(point.bollingerLower)) values.push(point.bollingerLower);
      }
      if (trendlineData.length && Number.isFinite(point.manualTrend)) values.push(point.manualTrend);
      if (toggles.compare) {
        compareSymbols.forEach((_, index) => {
          const compareValue = Number(point[`compareCloseScaled${index}`]);
          if (Number.isFinite(compareValue)) values.push(compareValue);
        });
      }
    });

    if (toggles.pivots && pivots) {
      [pivots.pivot, pivots.r1, pivots.s1].forEach((value) => {
        if (Number.isFinite(value)) values.push(value);
      });
    }
    if (toggles.fibonacci && fib?.levels?.length) {
      fib.levels.forEach((level) => {
        if (Number.isFinite(level.value)) values.push(level.value);
      });
    }
    if (Number.isFinite(horizontalLine)) values.push(horizontalLine);

    if (!values.length) return ['auto', 'auto'];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min;
    const basePadding = spread === 0 ? Math.max(Math.abs(max) * 0.01, 1) : spread * 0.12;
    const zoomPadding = Math.max(basePadding / Math.max(priceZoom, 0.4), 0.01);

    return [
      Number((min - zoomPadding).toFixed(2)),
      Number((max + zoomPadding).toFixed(2)),
    ];
  }, [compareSymbols, fib, horizontalLine, pivots, priceZoom, renderedData, toggles, trendlineData.length]);
  const chartHeight = fullWindow ? 820 : expanded ? 680 : 500;

  const handleToggle = (key) => setToggles((current) => ({ ...current, [key]: !current[key] }));

  const exportChart = () => {
    const svg = chartWrapRef.current?.querySelector('svg');
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${stock.symbol.toLowerCase()}-chart.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clampPriceZoom = (value) => Math.min(Math.max(Number(value) || 1, 0.45), 8);

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (!dragZoomRef.current.active) return;
      const deltaY = dragZoomRef.current.startY - event.clientY;
      const nextZoom = clampPriceZoom(dragZoomRef.current.startZoom * (1 + (deltaY / 220)));
      setPriceZoom(nextZoom);
    };

    const handleMouseUp = () => {
      if (!dragZoomRef.current.active) return;
      dragZoomRef.current.active = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startDragZoom = (event) => {
    dragZoomRef.current = {
      active: true,
      startY: event.clientY,
      startZoom: priceZoom,
    };
  };

  const handleWheelZoom = (event) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    setPriceZoom((current) => clampPriceZoom(current * direction));
  };

  return (
    <section className={fullWindow ? 'fixed inset-2 z-[80] overflow-y-auto rounded-[28px] border border-white/10 bg-[#0a1018]/98 p-4 shadow-[0_24px_120px_rgba(0,0,0,0.52)]' : 'rounded-[28px] border border-white/10 bg-[#0a1018]/95 p-4 shadow-[0_20px_56px_rgba(0,0,0,0.24)]'}>
      <div className="flex flex-col gap-3">
        <div className="rounded-[24px] border border-white/8 bg-[#0b1119] px-4 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-amber-300/12 px-3 py-2 text-sm font-semibold text-amber-200">{stock.symbol}</div>
                <p className="truncate text-sm text-slate-300">{stock.name}</p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>Source <span className="font-semibold uppercase tracking-[0.12em] text-amber-300">{mainQuery.data?.source || '--'}</span></span>
                <span>Last <span className="font-semibold text-white">{latestPoint?.close ? formatCurrency(latestPoint.close, mainQuery.data?.currency || 'INR') : '--'}</span></span>
                <span>RSI <span className="font-semibold text-slate-200">{latestPoint?.rsi14 ? latestPoint.rsi14.toFixed(2) : '--'}</span></span>
                <span>Y Zoom <span className="font-semibold text-slate-200">{priceZoom.toFixed(2)}x</span></span>
                {compareSymbols.length ? <span>Compare <span className="font-semibold text-cyan-200">{compareSymbols.join(', ')}</span></span> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onStockSelect ? (
                <div className="w-full min-w-[240px] max-w-sm">
                  <StockAutocompleteInput
                    value={searchInput}
                    onChange={setSearchInput}
                    onSelect={(item) => {
                      setSearchInput(item.symbol);
                      onStockSelect(item);
                    }}
                    placeholder="Search another stock"
                    className="h-10 rounded-2xl border-white/10 bg-white/5"
                  />
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowTools((value) => !value)}
                className={`rounded-2xl border-white/10 ${showTools ? 'bg-white/10 text-white' : 'bg-white/5 text-slate-200'} hover:bg-white/10`}
              >
                Tools
                <ChevronDown className={`h-4 w-4 transition ${showTools ? 'rotate-180' : ''}`} />
              </Button>
              <Button type="button" variant="outline" onClick={() => setFullWindow((value) => !value)} className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
                {fullWindow ? 'Exit Full Window' : 'Full Window'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setExpanded((value) => !value)} className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
                {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                {expanded ? 'Compact' : 'Expand'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setPriceZoom((value) => Math.min(Number((value * 1.35).toFixed(2)), 8))} className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
                <ZoomIn className="h-4 w-4" />
                Y+
              </Button>
              <Button type="button" variant="outline" onClick={() => setPriceZoom((value) => Math.max(Number((value / 1.35).toFixed(2)), 0.45))} className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
                <ZoomOut className="h-4 w-4" />
                Y-
              </Button>
              <Button type="button" variant="outline" onClick={() => setPriceZoom(1)} className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
                Reset Y
              </Button>
              <Button type="button" variant="outline" onClick={exportChart} className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
                <Download className="h-4 w-4" />
                Export
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAutoRefresh((value) => !value)}
                className={`rounded-2xl border-white/10 ${autoRefresh ? 'bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/20' : 'bg-white/5 text-white hover:bg-white/10'}`}
              >
                {autoRefresh ? 'Auto On' : 'Auto Off'}
              </Button>
              <Button type="button" variant="outline" onClick={() => { mainQuery.refetch(); compareQueries.forEach((query) => query.refetch?.()); }} className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
                <RefreshCw className={`h-4 w-4 ${(mainQuery.isFetching || compareQueries.some((query) => query.isFetching)) ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/8 bg-[#0b1119] px-3 py-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {RANGE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant="outline"
                  onClick={() => setRange(option.value)}
                  className={`h-9 rounded-2xl border-white/10 px-3 ${range === option.value ? 'bg-amber-300 text-slate-950 hover:bg-amber-200' : 'bg-white/5 text-white hover:bg-white/10'}`}
                >
                  {option.label}
                </Button>
              ))}
              <div className="mx-1 hidden h-6 w-px bg-white/10 md:block" />
              {INTERVAL_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant="outline"
                  onClick={() => setInterval(option.value)}
                  className={`h-9 rounded-2xl border-white/10 px-3 ${interval === option.value ? 'bg-cyan-300 text-slate-950 hover:bg-cyan-200' : 'bg-white/5 text-white hover:bg-white/10'}`}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[
                ['sma20', 'SMA 20'],
                ['sma50', 'SMA 50'],
                ['sma200', 'SMA 200'],
                ['bollinger', 'Bands'],
                ['pivots', 'Pivot'],
                ['fibonacci', 'Fib'],
                ['rsi', 'RSI'],
                ['macd', 'MACD'],
                ['vwap', 'VWAP'],
                ['volume', 'Volume'],
                ['compare', 'Compare'],
              ].map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
                  onClick={() => handleToggle(key)}
                  className={`h-8 rounded-2xl border-white/10 px-3 text-xs ${toggles[key] ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-transparent text-slate-500 hover:bg-white/5'}`}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {showTools ? (
          <div className="grid gap-3 rounded-[24px] border border-white/8 bg-[#0b1119] p-3 xl:grid-cols-[1.2fr_1fr]">
            <div className="flex w-full gap-2">
              <Input
                value={compareInput}
                onChange={(event) => setCompareInput(event.target.value.toUpperCase())}
                placeholder="Compare symbol like INFY or RELIANCE"
                className="h-10 rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-slate-500"
              />
              <Button type="button" onClick={() => setCompareSymbol(compareInput.trim().toUpperCase())} className="rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                Compare
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCompareInput('');
                  setCompareSymbol('');
                }}
                className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                Clear
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Input value={horizontalLineInput} onChange={(event) => setHorizontalLineInput(event.target.value)} placeholder="Line" className="h-10 rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-slate-500" />
              <Input value={trendStartInput} onChange={(event) => setTrendStartInput(event.target.value)} placeholder="Trend start" className="h-10 rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-slate-500" />
              <Input value={trendEndInput} onChange={(event) => setTrendEndInput(event.target.value)} placeholder="Trend end" className="h-10 rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-slate-500" />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setHorizontalLineInput('');
                  setTrendStartInput('');
                  setTrendEndInput('');
                }}
                className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                Clear
              </Button>
            </div>
          </div>
        ) : null}

        <div ref={chartWrapRef} className="rounded-[26px] border border-white/8 bg-[#060b12] p-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
            <span>Drag or wheel on the main chart to zoom the Y-axis.</span>
            <span className="hidden sm:inline">Double-click resets price scale.</span>
          </div>
          {mainQuery.isLoading ? (
            <div className="flex h-[560px] items-center justify-center text-sm text-slate-400">Loading live candles...</div>
          ) : mainQuery.isError ? (
            <div className="flex h-[560px] flex-col items-center justify-center text-center">
              <p className="text-white">Unable to load candlestick data.</p>
              <p className="mt-2 max-w-md text-sm text-slate-400">{mainQuery.error?.message || 'Chart feed is currently unavailable.'}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                className="select-none cursor-ns-resize"
                onMouseDown={startDragZoom}
                onWheel={handleWheelZoom}
                onDoubleClick={() => setPriceZoom(1)}
                role="presentation"
              >
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <ComposedChart syncId="stock-chart-sync" data={renderedData} margin={{ left: 0, right: 16, top: 10, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.10)" vertical />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} minTickGap={28} />
                    <YAxis
                      domain={priceDomain}
                      allowDataOverflow
                      axisLine={false}
                      tickLine={false}
                      orientation="right"
                      width={96}
                      tickMargin={10}
                      tick={{ fill: '#D8E1F0', fontSize: 13, fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                      tickFormatter={(value) => formatCurrency(value, mainQuery.data?.currency || 'INR').replace('.00', '')}
                    />
                    <Tooltip
                      content={<ChartTooltip currency={mainQuery.data?.currency || 'INR'} compareSymbol={compareSymbol} />}
                      cursor={{ stroke: 'rgba(148,163,184,0.55)', strokeWidth: 1 }}
                    />
                    {toggles.pivots && pivots ? (
                      <>
                        <ReferenceLine y={pivots.pivot} stroke="rgba(245,158,11,0.55)" strokeDasharray="5 5" />
                        <ReferenceLine y={pivots.r1} stroke="rgba(16,185,129,0.35)" strokeDasharray="4 4" />
                        <ReferenceLine y={pivots.s1} stroke="rgba(244,63,94,0.35)" strokeDasharray="4 4" />
                      </>
                    ) : null}
                    {toggles.fibonacci && fib ? fib.levels.map((level) => (
                      <ReferenceLine key={level.label} y={level.value} stroke="rgba(148,163,184,0.32)" strokeDasharray="3 5" />
                    )) : null}
                    {horizontalLine ? <ReferenceLine y={horizontalLine} stroke="rgba(96,165,250,0.75)" strokeDasharray="7 4" /> : null}
                    {toggles.bollinger ? (
                      <>
                        <Line type="monotone" dataKey="bollingerUpper" stroke="#94A3B8" strokeWidth={1.2} dot={false} connectNulls />
                        <Line type="monotone" dataKey="bollingerLower" stroke="#94A3B8" strokeWidth={1.2} dot={false} connectNulls />
                      </>
                    ) : null}
                    {toggles.sma20 ? <Line type="monotone" dataKey="sma20" stroke="#22D3EE" strokeWidth={1.7} dot={false} connectNulls /> : null}
                    {toggles.sma50 ? <Line type="monotone" dataKey="sma50" stroke="#C084FC" strokeWidth={1.7} dot={false} connectNulls /> : null}
                    {toggles.sma200 ? <Line type="monotone" dataKey="sma200" stroke="#34D399" strokeWidth={1.7} dot={false} connectNulls /> : null}
                    {toggles.vwap ? <Line type="monotone" dataKey="vwap" stroke="#38BDF8" strokeWidth={1.7} dot={false} connectNulls /> : null}
                    {toggles.compare ? compareSymbols.map((symbol, index) => (
                      <Line
                        key={symbol}
                        type="monotone"
                        dataKey={`compareCloseScaled${index}`}
                        stroke={['#60A5FA', '#F472B6', '#FBBF24'][index % 3]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    )) : null}
                    {trendlineData.length ? <Line type="monotone" dataKey="manualTrend" stroke="#FDE047" strokeWidth={1.6} dot={false} connectNulls /> : null}
                    <Line dataKey="close" stroke="transparent" dot={<CandleShape />} activeDot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {toggles.volume ? (
                <ResponsiveContainer width="100%" height={110}>
                  <ComposedChart syncId="stock-chart-sync" data={renderedData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} minTickGap={28} />
                    <YAxis axisLine={false} tickLine={false} orientation="right" width={86} tick={{ fill: '#A8B6CB', fontSize: 12, fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }} />
                    <Tooltip
                      content={<ChartTooltip currency={mainQuery.data?.currency || 'INR'} compareSymbol={compareSymbol} />}
                      cursor={{ stroke: 'rgba(148,163,184,0.55)', strokeWidth: 1 }}
                    />
                    <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
                      {chartData.map((point) => (
                        <Cell key={`${point.date}-volume`} fill={point.bullish ? 'rgba(16,185,129,0.75)' : 'rgba(244,63,94,0.75)'} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              ) : null}

              {toggles.rsi ? (
                <ResponsiveContainer width="100%" height={135}>
                  <ComposedChart syncId="stock-chart-sync" data={renderedData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} minTickGap={28} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} orientation="right" width={86} tick={{ fill: '#A8B6CB', fontSize: 12, fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }} />
                    <Tooltip
                      content={<ChartTooltip currency={mainQuery.data?.currency || 'INR'} compareSymbol={compareSymbol} />}
                      cursor={{ stroke: 'rgba(148,163,184,0.55)', strokeWidth: 1 }}
                    />
                    <ReferenceLine y={70} stroke="rgba(244,63,94,0.55)" strokeDasharray="4 4" />
                    <ReferenceLine y={30} stroke="rgba(16,185,129,0.55)" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="rsi14" stroke="#FB7185" strokeWidth={2.2} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : null}

              {toggles.macd ? (
                <ResponsiveContainer width="100%" height={145}>
                  <ComposedChart syncId="stock-chart-sync" data={renderedData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} minTickGap={28} />
                    <YAxis axisLine={false} tickLine={false} orientation="right" width={86} tick={{ fill: '#A8B6CB', fontSize: 12, fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }} />
                    <Tooltip
                      content={<ChartTooltip currency={mainQuery.data?.currency || 'INR'} compareSymbol={compareSymbol} />}
                      cursor={{ stroke: 'rgba(148,163,184,0.55)', strokeWidth: 1 }}
                    />
                    <ReferenceLine y={0} stroke="rgba(148,163,184,0.35)" />
                    <Bar dataKey="macdHistogram" radius={[3, 3, 0, 0]}>
                      {renderedData.map((point) => (
                        <Cell key={`${point.date}-macd`} fill={(point.macdHistogram || 0) >= 0 ? 'rgba(16,185,129,0.75)' : 'rgba(244,63,94,0.75)'} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="macdLine" stroke="#22D3EE" strokeWidth={1.8} dot={false} connectNulls />
                    <Line type="monotone" dataKey="macdSignal" stroke="#F59E0B" strokeWidth={1.8} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
