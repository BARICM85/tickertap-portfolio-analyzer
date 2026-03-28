import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import OptionChainPanel from '@/components/portfolio/OptionChainPanel';
import TradingViewEmbed from '@/components/portfolio/TradingViewEmbed';
import { Button } from '@/components/ui/button';
import StockAutocompleteInput from '@/components/shared/StockAutocompleteInput';
import { getStockProfile } from '@/lib/marketData';
import { derivePortfolioAnalytics, formatCurrency, formatPercent } from '@/lib/portfolioAnalytics';

export default function OptionChainPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const stockId = searchParams.get('id');
  const symbolParam = searchParams.get('symbol');
  const [searchValue, setSearchValue] = useState(symbolParam || '');

  const { data: stocks = [] } = useQuery({
    queryKey: ['stocks'],
    queryFn: () => base44.entities.Stock.list('-created_date'),
  });

  const analytics = derivePortfolioAnalytics(stocks);
  const stockFromPortfolio = analytics.holdings.find((item) => item.id === stockId);
  const stock = stockFromPortfolio || (symbolParam ? (() => {
    const profile = getStockProfile(symbolParam);
    return {
      id: `symbol-${symbolParam.toUpperCase()}`,
      symbol: symbolParam.toUpperCase(),
      name: profile.name,
      sector: profile.sector,
      exchange: profile.exchange,
      current_price: profile.current_price,
      pnlPercent: 0,
      allocation: 0,
      pnl: 0,
    };
  })() : null);

  if (!stock) {
    return (
      <div className="-mx-2 space-y-6 xl:-mx-10 2xl:-mx-20">
        <div className="rounded-[32px] border border-white/10 bg-[#0b1624]/90 p-8 text-center">
          <p className="text-lg text-white">Holding not found.</p>
          <Link to="/Portfolio" className="mt-4 inline-flex text-amber-300">Back to portfolio</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-2 space-y-6 xl:-mx-10 2xl:-mx-20">
      <section className="rounded-[36px] border border-white/10 bg-[#0a1018]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.26)]">
        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr] xl:items-center">
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
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Spot Price', value: formatCurrency(stock.current_price), tone: 'text-amber-300' },
                  { label: 'Position P&L', value: formatPercent(stock.pnlPercent), tone: stock.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300' },
                  { label: 'Allocation', value: `${stock.allocation.toFixed(1)}%`, tone: 'text-slate-200' },
                ].map((item) => (
                  <div key={item.label} className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <p className={`mt-2 text-sm font-semibold ${item.tone}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[24px] border border-white/8 bg-gradient-to-br from-white/[0.05] to-transparent p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200/80">Option Desk</p>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                Wider terminal layout for option-chain study, OI scanning, expiry selection, and quick structure planning.
              </p>
              <div className="mt-4">
                <StockAutocompleteInput
                  value={searchValue}
                  onChange={setSearchValue}
                  onSelect={(item) => {
                    setSearchValue(item.symbol);
                    navigate(`/OptionChain?symbol=${item.symbol}`);
                  }}
                  placeholder="Search stock for option chain"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline" className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
                <Link to={stockFromPortfolio ? `/StockDetail?id=${stock.id}` : '/Portfolio'}>
                  <ExternalLink className="h-4 w-4" />
                  {stockFromPortfolio ? 'Back to details' : 'Back to portfolio'}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[36px] border border-white/10 bg-[#0a1018]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.26)]">
        <TradingViewEmbed stock={stock} title="TradingView Option Desk Chart" compact height={460} />
      </section>

      <section className="rounded-[36px] border border-white/10 bg-[#0a1018]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.26)]">
        <OptionChainPanel stock={stock} />
      </section>
    </div>
  );
}
