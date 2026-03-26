import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Building2, Calendar, ChartNoAxesCombined, CircleDollarSign, Layers3, RefreshCw, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { derivePortfolioAnalytics, formatCurrency, formatPercent } from '@/lib/portfolioAnalytics';

function Metric({ label, value, note }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-3 text-xl font-semibold text-white">{value}</p>
      {note ? <p className="mt-2 text-sm text-slate-400">{note}</p> : null}
    </div>
  );
}

export default function StockDetail() {
  const [searchParams] = useSearchParams();
  const [analysis, setAnalysis] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const queryClient = useQueryClient();
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

  const stockId = searchParams.get('id');
  const { data: stocks = [] } = useQuery({
    queryKey: ['stocks'],
    queryFn: () => base44.entities.Stock.list('-created_date'),
  });

  const analytics = derivePortfolioAnalytics(stocks);
  const stock = analytics.holdings.find((item) => item.id === stockId);

  const refresh = async () => {
    if (!stock) return;
    setRefreshing(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/market/quote?symbol=${encodeURIComponent(stock.symbol)}`);
      if (!response.ok) throw new Error('Live quote unavailable');
      const quote = await response.json();
      await base44.entities.Stock.update(stock.id, { current_price: quote.price || stock.current_price });
    } catch {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Get detailed current information about Indian stock ${stock.symbol} (${stock.name}) listed on NSE/BSE. I need: current price in INR, beta, PE ratio, market cap in INR, dividend yield, and sector.`,
        response_json_schema: {
          type: 'object',
          properties: {
            current_price: { type: 'number' },
            beta: { type: 'number' },
            pe_ratio: { type: 'number' },
            market_cap: { type: 'string' },
            dividend_yield: { type: 'number' },
            sector: { type: 'string' },
          },
        },
      });
      await base44.entities.Stock.update(stock.id, result);
    }
    await queryClient.invalidateQueries({ queryKey: ['stocks'] });
    setRefreshing(false);
  };

  const analyze = async () => {
    if (!stock) return;
    setAnalyzing(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Provide a brief investment analysis for Indian stock ${stock.symbol} (${stock.name}) listed on NSE/BSE. Include current market sentiment, key risks, key opportunities, and a recommendation.`,
      response_json_schema: {
        type: 'object',
        properties: {
          sentiment: { type: 'string' },
          risks: { type: 'array' },
          opportunities: { type: 'array' },
          recommendation: { type: 'string' },
        },
      },
    });
    setAnalysis(result);
    setAnalyzing(false);
  };

  if (!stock) {
    return (
      <div className="rounded-[32px] border border-white/10 bg-[#0b1624]/90 p-8 text-center">
        <p className="text-lg text-white">Holding not found.</p>
        <Link to="/Portfolio" className="mt-4 inline-flex text-amber-300">Back to portfolio</Link>
      </div>
    );
  }

  const positive = stock.pnl >= 0;

  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-white/10 bg-[#0b1624]/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <Link to="/Portfolio" className="rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-300 transition hover:bg-white/10 hover:text-white">
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
              <div className="mt-5 flex flex-wrap gap-3">
                <Badge className="rounded-full bg-white/10 px-4 py-1.5 text-white">Conviction {stock.convictionScore}/100</Badge>
                <Badge className={`rounded-full px-4 py-1.5 ${positive ? 'bg-emerald-400/15 text-emerald-200' : 'bg-rose-400/15 text-rose-200'}`}>
                  {formatPercent(stock.pnlPercent)}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" className="rounded-2xl border-cyan-300/30 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20">
              <Link to={`/StockChart?id=${stock.id}`} target="_blank" rel="noreferrer">
                <ChartNoAxesCombined className="h-4 w-4" />
                Open Full Chart
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-2xl border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20">
              <Link to={`/OptionChain?id=${stock.id}`} target="_blank" rel="noreferrer">
                <Layers3 className="h-4 w-4" />
                Open Option Chain
              </Link>
            </Button>
            <Button variant="outline" onClick={refresh} disabled={refreshing} className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
              <RefreshCw className={refreshing ? 'animate-spin' : ''} />
              Refresh Live Price
            </Button>
            <Button onClick={analyze} disabled={analyzing} className="rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200">
              <Sparkles />
              {analyzing ? 'Analyzing' : 'Generate Thesis'}
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Current Price" value={formatCurrency(stock.current_price)} note={`Day move ${formatPercent(stock.day_change_percent || 0)}`} />
        <Metric label="Position Value" value={formatCurrency(stock.value)} note={`${stock.quantity} shares`} />
        <Metric label="Cost Basis" value={formatCurrency(stock.buy_price)} note={`Bought ${stock.buy_date || 'date not set'}`} />
        <Metric label="Position P&L" value={`${positive ? '+' : '-'}${formatCurrency(Math.abs(stock.pnl))}`} note={formatPercent(stock.pnlPercent)} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[32px] border border-white/10 bg-[#0b1624]/90 p-6">
          <h2 className="text-xl font-semibold text-white">Decision Dashboard</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Metric label="Allocation Weight" value={`${stock.allocation.toFixed(1)}%`} note="Share of total portfolio value" />
            <Metric label="Dividend Yield" value={`${stock.dividend_yield.toFixed(2)}%`} note={`Approx monthly income ${formatCurrency(stock.monthlyIncome)}`} />
            <Metric label="Beta" value={stock.beta.toFixed(2)} note="Volatility versus broad market" />
            <Metric label="P/E Ratio" value={stock.pe_ratio.toFixed(1)} note={`Market cap ${stock.market_cap}`} />
          </div>

          <div className="mt-6 rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
            <div className="flex items-center gap-2 text-amber-300">
              <Building2 className="h-4 w-4" />
              <p className="text-sm font-medium">Investment Thesis</p>
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-300">{stock.thesis}</p>
          </div>

          <div className="mt-6 rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
            <div className="flex items-center gap-2 text-cyan-300">
              <BarChart3 className="h-4 w-4" />
              <p className="text-sm font-medium">Scenario Planning</p>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {stock.scenarios.map((scenario) => (
                <div key={scenario.label} className="rounded-[22px] border border-white/8 bg-[#111c2c] p-4">
                  <p className="text-sm font-medium text-white">{scenario.label}</p>
                  <p className="mt-3 text-xl font-semibold text-amber-200">{formatCurrency(scenario.price)}</p>
                  <p className="mt-2 text-sm text-slate-400">{formatPercent(scenario.move)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-[#0b1624]/90 p-6">
          <h2 className="text-xl font-semibold text-white">Position Health</h2>
          <div className="mt-5 space-y-3">
            {[
              { icon: Calendar, title: 'Holding horizon', text: stock.buy_date ? `Tracking since ${stock.buy_date}. Keep the thesis anchored to your intended time frame.` : 'Add a buy date to compare holding duration with your strategy.' },
              { icon: CircleDollarSign, title: 'Income profile', text: `Annualized dividend estimate is ${formatCurrency(stock.monthlyIncome * 12)} at the current value.` },
              { icon: positive ? TrendingUp : TrendingDown, title: 'Momentum vs cost basis', text: `${stock.symbol} is ${positive ? 'above' : 'below'} cost basis by ${formatPercent(stock.pnlPercent)}.` },
            ].map((item) => (
              <div key={item.title} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                <item.icon className="h-4 w-4 text-amber-300" />
                <p className="mt-3 font-medium text-white">{item.title}</p>
                <p className="mt-2 text-sm text-slate-400">{item.text}</p>
              </div>
            ))}
          </div>

          {analysis ? (
            <div className="mt-6 space-y-4 rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">Generated Analysis</h3>
                <Badge className="rounded-full bg-amber-300/15 text-amber-200">{analysis.sentiment}</Badge>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Risks</p>
                <div className="mt-2 space-y-2">
                  {analysis.risks?.map((risk, index) => (
                    <p key={`${risk}-${index}`} className="rounded-2xl border border-rose-300/10 bg-rose-300/5 px-4 py-3 text-sm text-slate-300">{risk}</p>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Opportunities</p>
                <div className="mt-2 space-y-2">
                  {analysis.opportunities?.map((opportunity, index) => (
                    <p key={`${opportunity}-${index}`} className="rounded-2xl border border-emerald-300/10 bg-emerald-300/5 px-4 py-3 text-sm text-slate-300">{opportunity}</p>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Recommendation</p>
                <p className="mt-2 rounded-2xl border border-white/8 bg-[#111c2c] px-4 py-4 text-sm leading-7 text-slate-300">{analysis.recommendation}</p>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
