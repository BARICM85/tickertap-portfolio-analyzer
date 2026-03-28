import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';

const TRADING_VIEW_SCRIPT = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

function normalizeTradingViewSymbol(stock) {
  const rawSymbol = String(stock?.symbol || '').trim().toUpperCase();
  if (!rawSymbol) return 'NSE:NIFTY';

  if (rawSymbol.includes(':')) return rawSymbol;

  const exchange = String(stock?.exchange || '').toUpperCase();
  if (exchange.includes('BSE')) return `BSE:${rawSymbol}`;
  return `NSE:${rawSymbol}`;
}

function loadTradingViewScript() {
  return Promise.resolve();
}

export default function TradingViewEmbed({
  stock,
  title = 'TradingView Chart',
  defaultInterval = 'D',
  defaultRange = '12M',
  height = 520,
  compact = false,
}) {
  const reactId = useId();
  const widgetId = useMemo(() => `tv_${reactId.replace(/[:]/g, '')}`, [reactId]);
  const hostRef = useRef(null);
  const [interval, setInterval] = useState(defaultInterval);
  const [range, setRange] = useState(defaultRange);
  const [status, setStatus] = useState('loading');
  const tradingViewSymbol = normalizeTradingViewSymbol(stock);

  useEffect(() => {
    let disposed = false;

    async function mountWidget() {
      setStatus('loading');
      try {
        await loadTradingViewScript();
        if (disposed || !hostRef.current) return;

        hostRef.current.innerHTML = '';
        const container = document.createElement('div');
        container.className = 'tradingview-widget-container';
        container.style.height = '100%';

        const widget = document.createElement('div');
        widget.className = 'tradingview-widget-container__widget';
        widget.id = widgetId;
        widget.style.height = '100%';

        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = TRADING_VIEW_SCRIPT;
        script.async = true;
        script.text = JSON.stringify({
          autosize: true,
          symbol: tradingViewSymbol,
          interval,
          range,
          timezone: 'Asia/Kolkata',
          theme: 'dark',
          style: '1',
          locale: 'en',
          hide_top_toolbar: compact,
          hide_legend: false,
          allow_symbol_change: true,
          save_image: false,
          details: !compact,
          calendar: !compact,
          watchlist: false,
          studies: ['RSI@tv-basicstudies', 'MASimple@tv-basicstudies'],
          studies_overrides: {
            'volume.volume.color.0': '#ef4444',
            'volume.volume.color.1': '#22c55e',
          },
          overrides: {
            'paneProperties.background': '#050b14',
            'paneProperties.vertGridProperties.color': 'rgba(148, 163, 184, 0.08)',
            'paneProperties.horzGridProperties.color': 'rgba(148, 163, 184, 0.08)',
            'scalesProperties.textColor': '#d6e2f2',
            'mainSeriesProperties.candleStyle.upColor': '#22c55e',
            'mainSeriesProperties.candleStyle.downColor': '#ef4444',
            'mainSeriesProperties.candleStyle.borderUpColor': '#22c55e',
            'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
            'mainSeriesProperties.candleStyle.wickUpColor': '#86efac',
            'mainSeriesProperties.candleStyle.wickDownColor': '#fca5a5',
            'mainSeriesProperties.hollowCandleStyle.upColor': '#22c55e',
            'mainSeriesProperties.hollowCandleStyle.downColor': '#ef4444',
            'mainSeriesProperties.hollowCandleStyle.borderUpColor': '#22c55e',
            'mainSeriesProperties.hollowCandleStyle.borderDownColor': '#ef4444',
            'mainSeriesProperties.hollowCandleStyle.wickUpColor': '#86efac',
            'mainSeriesProperties.hollowCandleStyle.wickDownColor': '#fca5a5',
          },
        });

        script.onload = () => {
          if (!disposed) setStatus('ready');
        };
        script.onerror = () => {
          if (!disposed) setStatus('error');
        };

        container.appendChild(widget);
        container.appendChild(script);
        hostRef.current.appendChild(container);
      } catch {
        if (!disposed) {
          setStatus('error');
        }
      }
    }

    mountWidget();
    return () => {
      disposed = true;
    };
  }, [compact, interval, range, tradingViewSymbol, widgetId]);

  const cardHeight = compact ? Math.min(height, 420) : height;

  return (
    <section className="rounded-[32px] border border-white/10 bg-[#07111c]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.26)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber-200/70">{title}</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{stock?.symbol} on TradingView</h2>
          <p className="mt-1 text-sm text-slate-400">
            Symbol {tradingViewSymbol} with built-in studies, timeframe switching, and full TradingView interactions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {['1', '5', '15', '30', '60', 'D', 'W'].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setInterval(item)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                interval === item
                  ? 'border-cyan-300/50 bg-cyan-300/15 text-cyan-100'
                  : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
              }`}
            >
              {item === 'D' ? '1D' : item === 'W' ? '1W' : `${item}m`}
            </button>
          ))}
          {['1D', '5D', '1M', '3M', '12M'].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRange(item)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                range === item
                  ? 'border-amber-300/50 bg-amber-300/15 text-amber-100'
                  : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
              }`}
            >
              {item}
            </button>
          ))}
          <Badge className="rounded-full bg-white/10 px-3 py-1.5 text-slate-200">
            {status === 'ready' ? 'Interactive' : status === 'error' ? 'Unavailable' : 'Loading'}
          </Badge>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-[28px] border border-white/8 bg-[#050b14]">
        <div ref={hostRef} style={{ height: `${cardHeight}px` }} />
        {status === 'error' ? (
          <div className="border-t border-white/8 bg-[#07111c] px-4 py-3 text-sm text-slate-400">
            TradingView chart could not load for {tradingViewSymbol}. Try switching symbol or refresh the page.
          </div>
        ) : null}
      </div>
    </section>
  );
}
