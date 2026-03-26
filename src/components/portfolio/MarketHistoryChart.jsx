import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Bar, Cell, ComposedChart, CartesianGrid, Customized, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Maximize2, Minimize2, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
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
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: '3Y', value: '3y' },
  { label: '5Y', value: '5y' },
  { label: 'YTD', value: 'ytd' },
  { label: 'ALL', value: 'max' },
];

const INTERVAL_OPTIONS = [
  { label: '1m', value: '1m' },
  { label: '3m', value: '3m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1h', value: '60m' },
  { label: '3h', value: '180m' },
  { label: '1D', value: '1d' },
  { label: '1M', value: '1mo' },
];

const DEFAULT_TOGGLES = {
  ema9: true,
  ema21: true,
  sma20: true,
  sma50: true,
  sma200: true,
  bollinger: true,
  pivots: true,
  fibonacci: true,
  rsi: true,
  macd: true,
  stochastic: true,
  vwap: true,
  volume: true,
  compare: true,
};

const DEFAULT_SMA_COLORS = {
  ema9: '#F59E0B',
  ema21: '#60A5FA',
  sma20: '#22D3EE',
  sma50: '#C084FC',
  sma200: '#34D399',
};

const DEFAULT_ALERTS = {
  sma20: true,
  vwap: true,
  pivot: true,
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
  const highs = points.map((point) => Number(point.high));
  const lows = points.map((point) => Number(point.low));
  let cumulativeVolume = 0;
  let cumulativeVolumePrice = 0;
  let ema9 = null;
  let ema12 = null;
  let ema21 = null;
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
    ema9 = ema(ema9, Number(point.close), 9);
    ema12 = ema(ema12, Number(point.close), 12);
    ema21 = ema(ema21, Number(point.close), 21);
    ema26 = ema(ema26, Number(point.close), 26);
    const macdLine = ema12 !== null && ema26 !== null ? ema12 - ema26 : null;
    signal = macdLine === null ? signal : ema(signal, macdLine, 9);

    return {
      ...point,
      ema9,
      ema21,
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
      stochasticK: null,
      stochasticD: null,
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

  for (let index = 13; index < closes.length; index += 1) {
    const highWindow = highs.slice(index - 13, index + 1);
    const lowWindow = lows.slice(index - 13, index + 1);
    const highestHigh = Math.max(...highWindow);
    const lowestLow = Math.min(...lowWindow);
    const denominator = highestHigh - lowestLow;
    const k = denominator === 0 ? 50 : ((closes[index] - lowestLow) / denominator) * 100;
    enriched[index].stochasticK = Number(k.toFixed(2));

    const recentK = enriched
      .slice(Math.max(0, index - 2), index + 1)
      .map((item) => item.stochasticK)
      .filter((value) => value !== null);
    if (recentK.length === 3) {
      enriched[index].stochasticD = Number(average(recentK).toFixed(2));
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

function buildHeikinAshi(points = []) {
  let previousOpen = null;
  let previousClose = null;

  return points.map((point) => {
    const haClose = Number(((point.open + point.high + point.low + point.close) / 4).toFixed(2));
    const haOpen = Number((((previousOpen ?? point.open) + (previousClose ?? point.close)) / 2).toFixed(2));
    const haHigh = Math.max(point.high, haOpen, haClose);
    const haLow = Math.min(point.low, haOpen, haClose);

    previousOpen = haOpen;
    previousClose = haClose;

    return {
      ...point,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      bullish: haClose >= haOpen,
    };
  });
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
    case '1d':
      return { requestInterval: 'day', aggregate: 1, refreshMs: 180000 };
    case '1mo':
      return { requestInterval: 'month', aggregate: 1, refreshMs: 300000 };
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
    x, width, yAxis, payload, chartType = 'candles',
  } = props;

  if (!payload || !yAxis?.scale) return null;

  const resolvedWidth = Number.isFinite(width) && width > 0 ? width : 12;
  const candleWidth = Math.max(4, Math.min(resolvedWidth * 0.66, 12));
  const centerX = x + (resolvedWidth / 2);
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
        fill={chartType === 'hollow' && payload.bullish ? 'transparent' : color}
        stroke={color}
        strokeWidth={1.3}
      />
    </g>
  );
}

function CandlesLayer({
  chartType = 'candles',
  data = [],
  xAxisMap,
  yAxisMap,
}) {
  const xAxis = Object.values(xAxisMap || {})[0];
  const yAxis = Object.values(yAxisMap || {})[0];
  const xScale = xAxis?.scale;
  const yScale = yAxis?.scale;

  if (!xScale || !yScale || !data.length) return null;

  const bandwidth = typeof xScale.bandwidth === 'function' ? xScale.bandwidth() : 12;
  const candleWidth = Math.max(4, Math.min(bandwidth * 0.55, 14));

  return (
    <g>
      {data.map((point) => {
        const xValue = xScale(point.label);
        if (xValue === undefined) return null;

        const centerX = xValue + (bandwidth / 2);
        const openY = yScale(point.open);
        const closeY = yScale(point.close);
        const highY = yScale(point.high);
        const lowY = yScale(point.low);
        const bodyY = Math.min(openY, closeY);
        const bodyHeight = Math.max(1, Math.abs(closeY - openY));
        const color = point.bullish ? '#10B981' : '#F43F5E';

        return (
          <g key={`candle-${point.date}`}>
            <line x1={centerX} x2={centerX} y1={highY} y2={lowY} stroke={color} strokeWidth={1.2} />
            <rect
              x={centerX - (candleWidth / 2)}
              y={bodyY}
              width={candleWidth}
              height={bodyHeight}
              rx={1.5}
              fill={chartType === 'hollow' && point.bullish ? 'transparent' : color}
              stroke={color}
              strokeWidth={1.2}
            />
          </g>
        );
      })}
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
      {point.stochasticK !== null ? <p className="text-fuchsia-300">Stoch %K {point.stochasticK.toFixed(2)}</p> : null}
      {point.stochasticD !== null ? <p className="text-amber-200">Stoch %D {point.stochasticD.toFixed(2)}</p> : null}
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
  const [priceZoom, setPriceZoom] = useState(savedLayout?.priceZoom ?? 1);
  const [chartType, setChartType] = useState(savedLayout?.chartType || 'candles');
  const [smaColors, setSmaColors] = useState({ ...DEFAULT_SMA_COLORS, ...(savedLayout?.smaColors || {}) });
  const [toggles, setToggles] = useState({ ...DEFAULT_TOGGLES, ...(savedLayout?.toggles || {}) });
  const [searchInput, setSearchInput] = useState(stock?.symbol || '');
  const [compareInput, setCompareInput] = useState(savedLayout?.compareSymbol || '');
  const [compareSymbol, setCompareSymbol] = useState(savedLayout?.compareSymbol || '');
  const [horizontalLineInput, setHorizontalLineInput] = useState(savedLayout?.drawings?.horizontalLine ? String(savedLayout.drawings.horizontalLine) : '');
  const [trendStartInput, setTrendStartInput] = useState(savedLayout?.drawings?.trendStart ? String(savedLayout.drawings.trendStart) : '');
  const [trendEndInput, setTrendEndInput] = useState(savedLayout?.drawings?.trendEnd ? String(savedLayout.drawings.trendEnd) : '');
  const [alerts, setAlerts] = useState({ ...DEFAULT_ALERTS, ...(savedLayout?.alerts || {}) });
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
      return;
    }
    if (['1d', '1mo'].includes(interval) && !['1mo', '3mo', '6mo', '1y', '3y', '5y', 'ytd', 'max'].includes(range)) {
      setRange(interval === '1mo' ? '1y' : '6mo');
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
      priceZoom,
      chartType,
      smaColors,
      compareSymbol,
      toggles,
      drawings: {
        horizontalLine: horizontalLineInput ? Number(horizontalLineInput) : null,
        trendStart: trendStartInput ? Number(trendStartInput) : null,
        trendEnd: trendEndInput ? Number(trendEndInput) : null,
      },
      alerts,
    });
  }, [alerts, autoRefresh, chartType, compareSymbol, expanded, horizontalLineInput, interval, priceZoom, range, smaColors, stock?.id, toggles, trendEndInput, trendStartInput]);

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
  const transformedData = useMemo(
    () => (chartType === 'heikin' ? buildHeikinAshi(comparedData) : comparedData),
    [chartType, comparedData],
  );
  const chartData = useMemo(() => buildIndicators(transformedData), [transformedData]);
  const pivots = buildPivotLevels(chartData);
  const fib = buildFibonacciLevels(chartData);
  const latestPoint = chartData[chartData.length - 1];

  const indicatorSummary = [
    { label: 'Last', value: latestPoint?.close, tone: 'text-amber-300' },
    { label: 'EMA 9', value: latestPoint?.ema9, tone: 'text-amber-300' },
    { label: 'EMA 21', value: latestPoint?.ema21, tone: 'text-sky-300' },
    { label: 'SMA 20', value: latestPoint?.sma20, tone: 'text-cyan-300' },
    { label: 'SMA 50', value: latestPoint?.sma50, tone: 'text-violet-300' },
    { label: 'SMA 200', value: latestPoint?.sma200, tone: 'text-emerald-300' },
    { label: 'VWAP', value: latestPoint?.vwap, tone: 'text-sky-300' },
    { label: 'RSI 14', value: latestPoint?.rsi14, tone: 'text-rose-300', raw: true },
    { label: 'Stoch %K', value: latestPoint?.stochasticK, tone: 'text-fuchsia-300', raw: true },
    { label: 'Pivot', value: pivots?.pivot, tone: 'text-slate-200' },
  ];

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
  const chartHeight = fullWindow ? 760 : expanded ? 620 : 420;
  const previousPoint = chartData[chartData.length - 2];
  const alertSignals = [
    alerts.sma20 && latestPoint?.sma20 && previousPoint
      ? {
          id: 'sma20',
          title: 'SMA 20',
          active: (previousPoint.close <= previousPoint.sma20 && latestPoint.close > latestPoint.sma20) || (previousPoint.close >= previousPoint.sma20 && latestPoint.close < latestPoint.sma20),
          detail: `Price ${latestPoint.close >= latestPoint.sma20 ? 'above' : 'below'} SMA 20 at ${formatCurrency(latestPoint.sma20, mainQuery.data?.currency || 'INR')}`,
        }
      : null,
    alerts.vwap && latestPoint?.vwap && previousPoint
      ? {
          id: 'vwap',
          title: 'VWAP',
          active: (previousPoint.close <= previousPoint.vwap && latestPoint.close > latestPoint.vwap) || (previousPoint.close >= previousPoint.vwap && latestPoint.close < latestPoint.vwap),
          detail: `Price ${latestPoint.close >= latestPoint.vwap ? 'above' : 'below'} VWAP at ${formatCurrency(latestPoint.vwap, mainQuery.data?.currency || 'INR')}`,
        }
      : null,
    alerts.pivot && pivots && previousPoint
      ? {
          id: 'pivot',
          title: 'Pivot',
          active: (previousPoint.close <= pivots.pivot && latestPoint.close > pivots.pivot) || (previousPoint.close >= pivots.pivot && latestPoint.close < pivots.pivot),
          detail: `Price ${latestPoint.close >= pivots.pivot ? 'above' : 'below'} pivot at ${formatCurrency(pivots.pivot, mainQuery.data?.currency || 'INR')}`,
        }
      : null,
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

  return (
    <section className={fullWindow ? 'fixed inset-3 z-[80] overflow-y-auto rounded-[32px] border border-white/10 bg-[#0a1018]/98 p-6 shadow-[0_24px_120px_rgba(0,0,0,0.52)]' : 'rounded-[32px] border border-white/10 bg-[#0a1018]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]'}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-300/12 px-3 py-2 text-sm font-semibold text-amber-200">{stock.symbol}</div>
              <p className="text-sm text-slate-400">{stock.name}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-400">
              <span>Data source <span className="font-semibold uppercase tracking-[0.12em] text-amber-300">{mainQuery.data?.source || '--'}</span></span>
              <span>Symbol <span className="text-slate-200">{mainQuery.data?.marketSymbol || stock.symbol}</span></span>
              <span>Auto refresh <span className={autoRefresh ? 'text-emerald-300' : 'text-slate-500'}>{autoRefresh ? 'On' : 'Off'}</span></span>
              <span>Y zoom <span className="text-slate-200">{priceZoom.toFixed(2)}x</span></span>
              <span>Chart <span className="text-slate-200 capitalize">{chartType}</span></span>
              {compareSymbols.length ? <span>Compare <span className="text-cyan-200">{compareSymbols.join(', ')}</span></span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onStockSelect ? (
              <div className="w-full min-w-[280px] max-w-md">
                <StockAutocompleteInput
                  value={searchInput}
                  onChange={setSearchInput}
                  onSelect={(item) => {
                    setSearchInput(item.symbol);
                    onStockSelect(item);
                  }}
                  placeholder="Search stock to open chart"
                  className="h-11 rounded-2xl border-white/10 bg-white/5"
                />
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => setFullWindow((value) => !value)}
              className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              {fullWindow ? 'Exit Full Window' : 'Full Window'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setExpanded((value) => !value)}
              className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              {expanded ? 'Collapse' : 'Expand'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPriceZoom((value) => Math.min(Number((value * 1.35).toFixed(2)), 8))}
              className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              <ZoomIn className="h-4 w-4" />
              Y+
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPriceZoom((value) => Math.max(Number((value / 1.35).toFixed(2)), 0.45))}
              className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              <ZoomOut className="h-4 w-4" />
              Y-
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPriceZoom(1)}
              className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
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
              {autoRefresh ? 'Auto Refresh On' : 'Auto Refresh Off'}
            </Button>
            <Button type="button" variant="outline" onClick={() => { mainQuery.refetch(); compareQueries.forEach((query) => query.refetch?.()); }} className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
              <RefreshCw className={`h-4 w-4 ${(mainQuery.isFetching || compareQueries.some((query) => query.isFetching)) ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                onClick={() => setRange(option.value)}
                className={`rounded-2xl border-white/10 ${range === option.value ? 'bg-amber-300 text-slate-950 hover:bg-amber-200' : 'bg-white/5 text-white hover:bg-white/10'}`}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {INTERVAL_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                onClick={() => setInterval(option.value)}
                className={`rounded-2xl border-white/10 ${interval === option.value ? 'bg-cyan-300 text-slate-950 hover:bg-cyan-200' : 'bg-white/5 text-white hover:bg-white/10'}`}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {indicatorSummary.map((item) => (
            <div key={item.label} className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
              <p className={`mt-2 text-sm font-semibold ${item.tone}`}>
                {item.value === null || item.value === undefined
                  ? 'Need data'
                  : item.raw
                    ? item.value.toFixed(2)
                    : formatCurrency(item.value, mainQuery.data?.currency || 'INR')}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-medium text-white">Alert Engine</p>
              <p className="mt-1 text-sm text-slate-400">Watch for price crossing SMA 20, VWAP, and pivot levels on the live chart.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ['sma20', 'SMA 20'],
                ['vwap', 'VWAP'],
                ['pivot', 'Pivot'],
              ].map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
                  onClick={() => setAlerts((current) => ({ ...current, [key]: !current[key] }))}
                  className={`rounded-2xl border-white/10 ${alerts[key] ? 'bg-amber-300 text-slate-950 hover:bg-amber-200' : 'bg-white/5 text-white hover:bg-white/10'}`}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {alertSignals.length ? alertSignals.map((signal) => (
              <div key={signal.id} className={`rounded-2xl border px-4 py-3 ${signal.active ? 'border-emerald-300/30 bg-emerald-300/10' : 'border-white/8 bg-[#111821]'}`}>
                <p className="text-sm font-medium text-white">{signal.title}</p>
                <p className={`mt-2 text-sm ${signal.active ? 'text-emerald-200' : 'text-slate-400'}`}>{signal.detail}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">{signal.active ? 'Triggered now' : 'Monitoring'}</p>
              </div>
            )) : (
              <div className="rounded-2xl border border-white/8 bg-[#111821] px-4 py-3 text-sm text-slate-400">
                Enable an alert above and load enough data to monitor price crossings.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              ['candles', 'Candles'],
              ['hollow', 'Hollow'],
              ['heikin', 'Heikin Ashi'],
              ['line', 'Line'],
            ].map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant="outline"
                onClick={() => setChartType(value)}
                className={`rounded-2xl border-white/10 ${chartType === value ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-transparent text-slate-500 hover:bg-white/5'}`}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {[
              ['ema9', 'EMA 9'],
              ['ema21', 'EMA 21'],
              ['sma20', 'SMA 20'],
              ['sma50', 'SMA 50'],
              ['sma200', 'SMA 200'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                <span>{label}</span>
                <input
                  type="color"
                  value={smaColors[key]}
                  onChange={(event) => setSmaColors((current) => ({ ...current, [key]: event.target.value }))}
                  className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              ['ema9', 'EMA 9'],
              ['ema21', 'EMA 21'],
              ['sma20', 'SMA 20'],
              ['sma50', 'SMA 50'],
              ['sma200', 'SMA 200'],
              ['bollinger', 'Bollinger'],
              ['pivots', 'Pivot'],
              ['fibonacci', 'Fib'],
              ['rsi', 'RSI'],
              ['macd', 'MACD'],
              ['stochastic', 'Stochastic'],
              ['vwap', 'VWAP'],
              ['volume', 'Volume'],
              ['compare', 'Compare'],
            ].map(([key, label]) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                onClick={() => handleToggle(key)}
                className={`rounded-2xl border-white/10 ${toggles[key] ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-transparent text-slate-500 hover:bg-white/5'}`}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex w-full max-w-xl gap-2">
            <Input
              value={compareInput}
              onChange={(event) => setCompareInput(event.target.value.toUpperCase())}
              placeholder="Compare symbol like INFY or RELIANCE"
              className="h-11 rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-slate-500"
            />
            <Button
              type="button"
              onClick={() => setCompareSymbol(compareInput.trim().toUpperCase())}
              className="rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            >
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
        </div>

        <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr_auto]">
          <Input
            value={horizontalLineInput}
            onChange={(event) => setHorizontalLineInput(event.target.value)}
            placeholder="Horizontal line price"
            className="h-11 rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-slate-500"
          />
          <Input
            value={trendStartInput}
            onChange={(event) => setTrendStartInput(event.target.value)}
            placeholder="Trend start price"
            className="h-11 rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-slate-500"
          />
          <Input
            value={trendEndInput}
            onChange={(event) => setTrendEndInput(event.target.value)}
            placeholder="Trend end price"
            className="h-11 rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-slate-500"
          />
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
            Clear Drawings
          </Button>
        </div>

        <div ref={chartWrapRef} className="rounded-[28px] border border-white/8 bg-[#060b12] p-4">
          <div className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>Drag up or down on the main chart to zoom the Y-axis.</span>
            <span>Mouse wheel also adjusts price scale.</span>
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
                      tick={{ fill: '#64748B', fontSize: 12 }}
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
                  {toggles.ema9 ? <Line type="monotone" dataKey="ema9" stroke={smaColors.ema9} strokeWidth={1.7} dot={false} connectNulls /> : null}
                  {toggles.ema21 ? <Line type="monotone" dataKey="ema21" stroke={smaColors.ema21} strokeWidth={1.7} dot={false} connectNulls /> : null}
                  {toggles.sma20 ? <Line type="monotone" dataKey="sma20" stroke={smaColors.sma20} strokeWidth={1.7} dot={false} connectNulls /> : null}
                  {toggles.sma50 ? <Line type="monotone" dataKey="sma50" stroke={smaColors.sma50} strokeWidth={1.7} dot={false} connectNulls /> : null}
                  {toggles.sma200 ? <Line type="monotone" dataKey="sma200" stroke={smaColors.sma200} strokeWidth={1.7} dot={false} connectNulls /> : null}
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
                  {chartType === 'line'
                    ? <Line key="price-line" type="monotone" dataKey="close" stroke="#F59E0B" strokeWidth={2.2} dot={false} connectNulls />
                    : <Customized key={`price-${chartType}`} component={(props) => <CandlesLayer {...props} data={renderedData} chartType={chartType} />} />}
                </ComposedChart>
              </ResponsiveContainer>
              </div>

              {toggles.volume ? (
                <ResponsiveContainer width="100%" height={130}>
                  <ComposedChart syncId="stock-chart-sync" data={renderedData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} minTickGap={28} />
                    <YAxis axisLine={false} tickLine={false} orientation="right" tick={{ fill: '#64748B', fontSize: 11 }} />
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
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart syncId="stock-chart-sync" data={renderedData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} minTickGap={28} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} orientation="right" tick={{ fill: '#64748B', fontSize: 11 }} />
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
                <ResponsiveContainer width="100%" height={170}>
                  <ComposedChart syncId="stock-chart-sync" data={renderedData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} minTickGap={28} />
                    <YAxis axisLine={false} tickLine={false} orientation="right" tick={{ fill: '#64748B', fontSize: 11 }} />
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

              {toggles.stochastic ? (
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart syncId="stock-chart-sync" data={renderedData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} minTickGap={28} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} orientation="right" tick={{ fill: '#64748B', fontSize: 11 }} />
                    <Tooltip
                      content={<ChartTooltip currency={mainQuery.data?.currency || 'INR'} compareSymbol={compareSymbol} />}
                      cursor={{ stroke: 'rgba(148,163,184,0.55)', strokeWidth: 1 }}
                    />
                    <ReferenceLine y={80} stroke="rgba(244,63,94,0.55)" strokeDasharray="4 4" />
                    <ReferenceLine y={20} stroke="rgba(16,185,129,0.55)" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="stochasticK" stroke="#D946EF" strokeWidth={2.1} dot={false} connectNulls />
                    <Line type="monotone" dataKey="stochasticD" stroke="#FBBF24" strokeWidth={1.9} dot={false} connectNulls />
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
