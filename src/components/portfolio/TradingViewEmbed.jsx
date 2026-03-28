import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Expand, Minimize2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const TRADING_VIEW_SCRIPT = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
const INTERVAL_OPTIONS = [
  { value: '1', label: '1m' },
  { value: '3', label: '3m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '30', label: '30m' },
  { value: '60', label: '1h' },
  { value: '120', label: '2h' },
  { value: '240', label: '4h' },
  { value: 'D', label: '1D' },
  { value: 'W', label: '1W' },
  { value: 'M', label: '1M' },
];
const RANGE_OPTIONS = ['1D', '5D', '1M', '3M', '6M', 'YTD', '12M', '60M', 'ALL'];

function normalizeTradingViewSymbol(stock) {
  const rawSymbol = String(stock?.symbol || '').trim().toUpperCase();
  if (!rawSymbol) return 'NSE:NIFTY';
  if (rawSymbol.includes(':')) return rawSymbol;
  const exchange = String(stock?.exchange || '').toUpperCase();
  return exchange.includes('BSE') ? `BSE:${rawSymbol}` : `NSE:${rawSymbol}`;
}

export default function TradingViewEmbed({
  stock,
  title = 'TradingView Chart',
  defaultInterval = 'D',
  defaultRange = 'YTD',
  height = 520,
  compact = false,
}) {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  const [interval, setInterval] = useState(defaultInterval);
  const [range, setRange] = useState(defaultRange);
  const [status, setStatus] = useState('loading');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const tradingViewSymbol = useMemo(() => normalizeTradingViewSymbol(stock), [stock]);

  useEffect(() => {
    const container = containerRef.current;
    const widget = widgetRef.current;
    if (!container || !widget) return;

    setStatus('loading');

    const oldScripts = container.querySelectorAll(`script[src="${TRADING_VIEW_SCRIPT}"]`);
    oldScripts.forEach((node) => node.remove());
    widget.innerHTML = '';

    const config = {
      autosize: true,
      symbol: tradingViewSymbol,
      interval,
      range,
      timezone: 'Asia/Kolkata',
      theme: 'dark',
      style: '1',
      locale: 'en',
      withdateranges: true,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: true,
      save_image: false,
      details: !compact,
      calendar: false,
      watchlist: false,
      studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies', 'Bollinger Bands@tv-basicstudies'],
      support_host: 'https://www.tradingview.com',
    };

    const script = document.createElement('script');
    script.src = TRADING_VIEW_SCRIPT;
    script.type = 'text/javascript';
    script.async = true;
    script.appendChild(document.createTextNode(JSON.stringify(config)));
    script.onload = () => setStatus('ready');
    script.onerror = () => setStatus('error');
    container.appendChild(script);

    return () => {
      script.remove();
    };
  }, [interval, range, tradingViewSymbol]);

  const cardHeight = isFullscreen ? 'calc(100vh - 150px)' : `${compact ? Math.min(height, 520) : height}px`;

  return (
    <section className={`${isFullscreen ? 'fixed inset-3 z-50 overflow-auto rounded-[32px]' : 'rounded-[32px]'} border border-white/10 bg-[#07111c]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.26)]`}>
      <div className={`${isFullscreen ? 'sticky top-0 z-10 rounded-[24px] bg-[#07111c]/95 pb-3' : ''} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber-200/70">{title}</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{stock?.symbol} on TradingView</h2>
          <p className="mt-1 text-sm text-slate-400">Symbol {tradingViewSymbol} with TradingView charting, studies, and drawing tools.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300">
            Interval
            <select value={interval} onChange={(event) => setInterval(event.target.value)} className="bg-transparent text-white outline-none">
              {INTERVAL_OPTIONS.map((item) => (
                <option key={item.value} value={item.value} className="bg-[#07111c] text-white">
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300">
            Range
            <select value={range} onChange={(event) => setRange(event.target.value)} className="bg-transparent text-white outline-none">
              {RANGE_OPTIONS.map((item) => (
                <option key={item} value={item} className="bg-[#07111c] text-white">
                  {item}
                </option>
              ))}
            </select>
          </label>
          <Badge className="rounded-full bg-white/10 px-3 py-1.5 text-slate-200">
            {status === 'ready' ? 'Interactive' : status === 'error' ? 'Unavailable' : 'Loading'}
          </Badge>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsFullscreen((current) => !current)}
            className="rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            {isFullscreen ? 'Exit Full' : 'Expand Full'}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-emerald-100">SMA 20</span>
        <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-sky-100">SMA 50</span>
        <span className="rounded-full border border-rose-300/20 bg-rose-300/10 px-3 py-1 text-rose-100">SMA 200</span>
        <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-violet-100">RSI</span>
        <span className="rounded-full border border-orange-300/20 bg-orange-300/10 px-3 py-1 text-orange-100">MACD</span>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-cyan-100">Bollinger Bands</span>
      </div>

      <div ref={containerRef} className="tradingview-widget-container mt-4 overflow-hidden rounded-[28px] border border-white/8 bg-[#050b14]" style={{ height: cardHeight }}>
        <div ref={widgetRef} className="tradingview-widget-container__widget" style={{ height: 'calc(100% - 32px)', width: '100%' }} />
        <div className="tradingview-widget-copyright px-4 py-2 text-xs text-slate-500">
          <a href={`https://www.tradingview.com/symbols/${tradingViewSymbol.replace(':', '-')}/`} target="_blank" rel="noopener nofollow" className="text-cyan-300">
            {stock?.symbol} chart
          </a>{' '}
          by TradingView
        </div>
        {status === 'error' ? (
          <div className="border-t border-white/8 bg-[#07111c] px-4 py-3 text-sm text-slate-400">
            TradingView chart could not load for {tradingViewSymbol}. Try refreshing the page.
          </div>
        ) : null}
      </div>
    </section>
  );
}
