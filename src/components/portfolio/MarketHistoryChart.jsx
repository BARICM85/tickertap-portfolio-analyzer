import React from 'react';
import { AdvancedRealTimeChart } from 'react-ts-tradingview-widgets';

/**
 * MarketHistoryChart - Replaced custom Recharts implementation with the official
 * TradingView Advanced Real-Time Chart widget.
 * 
 * Modified to support full-height / full-window layouts.
 */
export default function MarketHistoryChart({ stock }) {
  // TradingView expects symbols in the format "EXCHANGE:SYMBOL"
  const exchange = (stock?.exchange || 'NSE').trim().toUpperCase();
  const symbol = (stock?.symbol || '').trim().toUpperCase();
  const formattedSymbol = symbol ? `${exchange}:${symbol}` : 'BSE:SENSEX';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#04070c]">
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
          withdateranges={true}
          hide_top_toolbar={false}
          hide_side_toolbar={false}
          allow_symbol_change={true}
          save_image={true}
          studies={[
            "MASimple@tv-basicstudies",
            "BollingerBands@tv-basicstudies",
            "RSI@tv-basicstudies",
            "MACD@tv-basicstudies"
          ]}
        />    </div>
  );
}
