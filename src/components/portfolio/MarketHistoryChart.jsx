import React from 'react';
import { AdvancedRealTimeChart } from 'react-ts-tradingview-widgets';

/**
 * MarketHistoryChart - Replaced custom Recharts implementation with the official
 * TradingView Advanced Real-Time Chart widget.
 * 
 * Provides:
 * - Professional-grade indicators (100+)
 * - Drawing tools (trendlines, fibonacci, shapes)
 * - Multi-interval switching (1m to 1M)
 * - Real-time data streams
 */
export default function MarketHistoryChart({ stock, onStockSelect }) {
  // TradingView expects symbols in the format "EXCHANGE:SYMBOL"
  // Default to NSE if no exchange is provided, as this is an Indian stock app.
  const exchange = (stock?.exchange || 'NSE').trim().toUpperCase();
  const symbol = (stock?.symbol || '').trim().toUpperCase();
  const formattedSymbol = symbol ? `${exchange}:${symbol}` : 'BSE:SENSEX';

  return (
    <section className="rounded-[28px] border border-white/10 bg-[#0a1018]/95 p-4 shadow-[0_20px_56px_rgba(0,0,0,0.24)]">
      <div className="flex flex-col gap-3">
        {/* Header Summary */}
        <div className="rounded-[22px] border border-white/8 bg-[#0b1119] px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-2xl bg-amber-300/12 px-3 py-1.5 text-sm font-semibold text-amber-200">
                  {symbol || 'SENSEX'}
                </div>
                <p className="truncate text-sm text-slate-300">
                  {stock?.name || 'Market Index'}
                </p>
                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {exchange} · TradingView Real-time
                </span>
              </div>
            </div>
            {/* Quick Note for User */}
            <p className="hidden text-right text-[11px] text-slate-500 xl:block">
              Indicators and drawing tools are available in the chart toolbars.
            </p>
          </div>
        </div>

        {/* The TradingView Widget */}
        <div className="h-[600px] w-full overflow-hidden rounded-[24px] border border-white/8 bg-[#04070c]">
          <AdvancedRealTimeChart
            symbol={formattedSymbol}
            theme="dark"
            autosize
            interval="D"
            timezone="Asia/Kolkata"
            style="1"
            locale="en"
            toolbar_bg="#04070c"
            enable_publishing={false}
            hide_side_toolbar={false}
            allow_symbol_change={true}
            container_id="tradingview_advanced_chart"
          />
        </div>
      </div>
    </section>
  );
}
