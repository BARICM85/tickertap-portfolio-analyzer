import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import MarketHistoryChart from '@/components/portfolio/MarketHistoryChart';
import { Button } from '@/components/ui/button';
import { derivePortfolioAnalytics, formatCurrency, formatPercent } from '@/lib/portfolioAnalytics';
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
      <div className="space-y-6">
        <div className="rounded-[32px] border border-white/10 bg-[#0b1624]/90 p-8 text-center">
          <p className="text-lg text-white">Holding not found.</p>
          <Link to="/Portfolio" className="mt-4 inline-flex text-amber-300">Back to portfolio</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-white/10 bg-[#0b1624]/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <Link to={stockFromPortfolio ? `/StockDetail?id=${stock.id}` : '/Portfolio'} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-300 transition hover:bg-white/10 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <div className="rounded-[24px] bg-amber-300/15 px-4 py-3 text-lg font-semibold text-amber-200">{stock.symbol}</div>
                <div>
                  <h1 className="text-4xl font-semibold tracking-tight text-white">{stock.name}</h1>
                  <p className="mt-1 text-sm text-slate-400">{stock.sector} | {stock.exchange}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-400">
                <span>Current {formatCurrency(stock.current_price)}</span>
                <span>P&L {formatPercent(stock.pnlPercent)}</span>
                <span>Allocation {stock.allocation.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" className="rounded-2xl border-cyan-300/30 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20">
              <Link to={stockFromPortfolio ? `/OptionChain?id=${stock.id}` : `/OptionChain?symbol=${stock.symbol}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open Option Chain
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
              <Link to={stockFromPortfolio ? `/StockDetail?id=${stock.id}` : '/Portfolio'}>
                <ExternalLink className="h-4 w-4" />
                {stockFromPortfolio ? 'Back to details' : 'Back to portfolio'}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <MarketHistoryChart
        stock={stock}
        onStockSelect={(item) => navigate(`/StockChart?symbol=${encodeURIComponent(item.symbol)}`)}
      />
    </div>
  );
}
