import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, RefreshCw, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatPercent } from '@/lib/portfolioAnalytics';

export default function StockTable({ stocks, onDelete, onRefreshPrice, refreshingId }) {
  if (stocks.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-white/10 bg-[#0c1422] p-10 text-center">
        <p className="text-lg font-medium text-white">No holdings in this portfolio yet.</p>
        <p className="mt-2 text-sm text-slate-400">Add a stock, import a CSV, or sync from Zerodha to build your live portfolio.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[28px] border border-white/10 bg-[#0c1422]">
      <table className="min-w-full text-sm">
        <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-[0.24em] text-slate-400">
          <tr>
            <th className="px-5 py-4">Holding</th>
            <th className="px-4 py-4 text-right">Allocation</th>
            <th className="px-4 py-4 text-right">Qty</th>
            <th className="px-4 py-4 text-right">Cost</th>
            <th className="px-4 py-4 text-right">Current</th>
            <th className="px-4 py-4 text-right">Value</th>
            <th className="px-4 py-4 text-right">P&L</th>
            <th className="px-5 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => {
            const positive = stock.pnl >= 0;

            return (
              <tr key={stock.id} className="border-t border-white/6 text-slate-200 transition-colors hover:bg-white/[0.02]">
                <td className="px-5 py-4">
                  <Link to={`/StockDetail?id=${stock.id}`} className="flex items-center gap-3">
                    <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-200">
                      {stock.symbol?.slice(0, 4)}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{stock.symbol}</p>
                      <p className="text-xs text-slate-400">{stock.name}</p>
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-4 text-right font-medium text-amber-300">{stock.allocation.toFixed(1)}%</td>
                <td className="px-4 py-4 text-right">{stock.quantity}</td>
                <td className="px-4 py-4 text-right">{formatCurrency(stock.buy_price)}</td>
                <td className="px-4 py-4 text-right font-medium text-white">{formatCurrency(stock.current_price)}</td>
                <td className="px-4 py-4 text-right font-medium text-white">{formatCurrency(stock.value)}</td>
                <td className="px-4 py-4 text-right">
                  <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${positive ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'}`}>
                    {positive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    <span>{formatPercent(stock.pnlPercent)}</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <Button asChild size="icon" variant="ghost" className="text-slate-400 hover:bg-white/5 hover:text-white">
                      <Link to={`/StockDetail?id=${stock.id}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-slate-400 hover:bg-white/5 hover:text-amber-200"
                      onClick={() => onRefreshPrice(stock)}
                      disabled={refreshingId === stock.id}
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshingId === stock.id ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-slate-400 hover:bg-white/5 hover:text-rose-300"
                      onClick={() => onDelete(stock.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
