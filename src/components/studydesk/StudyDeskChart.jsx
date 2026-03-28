import React, { useMemo } from 'react';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function calculateSma(values, period) {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = values.slice(index + 1 - period, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
}

function calculateStdDev(values, period, smaValues) {
  return values.map((_, index) => {
    if (index + 1 < period || smaValues[index] == null) return null;
    const slice = values.slice(index + 1 - period, index + 1);
    const mean = smaValues[index];
    const variance = slice.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / period;
    return Math.sqrt(variance);
  });
}

function calculateBollinger(values, period = 20, multiplier = 2) {
  const middle = calculateSma(values, period);
  const deviations = calculateStdDev(values, period, middle);

  return values.map((_, index) => {
    if (middle[index] == null || deviations[index] == null) return null;
    return {
      upper: middle[index] + (deviations[index] * multiplier),
      middle: middle[index],
      lower: middle[index] - (deviations[index] * multiplier),
    };
  });
}

function calculateEma(values, period) {
  const multiplier = 2 / (period + 1);
  return values.reduce((acc, value, index) => {
    if (index === 0) {
      acc.push(value);
      return acc;
    }
    acc.push(((value - acc[index - 1]) * multiplier) + acc[index - 1]);
    return acc;
  }, []);
}

function calculateRsi(values, period = 14) {
  if (values.length < period + 1) {
    return values.map(() => null);
  }

  const changes = values.slice(1).map((value, index) => value - values[index]);
  const output = values.map(() => null);

  let gains = 0;
  let losses = 0;
  for (let index = 0; index < period; index += 1) {
    const change = changes[index];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  output[period] = averageLoss === 0 ? 100 : 100 - (100 / (1 + (averageGain / averageLoss)));

  for (let index = period + 1; index < values.length; index += 1) {
    const change = changes[index - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    averageGain = ((averageGain * (period - 1)) + gain) / period;
    averageLoss = ((averageLoss * (period - 1)) + loss) / period;
    output[index] = averageLoss === 0 ? 100 : 100 - (100 / (1 + (averageGain / averageLoss)));
  }

  return output;
}

function calculateMacd(values) {
  const ema12 = calculateEma(values, 12);
  const ema26 = calculateEma(values, 26);
  const macdLine = values.map((_, index) => ema12[index] - ema26[index]);
  const signalLine = calculateEma(macdLine.map((value) => Number.isFinite(value) ? value : 0), 9);

  return macdLine.map((macd, index) => ({
    macd,
    signal: signalLine[index],
    histogram: macd - signalLine[index],
  }));
}

function buildFallbackCandles(stock, bars = 96) {
  const seed = [...String(stock?.symbol || 'STOCK')].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const current = Number(stock?.current_price || 1000);
  const origin = current * 0.88;
  let previousClose = origin;

  return Array.from({ length: bars }, (_, index) => {
    const drift = ((current - origin) / bars) * index;
    const wave = Math.sin((seed + index) / 4.2) * (current * 0.018);
    const open = previousClose;
    const close = Math.max(1, open + ((drift + wave) * 0.16) + (Math.cos((seed + index) / 2.6) * current * 0.004));
    const high = Math.max(open, close) + Math.abs(Math.sin((seed + index) / 3.1) * current * 0.014);
    const low = Math.min(open, close) - Math.abs(Math.cos((seed + index) / 3.3) * current * 0.014);
    previousClose = close;
    return {
      date: new Date(Date.now() - ((bars - index) * 86400000)).toISOString(),
      open,
      high,
      low,
      close,
      volume: Math.round(150000 + ((seed * (index + 7)) % 580000)),
    };
  });
}

function buildPath(values, getY, step, offset = 0.5) {
  return values
    .map((value, index) => {
      if (value == null || Number.isNaN(value)) return null;
      return `${index * step + (step * offset)},${getY(value)}`;
    })
    .filter(Boolean)
    .join(' ');
}

function formatAxisValue(value) {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: value >= 1000 ? 0 : 2,
    maximumFractionDigits: value >= 1000 ? 2 : 2,
  }).format(value);
}

function formatBottomLabel(dateString, totalDays) {
  const date = new Date(dateString);
  if (totalDays <= 2) {
    return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  if (totalDays <= 60) {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(date);
  }
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' }).format(date);
}

function colorForCandle(open, close) {
  return close >= open ? '#22c55e' : '#ef4444';
}

export default function StudyDeskChart({ stock, history, loading }) {
  const candles = useMemo(() => {
    const points = history?.points?.length ? history.points : buildFallbackCandles(stock);
    return points.slice(-140);
  }, [history?.points, stock]);

  const closes = useMemo(() => candles.map((item) => Number(item.close)), [candles]);
  const highs = useMemo(() => candles.map((item) => Number(item.high)), [candles]);
  const lows = useMemo(() => candles.map((item) => Number(item.low)), [candles]);
  const volumes = useMemo(() => candles.map((item) => Number(item.volume || 0)), [candles]);

  const sma20 = useMemo(() => calculateSma(closes, 20), [closes]);
  const sma50 = useMemo(() => calculateSma(closes, 50), [closes]);
  const sma200 = useMemo(() => calculateSma(closes, 200), [closes]);
  const bollinger = useMemo(() => calculateBollinger(closes, 20, 2), [closes]);
  const rsi = useMemo(() => calculateRsi(closes, 14), [closes]);
  const macd = useMemo(() => calculateMacd(closes), [closes]);

  if (loading) {
    return (
      <div className="flex h-[760px] items-center justify-center rounded-[30px] border border-white/8 bg-[#0f141d] text-sm text-slate-400">
        Loading live study desk...
      </div>
    );
  }

  if (!candles.length) {
    return (
      <div className="flex h-[760px] items-center justify-center rounded-[30px] border border-white/8 bg-[#0f141d] text-sm text-slate-400">
        No live candles available for this symbol.
      </div>
    );
  }

  const plotHeight = 430;
  const volumeHeight = 90;
  const rsiHeight = 100;
  const macdHeight = 110;
  const totalHeight = plotHeight + volumeHeight + rsiHeight + macdHeight + 60;
  const chartWidth = 1120;
  const step = chartWidth / candles.length;
  const axisWidth = 104;

  const derivedPrices = [
    ...highs,
    ...lows,
    ...sma20.filter((value) => value != null),
    ...sma50.filter((value) => value != null),
    ...sma200.filter((value) => value != null),
    ...bollinger.flatMap((band) => (band ? [band.upper, band.lower] : [])),
  ];

  const minPrice = Math.min(...derivedPrices);
  const maxPrice = Math.max(...derivedPrices);
  const pricePadding = (maxPrice - minPrice || 1) * 0.08;
  const scaledMin = minPrice - pricePadding;
  const scaledMax = maxPrice + pricePadding;
  const maxVolume = Math.max(...volumes, 1);
  const maxHistogram = Math.max(...macd.map((item) => Math.abs(item.histogram || 0)), 0.01);
  const dateSpanDays = Math.abs(new Date(candles[candles.length - 1].date) - new Date(candles[0].date)) / 86400000;

  const scalePrice = (value) => {
    const ratio = (value - scaledMin) / (scaledMax - scaledMin || 1);
    return plotHeight - (ratio * (plotHeight - 34)) - 18;
  };
  const scaleVolume = (value) => plotHeight + volumeHeight - ((value / maxVolume) * (volumeHeight - 16));
  const scaleRsi = (value) => plotHeight + volumeHeight + 18 + (((100 - value) / 100) * (rsiHeight - 30));
  const scaleMacd = (value) => {
    const zeroY = plotHeight + volumeHeight + rsiHeight + 60;
    return zeroY - ((value / maxHistogram) * 42);
  };

  const lastCandle = candles[candles.length - 1];
  const priceMarks = [
    { label: 'Last', value: lastCandle.close, color: colorForCandle(lastCandle.open, lastCandle.close) },
    { label: 'SMA20', value: sma20[sma20.length - 1], color: '#22c55e' },
    { label: 'SMA50', value: sma50[sma50.length - 1], color: '#60a5fa' },
    { label: 'SMA200', value: sma200[sma200.length - 1], color: '#ef4444' },
  ].filter((item) => item.value != null);

  const visibleTickLabels = candles
    .map((point, index) => ({ point, index }))
    .filter(({ index }) => index % Math.max(Math.floor(candles.length / 8), 1) === 0);

  return (
    <div className="rounded-[30px] border border-white/8 bg-[#0f141d] shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
      <div className="border-b border-white/6 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.18em] text-slate-200">{stock.symbol}</span>
          <span>{stock.name}</span>
          <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
            {stock.exchange}
          </span>
          <span className="text-emerald-300">O {formatAxisValue(lastCandle.open)}</span>
          <span className="text-sky-300">H {formatAxisValue(lastCandle.high)}</span>
          <span className="text-rose-300">L {formatAxisValue(lastCandle.low)}</span>
          <span className="text-amber-300">C {formatAxisValue(lastCandle.close)}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-b-[30px]">
        <svg viewBox={`0 0 ${chartWidth + axisWidth} ${totalHeight}`} className="min-w-[1160px] w-full">
          <rect width={chartWidth + axisWidth} height={totalHeight} fill="#0f141d" />

          {Array.from({ length: 8 }).map((_, index) => {
            const y = 18 + (index * ((plotHeight - 28) / 7));
            return <line key={`price-grid-${index}`} x1="0" y1={y} x2={chartWidth} y2={y} stroke="rgba(148,163,184,0.08)" />;
          })}
          {Array.from({ length: 11 }).map((_, index) => {
            const x = index * (chartWidth / 10);
            return <line key={`time-grid-${index}`} x1={x} y1="12" x2={x} y2={totalHeight - 24} stroke="rgba(148,163,184,0.05)" />;
          })}

          {bollinger.map((band, index) => {
            if (!band || !bollinger[index + 1]) return null;
            const x1 = index * step + (step * 0.5);
            const x2 = (index + 1) * step + (step * 0.5);
            return (
              <g key={`bb-${index}`}>
                <line x1={x1} y1={scalePrice(band.upper)} x2={x2} y2={scalePrice(bollinger[index + 1].upper)} stroke="rgba(125,211,252,0.42)" strokeWidth="1.1" />
                <line x1={x1} y1={scalePrice(band.lower)} x2={x2} y2={scalePrice(bollinger[index + 1].lower)} stroke="rgba(125,211,252,0.42)" strokeWidth="1.1" />
              </g>
            );
          })}

          <polyline fill="none" stroke="#22c55e" strokeWidth="1.8" points={buildPath(sma20, scalePrice, step)} />
          <polyline fill="none" stroke="#60a5fa" strokeWidth="1.8" points={buildPath(sma50, scalePrice, step)} />
          <polyline fill="none" stroke="#ef4444" strokeWidth="1.8" points={buildPath(sma200, scalePrice, step)} />

          {candles.map((candle, index) => {
            const x = index * step + (step * 0.5);
            const openY = scalePrice(candle.open);
            const closeY = scalePrice(candle.close);
            const highY = scalePrice(candle.high);
            const lowY = scalePrice(candle.low);
            const bullish = candle.close >= candle.open;
            const bodyWidth = clamp(step * 0.58, 4, 10);
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.max(Math.abs(closeY - openY), 2.4);
            const fill = bullish ? '#0f141d' : '#ef4444';
            const stroke = bullish ? '#22c55e' : '#ef4444';

            return (
              <g key={`candle-${candle.date}-${index}`}>
                <line x1={x} y1={highY} x2={x} y2={lowY} stroke={stroke} strokeWidth="1.2" />
                <rect
                  x={x - (bodyWidth / 2)}
                  y={bodyTop}
                  width={bodyWidth}
                  height={bodyHeight}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth="1.25"
                  rx="1.5"
                />
              </g>
            );
          })}

          {candles.map((candle, index) => {
            const x = index * step + (step * 0.18);
            const width = clamp(step * 0.64, 4, 10);
            return (
              <rect
                key={`volume-${candle.date}-${index}`}
                x={x}
                y={scaleVolume(candle.volume || 0)}
                width={width}
                height={(plotHeight + volumeHeight) - scaleVolume(candle.volume || 0)}
                fill={candle.close >= candle.open ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}
              />
            );
          })}

          <line x1="0" y1={plotHeight + volumeHeight + 22} x2={chartWidth} y2={plotHeight + volumeHeight + 22} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 5" />
          <line x1="0" y1={plotHeight + volumeHeight + 70} x2={chartWidth} y2={plotHeight + volumeHeight + 70} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 5" />

          <polyline fill="none" stroke="#facc15" strokeWidth="1.9" points={buildPath(rsi, scaleRsi, step)} />

          <line x1="0" y1={scaleMacd(0)} x2={chartWidth} y2={scaleMacd(0)} stroke="rgba(148,163,184,0.16)" />
          <polyline fill="none" stroke="#38bdf8" strokeWidth="1.5" points={buildPath(macd.map((item) => item.macd), scaleMacd, step)} />
          <polyline fill="none" stroke="#fb923c" strokeWidth="1.5" points={buildPath(macd.map((item) => item.signal), scaleMacd, step)} />

          {macd.map((item, index) => {
            const x = index * step + (step * 0.22);
            const width = clamp(step * 0.56, 4, 9);
            const zeroY = scaleMacd(0);
            const height = Math.abs(scaleMacd(item.histogram) - zeroY);
            return (
              <rect
                key={`macd-${index}`}
                x={x}
                y={item.histogram >= 0 ? zeroY - height : zeroY}
                width={width}
                height={height}
                fill={item.histogram >= 0 ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'}
              />
            );
          })}

          {[scaledMax, (scaledMax + scaledMin) / 2, scaledMin].map((value, index) => {
            const y = scalePrice(value);
            return (
              <g key={`price-axis-${index}`}>
                <line x1={chartWidth} y1={y} x2={chartWidth + 8} y2={y} stroke="rgba(148,163,184,0.24)" />
                <text x={chartWidth + 14} y={y + 4} fill="#f8fafc" fontSize="12" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
                  {formatAxisValue(value)}
                </text>
              </g>
            );
          })}

          {priceMarks.map((mark, index) => {
            const y = scalePrice(mark.value);
            const boxWidth = 78;
            return (
              <g key={`mark-${mark.label}-${index}`}>
                <line x1="0" y1={y} x2={chartWidth} y2={y} stroke={mark.color} strokeOpacity="0.25" strokeDasharray={mark.label === 'Last' ? '4 4' : '0'} />
                <rect x={chartWidth + 8} y={y - 11} width={boxWidth} height="22" rx="6" fill={mark.color} />
                <text x={chartWidth + 47} y={y + 4} textAnchor="middle" fill="#061016" fontSize="11" fontWeight="700">
                  {mark.label} {formatAxisValue(mark.value)}
                </text>
              </g>
            );
          })}

          <text x={chartWidth + 14} y={plotHeight + volumeHeight + 16} fill="#a78bfa" fontSize="12" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
            RSI
          </text>
          <text x={chartWidth + 14} y={plotHeight + volumeHeight + 32} fill="#facc15" fontSize="12" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
            {formatAxisValue(rsi[rsi.length - 1] || 0)}
          </text>
          <text x={chartWidth + 14} y={plotHeight + volumeHeight + rsiHeight + 18} fill="#38bdf8" fontSize="12" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
            MACD
          </text>

          {visibleTickLabels.map(({ point, index }) => (
            <text
              key={`tick-${point.date}`}
              x={(index * step) + 4}
              y={totalHeight - 16}
              fill="#94a3b8"
              fontSize="11"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {formatBottomLabel(point.date, dateSpanDays)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
