import React, { useMemo } from 'react';

function buildCandles(stock, bars = 64) {
  const seed = [...String(stock?.symbol || 'STOCK')].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const start = Number(stock?.current_price || 1000) * 1.08;
  let previousClose = start;

  return Array.from({ length: bars }, (_, index) => {
    const drift = (index / bars) * ((Number(stock?.current_price || start) - start) * 1.4);
    const wave = Math.sin((index + seed) / 4.8) * (start * 0.025);
    const open = previousClose;
    const close = Math.max(1, open + drift * 0.06 + wave * 0.25 - start * 0.01 + Math.cos((index + seed) / 2.2) * (start * 0.006));
    const high = Math.max(open, close) + Math.abs(Math.sin((seed + index) / 2.8) * (start * 0.018));
    const low = Math.min(open, close) - Math.abs(Math.cos((seed + index) / 3.1) * (start * 0.018));
    previousClose = close;
    return {
      index,
      open,
      high,
      low,
      close,
      volume: Math.round(180000 + ((seed * (index + 3)) % 420000)),
    };
  });
}

function buildRsiLine(candles = []) {
  return candles.map((candle, index) => ({
    index,
    value: 48 + Math.sin(index / 3.2) * 12 + Math.cos(index / 6.5) * 7,
  }));
}

export default function StudyDeskChart({ stock }) {
  const candles = useMemo(() => buildCandles(stock), [stock]);
  const rsi = useMemo(() => buildRsiLine(candles), [candles]);

  const priceMin = Math.min(...candles.map((item) => item.low));
  const priceMax = Math.max(...candles.map((item) => item.high));
  const volumeMax = Math.max(...candles.map((item) => item.volume));
  const plotHeight = 420;
  const volumeHeight = 84;
  const rsiHeight = 120;
  const chartWidth = 980;
  const step = chartWidth / candles.length;

  const scaleY = (value) => {
    const ratio = (value - priceMin) / (priceMax - priceMin || 1);
    return plotHeight - (ratio * (plotHeight - 24)) - 12;
  };

  return (
    <div className="rounded-[28px] border border-white/8 bg-[#131722]">
      <div className="border-b border-white/6 px-4 py-2.5 text-xs text-slate-400">
        <span className="font-semibold text-slate-200">{stock.symbol}</span>
        <span className="mx-2 text-slate-600">•</span>
        <span>{stock.name}</span>
        <span className="mx-2 text-slate-600">•</span>
        <span>{stock.exchange}</span>
        <span className="mx-2 text-slate-600">•</span>
        <span>1D</span>
        <span className="ml-4 text-emerald-300">O {candles[0]?.open.toFixed(2)}</span>
        <span className="ml-2 text-sky-300">H {priceMax.toFixed(2)}</span>
        <span className="ml-2 text-rose-300">L {priceMin.toFixed(2)}</span>
        <span className="ml-2 text-amber-300">C {candles[candles.length - 1]?.close.toFixed(2)}</span>
      </div>

      <div className="overflow-hidden rounded-b-[28px]">
        <div className="relative overflow-x-auto">
          <svg viewBox={`0 0 ${chartWidth + 90} ${plotHeight + volumeHeight + rsiHeight + 34}`} className="min-w-[980px] w-full">
            <rect x="0" y="0" width={chartWidth + 90} height={plotHeight + volumeHeight + rsiHeight + 34} fill="#131722" />

            {Array.from({ length: 8 }).map((_, index) => {
              const y = 20 + (index * ((plotHeight - 8) / 7));
              return <line key={`h-${index}`} x1="0" y1={y} x2={chartWidth} y2={y} stroke="rgba(148,163,184,0.08)" />;
            })}
            {Array.from({ length: 12 }).map((_, index) => {
              const x = index * (chartWidth / 11);
              return <line key={`v-${index}`} x1={x} y1="8" x2={x} y2={plotHeight + volumeHeight + rsiHeight + 12} stroke="rgba(148,163,184,0.06)" />;
            })}

            {candles.map((candle, index) => {
              const x = index * step + (step * 0.5);
              const openY = scaleY(candle.open);
              const closeY = scaleY(candle.close);
              const highY = scaleY(candle.high);
              const lowY = scaleY(candle.low);
              const top = Math.min(openY, closeY);
              const bodyHeight = Math.max(Math.abs(closeY - openY), 2);
              const bullish = candle.close >= candle.open;
              return (
                <g key={index}>
                  <line x1={x} y1={highY} x2={x} y2={lowY} stroke={bullish ? '#2ecc71' : '#eb4d5c'} strokeWidth="1.2" />
                  <rect
                    x={x - Math.max(step * 0.22, 3)}
                    y={top}
                    width={Math.max(step * 0.44, 6)}
                    height={bodyHeight}
                    rx="1.5"
                    fill={bullish ? '#2ecc71' : '#eb4d5c'}
                  />
                </g>
              );
            })}

            {candles.map((candle, index) => {
              const x = index * step + (step * 0.2);
              const height = (candle.volume / volumeMax) * (volumeHeight - 12);
              const bullish = candle.close >= candle.open;
              return (
                <rect
                  key={`vol-${index}`}
                  x={x}
                  y={plotHeight + volumeHeight - height}
                  width={Math.max(step * 0.55, 5)}
                  height={height}
                  fill={bullish ? 'rgba(46,204,113,0.45)' : 'rgba(235,77,92,0.45)'}
                />
              );
            })}

            <polyline
              fill="none"
              stroke="#facc15"
              strokeWidth="2"
              points={rsi.map((point, index) => {
                const x = index * step + (step * 0.5);
                const y = plotHeight + volumeHeight + 12 + ((100 - point.value) / 100) * (rsiHeight - 18);
                return `${x},${y}`;
              }).join(' ')}
            />

            <line x1="0" y1={plotHeight + volumeHeight + 34} x2={chartWidth} y2={plotHeight + volumeHeight + 34} stroke="rgba(148,163,184,0.15)" strokeDasharray="4 4" />
            <line x1="0" y1={plotHeight + volumeHeight + 88} x2={chartWidth} y2={plotHeight + volumeHeight + 88} stroke="rgba(148,163,184,0.15)" strokeDasharray="4 4" />

            {[priceMax, (priceMax + priceMin) / 2, priceMin].map((value, index) => {
              const y = scaleY(value);
              return (
                <g key={`axis-${index}`}>
                  <line x1={chartWidth} y1={y} x2={chartWidth + 10} y2={y} stroke="rgba(148,163,184,0.25)" />
                  <text x={chartWidth + 14} y={y + 4} fill="#b8c5d8" fontSize="12">{value.toFixed(2)}</text>
                </g>
              );
            })}
            <text x={chartWidth + 14} y={plotHeight + volumeHeight + 20} fill="#a78bfa" fontSize="12">RSI</text>
            <text x={chartWidth + 14} y={plotHeight + volumeHeight + 36} fill="#facc15" fontSize="12">{rsi[rsi.length - 1]?.value.toFixed(2)}</text>
          </svg>
        </div>
      </div>
    </div>
  );
}
