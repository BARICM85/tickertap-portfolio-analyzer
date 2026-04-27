import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import MarketHistoryChart from '@/components/portfolio/MarketHistoryChart';
import { derivePortfolioAnalytics } from '@/lib/portfolioAnalytics';
import { getStockProfile } from '@/lib/marketData';

export default function StockChartPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const stockId = searchParams.get('id');
  const stockSymbol = searchParams.get('symbol')?.toUpperCase();

  const { data: stocks = [] } = useQuery({
    queryKey: ['stocks'],
    queryFn: () => base44.entities.Stock.list('-created_date'),
  });

  const analytics = derivePortfolioAnalytics(stocks);
  const stockFromPortfolio = analytics.holdings.find((item) => item.id === stockId);
  const stock = stockFromPortfolio || (stockSymbol ? (() => {
    const profile = getStockProfile(stockSymbol);
    return {
      id: `chart-${stockSymbol}`,
      symbol: stockSymbol,
      name: profile.name,
      sector: profile.sector,
      exchange: profile.exchange,
      current_price: profile.current_price,
      buy_price: profile.current_price,
      pnlPercent: 0,
      allocation: 0,
    };
  })() : null);

  if (!stock) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#07111c] text-center">
        <p className="text-lg text-white">Holding not found.</p>
        <Link to="/Portfolio" className="mt-4 inline-flex text-amber-300">Back to portfolio</Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#04070c]">
      {/* Minimalistic Header */}
      <header className="flex items-center justify-between border-b border-white/10 bg-[#0b1119] px-4 py-3">
        <div className="flex items-center gap-4">
          <Link
            to="/Portfolio"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Portfolio</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-amber-200">{stock.symbol}</span>
            <span className="text-xs text-slate-400">{stock.name}</span>
          </div>
        </div>
        <div className="hidden text-xs text-slate-500 sm:block">
          TradingView Professional Terminal
        </div>
      </header>

      {/* Full-Height Chart Area */}
      <main className="flex-grow overflow-hidden">
        <MarketHistoryChart
          stock={stock}
          onStockSelect={(item) => navigate(`/StockChart?symbol=${encodeURIComponent(item.symbol)}`)}
        />
      </main>
    </div>
  );
}
