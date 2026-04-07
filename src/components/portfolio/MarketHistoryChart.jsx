import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Bar, Cell, ComposedChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, Download, Maximize2, Minimize2, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StockAutocompleteInput from '@/components/shared/StockAutocompleteInput';
import { Input } from '@/components/ui/input';
import { namespacedKey } from '@/lib/appConfig';
import { getBrokerApiBase } from '@/lib/brokerClient';
import { formatCurrency } from '@/lib/portfolioAnalytics';

const RANGE_OPTIONS = [
  { label: '1D', value: '1d' },
  { label: '5D', value: '5d' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: 'YTD', value: 'ytd' },
  { label: '1Y', value: '1y' },
  { label: '3Y', value: '3y' },
  { label: '5Y', value: '5y' },
  { label: 'ALL', value: 'all' },
];

const INTERVAL_OPTIONS = [
  { label: '1m', value: '1m' },
  { label: '3m', value: '3m' },
  { label: '5m', value: '5m' },
  { label: '10m', value: '10m' },
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1h', value: '60m' },
  { label: '3h', value: '180m' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
  { label: '1M', value: '1mo' },
];

const CHART_TYPE_OPTIONS = [
  { label: 'Candles', value: 'candles' },
  { label: 'Hollow', value: 'hollow' },
  { label: 'Line', value: 'line' },
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

const DEFAULT_STYLE = {
  bullishColor: '#16A34A',
  bearishColor: '#DC2626',
  wickBullishColor: '#22C55E',
  wickBearishColor: '#F43F5E',
  candleWidth: 0.72,
  candleSharpness: 1.2,
  lineColor: '#F8FAFC',
  lineWidth: 2,
  sma20Width: 1.7,
  sma50Width: 1.7,
  sma200Width: 1.7,
  vwapWidth: 1.7,
  sma20Color: '#22D3EE',
  sma50Color: '#C084FC',
  sma200Color: '#34D399',
  vwapColor: '#38BDF8',
  bollingerColor: '#94A3B8',
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
  if (bucketSize === 'week' || bucketSize === 'month') {
    const buckets = new Map();

    points.forEach((point) => {
      const date = new Date(point.date);
      const key = bucketSize === 'week'
        ? `${date.getUTCFullYear()}-W${Math.floor((((date - new Date(Date.UTC(date.getUTCFullYear(), 0, 1))) / 86400000) + new Date(Date.UTC(date.getUTCFullYear(), 0, 1)).getUTCDay() + 1) / 7)}`
        : `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;

      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, { ...point });
        return;
      }

      existing.high = Math.max(existing.high, point.high);
      existing.low = Math.min(existing.low, point.low);
      existing.close = point.close;
      existing.volume = (existing.volume || 0) + (point.volume || 0);
    });

    return [...buckets.values()];
  }

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
    case '10m':
      return { requestInterval: '10minute', aggregate: 1, refreshMs: 25000 };
    case '15m':
      return { requestInterval: '15minute', aggregate: 1, refreshMs: 30000 };
    case '30m':
      return { requestInterval: '30minute', aggregate: 1, refreshMs: 45000 };
    case '60m':
      return { requestInterval: '60minute', aggregate: 1, refreshMs: 60000 };
    case '180m':
      return { requestInterval: '60minute', aggregate: 3, refreshMs: 60000 };
    case '1w':
      return { requestInterval: 'day', aggregate: 'week', refreshMs: 90000 };
    case '1mo':
      return { requestInterval: 'day', aggregate: 'month', refreshMs: 90000 };
    case '1d':
      return { requestInterval: 'day', aggregate: 1, refreshMs: 60000 };
    default:
      return { requestInterval: 'day', aggregate: 1, refreshMs: 60000 };
  }
}

function formatDateLabel(dateString, range, interval) {
  const date = new Date(dateString);
  if (range === '1d' || ['1m', '3m', '5m', '10m', '15m', '30m', '60m', '180m'].includes(interval)) {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  if (interval === '1mo') {
    return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
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

function CandleOverlay({
  data = [],
  domain = ['auto', 'auto'],
  width = 0,
  height = 0,
  yAxisWidth = 96,
  mode = 'candles',
  style = DEFAULT_STYLE,
}) {
  if (!data.length || !width || !height || !Array.isArray(domain) || domain.length < 2) return null;
  const min = Number(domain[0]);
  const max = Number(domain[1]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;

  const margin = { top: 10, right: 16 + yAxisWidth, bottom: 26, left: 8 };
  const innerWidth = Math.max(width - margin.left - margin.right, 1);
  const innerHeight = Math.max(height - margin.top - margin.bottom, 1);
  const slotWidth = innerWidth / Math.max(data.length, 1);
  const candleWidth = Math.max(4, Math.min(slotWidth * (style.candleWidth || 0.72), 16));
  const priceToY = (price) => margin.top + (((max - price) / (max - min)) * innerHeight);

  return (
    <svg className="pointer-events-none absolute inset-0 z-[1]" width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {data.map((point, index) => {
        const centerX = margin.left + (slotWidth * index) + (slotWidth / 2);
        const openY = priceToY(point.open);
        const closeY = priceToY(point.close);
        const highY = priceToY(point.high);
        const lowY = priceToY(point.low);
        const bodyY = Math.min(openY, closeY);
        const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
        const bullish = point.close >= point.open;
        const wickColor = bullish ? style.wickBullishColor : style.wickBearishColor;
        const bodyFill = bullish ? style.bullishColor : style.bearishColor;
        const fill = mode === 'hollow' && bullish ? 'rgba(0,0,0,0)' : bodyFill;

        return (
          <g key={`${point.date}-${index}`}>
            <line x1={centerX} x2={centerX} y1={highY} y2={lowY} stroke={wickColor} strokeWidth={Math.max(1.1, style.candleSharpness || 1.2)} />
            <rect
              x={centerX - (candleWidth / 2)}
              y={bodyY}
              width={candleWidth}
              height={bodyHeight}
              rx={1.2}
              fill={fill}
              stroke={wickColor}
              strokeWidth={Math.max(1.1, style.candleSharpness || 1.2)}
            />
          </g>
        );
      })}
    </svg>
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
      {point.rsi14 ? <p className="text-rose-300">RSI 14 {point.rsi14.toFixed(2)}</p> : null}
      {compareSymbol && point.compareCloseScaled ? <p className="text-cyan-200">Compare {compareSymbol}</p> : null}
    </div>
  );
}

export default function MarketHistoryChart({ stock, onStockSelect }) {
  const chartWrapRef = useRef(null);
  const chartViewportRef = useRef(null);
  const dragZoomRef = useRef({ active: false, startY: 0, startZoom: 1 });
  const savedLayout = useMemo(() => getLayoutForStock(stock?.id), [stock?.id]);
  const [range, setRange] = useState(savedLayout?.range || '1d');
  const [interval, setInterval] = useState(savedLayout?.interval || '5m');
  const [autoRefresh, setAutoRefresh] = useState(savedLayout?.autoRefresh ?? true);
  const [expanded, setExpanded] = useState(savedLayout?.expanded ?? false);
  const [fullWindow, setFullWindow] = useState(false);
  const [showTools, setShowTools] = useState(savedLayout?.showTools ?? false);
  const [chartType, setChartType] = useState(savedLayout?.chartType || 'candles');
  const [drawMode, setDrawMode] = useState(savedLayout?.drawMode || 'cursor');
  const [priceZoom, setPriceZoom] = useState(savedLayout?.priceZoom ?? 1);
  const [chartViewportWidth, setChartViewportWidth] = useState(0);
  const [showAppearance, setShowAppearance] = useState(savedLayout?.showAppearance ?? false);
  const [chartStyle, setChartStyle] = useState({ ...DEFAULT_STYLE, ...(savedLayout?.chartStyle || {}) });
  const [markerVisibility, setMarkerVisibility] = useState({
    last: savedLayout?.markerVisibility?.last ?? true,
    sma20: savedLayout?.markerVisibility?.sma20 ?? true,
    sma50: savedLayout?.markerVisibility?.sma50 ?? true,
    sma200: savedLayout?.markerVisibility?.sma200 ?? true,
    vwap: savedLayout?.markerVisibility?.vwap ?? true,
    pivot: savedLayout?.markerVisibility?.pivot ?? true,
    level: savedLayout?.markerVisibility?.level ?? true,
  });
  const [toggles, setToggles] = useState({ ...DEFAULT_TOGGLES, ...(savedLayout?.toggles || {}) });
  const [searchInput, setSearchInput] = useState(stock?.symbol || '');
  const [compareInput, setCompareInput] = useState(savedLayout?.compareSymbol || '');
  const [compareSymbol, setCompareSymbol] = useState(savedLayout?.compareSymbol || '');
  const [horizontalLineInput, setHorizontalLineInput] = useState(savedLayout?.drawings?.horizontalLine ? String(savedLayout.drawings.horizontalLine) : '');
  const [trendStartInput, setTrendStartInput] = useState(savedLayout?.drawings?.trendStart ? String(savedLayout.drawings.trendStart) : '');
  const [trendEndInput, setTrendEndInput] = useState(savedLayout?.drawings?.trendEnd ? String(savedLayout.drawings.trendEnd) : '');
  const apiBaseUrl = getBrokerApiBase();
  const intervalConfig = getIntervalConfig(interval);

  useEffect(() => {
    if (['1m', '3m', '5m', '10m'].includes(interval) && !['1d', '5d'].includes(range)) {
      setRange('1d');
      return;
    }
    if (['15m', '30m'].includes(interval) && !['1d', '5d', '1mo'].includes(range)) {
      setRange('5d');
      return;
    }
    if (['60m', '180m'].includes(interval) && !['1d', '5d', '1mo', '3mo'].includes(range)) {
      setRange('1mo');
      return;
    }
    if (interval === '1w' && range === '1d') {
      setRange('3mo');
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
      showAppearance,
      chartType,
      drawMode,
      priceZoom,
      chartStyle,
      markerVisibility,
      compareSymbol,
      toggles,
      drawings: {
        horizontalLine: horizontalLineInput ? Number(horizontalLineInput) : null,
        trendStart: trendStartInput ? Number(trendStartInput) : null,
        trendEnd: trendEndInput ? Number(trendEndInput) : null,
      },
    });
  }, [autoRefresh, chartStyle, chartType, compareSymbol, drawMode, expanded, horizontalLineInput, interval, markerVisibility, priceZoom, range, showAppearance, showTools, stock?.id, toggles, trendEndInput, trendStartInput]);

  useEffect(() => {
    if (!fullWindow) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fullWindow]);

  useEffect(() => {
    if (!chartViewportRef.current || typeof ResizeObserver === 'undefined') return undefined;

    const updateSize = () => {
      setChartViewportWidth(chartViewportRef.current?.clientWidth || 0);
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(chartViewportRef.current);
    return () => observer.disconnect();
  }, [fullWindow, expanded]);

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
  const priceChange = latestPoint && renderedData.length > 1
    ? latestPoint.close - (renderedData[renderedData.length - 2]?.close ?? latestPoint.open ?? latestPoint.close)
    : 0;
  const priceChangePercent = latestPoint?.close
    ? (priceChange / ((renderedData[renderedData.length - 2]?.close ?? latestPoint.open ?? latestPoint.close) || latestPoint.close)) * 100
    : 0;
  const ohlcSummary = latestPoint ? [
    `O ${formatCurrency(latestPoint.open, mainQuery.data?.currency || 'INR')}`,
    `H ${formatCurrency(latestPoint.high, mainQuery.data?.currency || 'INR')}`,
    `L ${formatCurrency(latestPoint.low, mainQuery.data?.currency || 'INR')}`,
    `C ${formatCurrency(latestPoint.close, mainQuery.data?.currency || 'INR')}`,
  ] : [];
  const indicatorLegend = [
    toggles.sma20 && latestPoint?.sma20 ? { label: 'SMA 20', tone: chartStyle.sma20Color } : null,
    toggles.sma50 && latestPoint?.sma50 ? { label: 'SMA 50', tone: chartStyle.sma50Color } : null,
    toggles.sma200 && latestPoint?.sma200 ? { label: 'SMA 200', tone: chartStyle.sma200Color } : null,
    toggles.vwap && latestPoint?.vwap ? { label: 'VWAP', tone: chartStyle.vwapColor } : null,
    toggles.rsi && latestPoint?.rsi14 ? { label: 'RSI', tone: '#FB7185' } : null,
  ].filter(Boolean);
  const effectiveToggles = useMemo(() => {
    if (chartType === 'line') return toggles;
    return {
      ...toggles,
      bollinger: showAppearance ? toggles.bollinger : false,
      fibonacci: false,
      compare: showTools ? toggles.compare : false,
    };
  }, [chartType, showAppearance, showTools, toggles]);
  const priceMarkers = [
    markerVisibility.last && latestPoint?.close ? { key: 'last', value: latestPoint.close, color: latestPoint.close >= latestPoint.open ? chartStyle.bullishColor : chartStyle.bearishColor, label: 'Last' } : null,
    markerVisibility.sma20 && effectiveToggles.sma20 && latestPoint?.sma20 ? { key: 'sma20', value: latestPoint.sma20, color: chartStyle.sma20Color, label: 'SMA20' } : null,
    markerVisibility.sma50 && effectiveToggles.sma50 && latestPoint?.sma50 ? { key: 'sma50', value: latestPoint.sma50, color: chartStyle.sma50Color, label: 'SMA50' } : null,
    markerVisibility.sma200 && effectiveToggles.sma200 && latestPoint?.sma200 ? { key: 'sma200', value: latestPoint.sma200, color: chartStyle.sma200Color, label: 'SMA200' } : null,
    markerVisibility.vwap && effectiveToggles.vwap && latestPoint?.vwap ? { key: 'vwap', value: latestPoint.vwap, color: chartStyle.vwapColor, label: 'VWAP' } : null,
    markerVisibility.pivot && effectiveToggles.pivots && pivots?.pivot ? { key: 'pivot', value: pivots.pivot, color: '#F59E0B', label: 'Pivot' } : null,
    markerVisibility.level && horizontalLine ? { key: 'level', value: horizontalLine, color: '#60A5FA', label: 'Level', draggable: true } : null,
  ].filter(Boolean);

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
  const updateChartStyle = (key, value) => setChartStyle((current) => ({ ...current, [key]: value }));
  const handleMarkerDragStart = (event, marker) => {
    if (!marker?.draggable || !chartViewportRef.current || !Array.isArray(priceDomain)) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = chartViewportRef.current.getBoundingClientRect();
    const [min, max] = priceDomain;
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
    const topPadding = 10;
    const bottomPadding = 26;
    const usableHeight = Math.max(bounds.height - topPadding - bottomPadding, 1);

    const onMove = (moveEvent) => {
      const relativeY = Math.min(Math.max(moveEvent.clientY - bounds.top - topPadding, 0), usableHeight);
      const price = max - ((relativeY / usableHeight) * (max - min));
      setHorizontalLineInput(String(Number(price).toFixed(2)));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const quickToolAction = (mode) => {
    setDrawMode(mode);
    setShowTools(true);
    if (!latestPoint) return;
    if (mode === 'hline' && !horizontalLineInput) {
      setHorizontalLineInput(String(Number(latestPoint.close).toFixed(2)));
    }
    if (mode === 'trend' && (!trendStartInput || !trendEndInput)) {
      setTrendStartInput(String(Number(latestPoint.low ?? latestPoint.close).toFixed(2)));
      setTrendEndInput(String(Number(latestPoint.high ?? latestPoint.close).toFixed(2)));
    }
    if (mode === 'compare' && !toggles.compare) {
      setToggles((current) => ({ ...current, compare: true }));
    }
  };

  return (
    <section className={fullWindow ? 'fixed inset-2 z-[80] overflow-y-auto rounded-[28px] border border-white/10 bg-[#0a1018]/98 p-4 shadow-[0_24px_120px_rgba(0,0,0,0.52)]' : 'rounded-[28px] border border-white/10 bg-[#0a1018]/95 p-4 shadow-[0_20px_56px_rgba(0,0,0,0.24)]'}>
      <div className="flex flex-col gap-3">
        <div className="rounded-[22px] border border-white/8 bg-[#0b1119] px-3 py-2.5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-2xl bg-amber-300/12 px-3 py-1.5 text-sm font-semibold text-amber-200">{stock.symbol}</div>
                <p className="truncate text-sm text-slate-300">{stock.name}</p>
                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{stock.exchange || 'NSE'} · {range.toUpperCase()}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                <span>Source <span className="font-semibold uppercase tracking-[0.12em] text-amber-300">{mainQuery.data?.source || '--'}</span></span>
                <span>Last <span className="font-semibold text-white">{latestPoint?.close ? formatCurrency(latestPoint.close, mainQuery.data?.currency || 'INR') : '--'}</span></span>
                <span className={priceChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {priceChange >= 0 ? '+' : ''}{formatCurrency(priceChange, mainQuery.data?.currency || 'INR')} ({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                </span>
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
                    className="h-9 rounded-2xl border-white/10 bg-white/5"
                  />
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowTools((value) => !value)}
                className={`h-9 rounded-2xl border-white/10 px-3 text-xs ${showTools ? 'bg-white/10 text-white' : 'bg-white/5 text-slate-200'} hover:bg-white/10`}
              >
                Tools
                <ChevronDown className={`h-4 w-4 transition ${showTools ? 'rotate-180' : ''}`} />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAppearance((value) => !value)}
                className={`h-9 rounded-2xl border-white/10 px-3 text-xs ${showAppearance ? 'bg-white/10 text-white' : 'bg-white/5 text-slate-200'} hover:bg-white/10`}
              >
                Style
                <ChevronDown className={`h-4 w-4 transition ${showAppearance ? 'rotate-180' : ''}`} />
              </Button>
              <Button type="button" variant="outline" onClick={() => setFullWindow((value) => !value)} className="h-9 rounded-2xl border-white/10 px-3 text-xs bg-white/5 text-white hover:bg-white/10">
                {fullWindow ? 'Exit Full Window' : 'Full Window'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setExpanded((value) => !value)} className="h-9 rounded-2xl border-white/10 px-3 text-xs bg-white/5 text-white hover:bg-white/10">
                {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                {expanded ? 'Compact' : 'Expand'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setPriceZoom((value) => Math.min(Number((value * 1.35).toFixed(2)), 8))} className="h-9 rounded-2xl border-white/10 px-3 text-xs bg-white/5 text-white hover:bg-white/10">
                <ZoomIn className="h-4 w-4" />
                Y+
              </Button>
              <Button type="button" variant="outline" onClick={() => setPriceZoom((value) => Math.max(Number((value / 1.35).toFixed(2)), 0.45))} className="h-9 rounded-2xl border-white/10 px-3 text-xs bg-white/5 text-white hover:bg-white/10">
                <ZoomOut className="h-4 w-4" />
                Y-
              </Button>
              <Button type="button" variant="outline" onClick={() => setPriceZoom(1)} className="h-9 rounded-2xl border-white/10 px-3 text-xs bg-white/5 text-white hover:bg-white/10">
                Reset Y
              </Button>
              <Button type="button" variant="outline" onClick={exportChart} className="h-9 rounded-2xl border-white/10 px-3 text-xs bg-white/5 text-white hover:bg-white/10">
                <Download className="h-4 w-4" />
                Export
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAutoRefresh((value) => !value)}
                className={`h-9 rounded-2xl border-white/10 px-3 text-xs ${autoRefresh ? 'bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/20' : 'bg-white/5 text-white hover:bg-white/10'}`}
              >
                {autoRefresh ? 'Auto On' : 'Auto Off'}
              </Button>
              <Button type="button" variant="outline" onClick={() => { mainQuery.refetch(); compareQueries.forEach((query) => query.refetch?.()); }} className="h-9 rounded-2xl border-white/10 px-3 text-xs bg-white/5 text-white hover:bg-white/10">
                <RefreshCw className={`h-4 w-4 ${(mainQuery.isFetching || compareQueries.some((query) => query.isFetching)) ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-white/8 bg-[#0b1119] px-3 py-2.5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0f1723] px-2 py-1.5">
                <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Range</span>
                <select
                  value={range}
                  onChange={(event) => setRange(event.target.value)}
                  className="h-7 rounded-xl border border-white/10 bg-[#111a27] px-2 text-xs text-white outline-none"
                >
                  {RANGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0f1723] px-2 py-1.5">
                <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Interval</span>
                <select
                  value={interval}
                  onChange={(event) => setInterval(event.target.value)}
                  className="h-7 rounded-xl border border-white/10 bg-[#111a27] px-2 text-xs text-white outline-none"
                >
                  {INTERVAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-[#0f1723] p-1">
                {CHART_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setChartType(option.value)}
                    className={`h-7 rounded-xl px-2.5 text-[11px] font-medium transition ${
                      chartType === option.value
                        ? 'bg-white/12 text-white'
                        : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
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
                  className={`h-7 rounded-2xl border-white/10 px-2.5 text-[11px] ${toggles[key] ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-transparent text-slate-500 hover:bg-white/5'}`}
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

        {showAppearance ? (
          <div className="grid gap-3 rounded-[24px] border border-white/8 bg-[#0b1119] p-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['bullishColor', 'Bull'],
              ['bearishColor', 'Bear'],
              ['sma20Color', 'SMA20'],
              ['sma50Color', 'SMA50'],
              ['sma200Color', 'SMA200'],
              ['vwapColor', 'VWAP'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
                <span>{label}</span>
                <input type="color" value={chartStyle[key]} onChange={(event) => updateChartStyle(key, event.target.value)} className="h-8 w-12 rounded border border-white/10 bg-transparent" />
              </label>
            ))}
            <label className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              <span>Candle Width</span>
              <input type="range" min="0.4" max="0.95" step="0.05" value={chartStyle.candleWidth} onChange={(event) => updateChartStyle('candleWidth', Number(event.target.value))} />
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              <span>Candle Sharpness</span>
              <input type="range" min="1" max="2.4" step="0.1" value={chartStyle.candleSharpness} onChange={(event) => updateChartStyle('candleSharpness', Number(event.target.value))} />
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              <span>Line Thickness</span>
              <input type="range" min="1" max="4" step="0.25" value={chartStyle.lineWidth} onChange={(event) => updateChartStyle('lineWidth', Number(event.target.value))} />
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              <span>SMA20 Thickness</span>
              <input type="range" min="1" max="4" step="0.1" value={chartStyle.sma20Width} onChange={(event) => updateChartStyle('sma20Width', Number(event.target.value))} />
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              <span>SMA50 Thickness</span>
              <input type="range" min="1" max="4" step="0.1" value={chartStyle.sma50Width} onChange={(event) => updateChartStyle('sma50Width', Number(event.target.value))} />
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              <span>SMA200 Thickness</span>
              <input type="range" min="1" max="4" step="0.1" value={chartStyle.sma200Width} onChange={(event) => updateChartStyle('sma200Width', Number(event.target.value))} />
            </label>
            <label className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              <span>VWAP Thickness</span>
              <input type="range" min="1" max="4" step="0.1" value={chartStyle.vwapWidth} onChange={(event) => updateChartStyle('vwapWidth', Number(event.target.value))} />
            </label>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 md:col-span-2 xl:col-span-4">
              <p className="mb-2 font-medium text-white">Price Markers</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ['last', 'Last'],
                  ['sma20', 'SMA20'],
                  ['sma50', 'SMA50'],
                  ['sma200', 'SMA200'],
                  ['vwap', 'VWAP'],
                  ['pivot', 'Pivot'],
                  ['level', 'Level'],
                ].map(([key, label]) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    onClick={() => setMarkerVisibility((current) => ({ ...current, [key]: !current[key] }))}
                    className={`h-8 rounded-2xl border-white/10 px-3 text-[11px] ${markerVisibility[key] ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-transparent text-slate-500 hover:bg-white/5'}`}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div ref={chartWrapRef} className="rounded-[24px] border border-white/8 bg-[#04070c] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/6 pb-2 text-[11px] text-slate-400">
            <span className="font-semibold text-slate-200">{stock.symbol}</span>
            <span>{interval.toUpperCase()} · {mainQuery.data?.marketSymbol || stock.symbol}</span>
            {ohlcSummary.map((item) => (
              <span key={item} className="text-slate-300">{item}</span>
            ))}
            <span className={priceChange >= 0 ? 'font-semibold text-emerald-300' : 'font-semibold text-rose-300'}>
              {priceChange >= 0 ? '+' : ''}{formatCurrency(priceChange, mainQuery.data?.currency || 'INR')} ({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
            </span>
          </div>
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
                ref={chartViewportRef}
                className="relative select-none cursor-ns-resize pl-0 md:pl-14"
                onMouseDown={startDragZoom}
                onWheel={handleWheelZoom}
                onDoubleClick={() => setPriceZoom(1)}
                role="presentation"
              >
                <div className="absolute left-0 top-2 z-10 hidden flex-col gap-2 md:flex">
                  {[
                    { id: 'cursor', label: 'Cur' },
                    { id: 'hline', label: 'H' },
                    { id: 'trend', label: 'T' },
                    { id: 'compare', label: 'Cmp' },
                  ].map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        quickToolAction(tool.id);
                      }}
                      className={`flex h-9 min-w-[40px] items-center justify-center rounded-2xl border text-[11px] font-semibold transition ${
                        drawMode === tool.id
                          ? 'border-cyan-300/60 bg-cyan-300/15 text-cyan-100'
                          : 'border-white/10 bg-[#0b1119]/90 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {tool.label}
                    </button>
                  ))}
                </div>
                {indicatorLegend.length ? (
                  <div className="pointer-events-none absolute left-0 top-2 z-10 hidden max-w-[60%] flex-wrap gap-2 md:flex md:left-14">
                    {indicatorLegend.map((item) => (
                      <div key={item.label} className="rounded-xl border border-white/10 bg-[#0b1119]/88 px-2.5 py-1 text-[11px] text-slate-200 backdrop-blur">
                        <span style={{ color: item.tone }} className="font-semibold">{item.label}</span>
                        <span className="ml-2 text-slate-300">{item.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {chartType !== 'line' ? (
                  <CandleOverlay
                    data={renderedData}
                    domain={priceDomain}
                    width={chartViewportWidth}
                    height={chartHeight}
                    mode={chartType}
                    style={chartStyle}
                  />
                ) : null}
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
                    {effectiveToggles.pivots && pivots ? (
                      <>
                        <ReferenceLine y={pivots.pivot} stroke="rgba(245,158,11,0.55)" strokeDasharray="5 5" />
                        <ReferenceLine y={pivots.r1} stroke="rgba(16,185,129,0.35)" strokeDasharray="4 4" />
                        <ReferenceLine y={pivots.s1} stroke="rgba(244,63,94,0.35)" strokeDasharray="4 4" />
                      </>
                    ) : null}
                    {effectiveToggles.fibonacci && fib ? fib.levels.map((level) => (
                      <ReferenceLine key={level.label} y={level.value} stroke="rgba(148,163,184,0.32)" strokeDasharray="3 5" />
                    )) : null}
                    {latestPoint?.close ? <ReferenceLine y={latestPoint.close} stroke={latestPoint.close >= latestPoint.open ? chartStyle.bullishColor : chartStyle.bearishColor} strokeDasharray="3 4" strokeWidth={1.2} /> : null}
                    {horizontalLine ? <ReferenceLine y={horizontalLine} stroke="rgba(96,165,250,0.75)" strokeDasharray="7 4" /> : null}
                    {effectiveToggles.bollinger ? (
                      <>
                        <Line type="monotone" dataKey="bollingerUpper" stroke={chartStyle.bollingerColor} strokeWidth={1.2} dot={false} connectNulls />
                        <Line type="monotone" dataKey="bollingerLower" stroke={chartStyle.bollingerColor} strokeWidth={1.2} dot={false} connectNulls />
                      </>
                    ) : null}
                    {effectiveToggles.sma20 ? <Line type="monotone" dataKey="sma20" stroke={chartStyle.sma20Color} strokeWidth={chartStyle.sma20Width} dot={false} connectNulls /> : null}
                    {effectiveToggles.sma50 ? <Line type="monotone" dataKey="sma50" stroke={chartStyle.sma50Color} strokeWidth={chartStyle.sma50Width} dot={false} connectNulls /> : null}
                    {effectiveToggles.sma200 ? <Line type="monotone" dataKey="sma200" stroke={chartStyle.sma200Color} strokeWidth={chartStyle.sma200Width} dot={false} connectNulls /> : null}
                    {effectiveToggles.vwap ? <Line type="monotone" dataKey="vwap" stroke={chartStyle.vwapColor} strokeWidth={chartStyle.vwapWidth} dot={false} connectNulls /> : null}
                    {effectiveToggles.compare ? compareSymbols.map((symbol, index) => (
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
                    {chartType === 'line' ? (
                      <Line type="monotone" dataKey="close" stroke={chartStyle.lineColor} strokeWidth={chartStyle.lineWidth} dot={false} connectNulls isAnimationActive={false} />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute bottom-12 right-1 z-10 flex flex-col gap-1">
                  {priceMarkers.map((marker) => (
                    <button
                      key={marker.key}
                      type="button"
                      onMouseDown={(event) => handleMarkerDragStart(event, marker)}
                      className={`pointer-events-auto flex min-w-[92px] items-center justify-between rounded-l-xl border border-white/10 px-2 py-1 text-[11px] font-semibold text-white shadow-[0_6px_18px_rgba(0,0,0,0.28)] ${marker.draggable ? 'cursor-ns-resize' : 'cursor-default'}`}
                      style={{ backgroundColor: marker.color }}
                    >
                      <span>{marker.label}</span>
                      <span>{formatCurrency(marker.value, mainQuery.data?.currency || 'INR').replace('.00', '')}</span>
                    </button>
                  ))}
                </div>
              </div>

              {effectiveToggles.volume ? (
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

              {effectiveToggles.rsi ? (
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

              {effectiveToggles.macd ? (
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

              <div className="flex flex-wrap items-center gap-2 border-t border-white/6 pt-3">
                {RANGE_OPTIONS.map((option) => (
                  <Button
                    key={`footer-${option.value}`}
                    type="button"
                    variant="ghost"
                    onClick={() => setRange(option.value)}
                    className={`h-7 rounded-xl px-2.5 text-[11px] ${range === option.value ? 'bg-white/10 text-white' : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'}`}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
