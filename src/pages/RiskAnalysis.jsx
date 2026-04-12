import React, { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { buildRiskNarrative, derivePortfolioAnalytics, formatCurrency } from '@/lib/portfolioAnalytics';
import { buildPortfolioAdvancedMetrics } from '@/lib/advancedAnalytics';
import { getCompanyIntelligence } from '@/lib/brokerClient';

export default function RiskAnalysis() {
  const [openSector, setOpenSector] = useState(null);
  const { data: stocks = [] } = useQuery({
    queryKey: ['stocks'],
    queryFn: () => base44.entities.Stock.list('-created_date'),
  });
  const intelligenceQueries = useQueries({
    queries: stocks.map((stock) => ({
      queryKey: ['company-intelligence', stock.symbol],
      queryFn: () => getCompanyIntelligence(stock.symbol),
      enabled: Boolean(stock.symbol),
      staleTime: 1000 * 60 * 60,
      retry: false,
    })),
  });
  const sectorOverrides = useMemo(() => {
    const next = new Map();
    intelligenceQueries.forEach((query, index) => {
      const symbol = String(stocks[index]?.symbol || '').trim().toUpperCase();
      const sector = String(query.data?.meta?.sector || '').trim();
      if (symbol && sector) {
        next.set(symbol, sector);
      }
    });
    return next;
  }, [intelligenceQueries, stocks]);
  const sectorResolvedStocks = useMemo(
    () => stocks.map((stock) => ({
      ...stock,
      sector: sectorOverrides.get(String(stock.symbol || '').trim().toUpperCase()) || stock.sector,
    })),
    [sectorOverrides, stocks],
  );

  const analytics = useMemo(
    () => derivePortfolioAnalytics(sectorResolvedStocks, { includeTimeline: false, includeScenarios: false }),
    [sectorResolvedStocks],
  );
  const advancedMetrics = useMemo(() => buildPortfolioAdvancedMetrics(analytics), [analytics]);
  const narrative = useMemo(() => buildRiskNarrative(analytics), [analytics]);
  const report = useMemo(() => ({
    risk_score: analytics.totals.riskScore,
    diversification_score: analytics.totals.diversificationScore,
    concentration_risks: analytics.holdings
      .filter((holding) => holding.allocation >= 18)
      .map((holding) => ({
        symbol: holding.symbol,
        weight: holding.allocation,
        concern: holding.allocation >= 25 ? 'Oversized single position' : 'Moderately concentrated position',
      })),
    sector_exposure: analytics.sectorExposure.map((sector) => ({
      sector: sector.sector,
      percentage: sector.allocation,
      holdings: analytics.holdings
        .filter((holding) => (holding.sector || 'Unknown') === sector.sector)
        .sort((left, right) => right.allocation - left.allocation)
        .map((holding) => ({
          id: holding.id,
          symbol: holding.symbol,
          name: holding.name,
          allocation: holding.allocation,
          value: holding.value,
        })),
    })),
    portfolio_beta: analytics.totals.weightedBeta,
    risk_factors: narrative.riskFactors,
    hedging_suggestions: analytics.rebalanceIdeas.map((idea) => ({ strategy: `${idea.action} ${idea.symbol}`, description: idea.reason })),
    summary: narrative.summary,
  }), [analytics, narrative]);

  return (
    <div className="space-y-6">
      <section className="app-hero rounded-[36px] p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-orange-500/80">Risk lab</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Stress-test the portfolio before it surprises you</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Review concentration, sector clustering, portfolio beta, and rebalance ideas in the same place you manage holdings.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Auto-calculated from current portfolio holdings
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Risk Score', value: `${report.risk_score}/100`, note: report.risk_score >= 65 ? 'Higher risk posture' : 'Contained risk posture' },
          { label: 'Diversification', value: `${report.diversification_score}/100`, note: 'Higher is healthier' },
          { label: 'Portfolio Beta', value: report.portfolio_beta.toFixed(2), note: 'Volatility vs benchmark' },
        ].map((card) => (
          <div key={card.label} className="app-panel rounded-[28px] p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{card.value}</p>
            <p className="mt-2 text-sm text-slate-500">{card.note}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Absolute Return',
            value: `${advancedMetrics.absoluteReturnPercent >= 0 ? '+' : ''}${advancedMetrics.absoluteReturnPercent.toFixed(1)}%`,
            note: 'Total portfolio performance',
          },
          {
            label: 'CAGR',
            value: Number.isFinite(advancedMetrics.cagrPercent) ? `${advancedMetrics.cagrPercent >= 0 ? '+' : ''}${advancedMetrics.cagrPercent.toFixed(1)}%` : 'Unavailable',
            note: 'Annualized since first purchase',
          },
          {
            label: 'XIRR',
            value: Number.isFinite(advancedMetrics.xirrPercent) ? `${advancedMetrics.xirrPercent >= 0 ? '+' : ''}${advancedMetrics.xirrPercent.toFixed(1)}%` : 'Unavailable',
            note: 'Cashflow-aware annualized return',
          },
          {
            label: 'Treynor Ratio',
            value: Number.isFinite(advancedMetrics.treynorRatio) ? advancedMetrics.treynorRatio.toFixed(2) : 'Unavailable',
            note: 'Return earned per unit of market risk',
          },
        ].map((card) => (
          <div key={card.label} className="rounded-[28px] border border-white/10 bg-[#0b1624]/90 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{card.value}</p>
            <p className="mt-2 text-sm text-slate-400">{card.note}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-[32px] border border-white/10 bg-[#0b1624]/90 p-6">
          <div className="flex items-center gap-2 text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            <h2 className="text-xl font-semibold text-white">Key Risk Factors</h2>
          </div>
          <div className="mt-5 space-y-3">
            {report.risk_factors.map((risk, index) => (
              <div key={`${risk}-${index}`} className="rounded-[24px] border border-rose-300/12 bg-rose-300/5 p-4 text-sm leading-7 text-slate-300">
                {risk}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-[#0b1624]/90 p-6">
          <div className="flex items-center gap-2 text-emerald-300">
            <Shield className="h-4 w-4" />
            <h2 className="text-xl font-semibold text-white">Rebalance and Hedge Ideas</h2>
          </div>
          <div className="mt-5 space-y-3">
            {report.hedging_suggestions.length > 0 ? report.hedging_suggestions.map((idea, index) => (
              <div key={`${idea.strategy}-${index}`} className="rounded-[24px] border border-emerald-300/12 bg-emerald-300/5 p-4">
                <p className="font-medium text-white">{idea.strategy}</p>
                <p className="mt-2 text-sm leading-7 text-slate-300">{idea.description}</p>
              </div>
            )) : (
              <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-400">No major rebalancing actions are currently flagged.</div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[32px] border border-white/10 bg-[#0b1624]/90 p-6">
          <h2 className="text-xl font-semibold text-white">Concentration Checks</h2>
          <div className="mt-5 space-y-3">
            {report.concentration_risks.length > 0 ? report.concentration_risks.map((risk) => (
              <div key={risk.symbol} className="flex items-center justify-between rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-4">
                <div>
                  <p className="font-medium text-white">{risk.symbol}</p>
                  <p className="text-sm text-slate-400">{risk.concern}</p>
                </div>
                <p className="text-sm font-semibold text-amber-300">{risk.weight.toFixed(1)}%</p>
              </div>
            )) : (
              <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-400">No positions are breaching the concentration threshold.</div>
            )}
          </div>

          <div className="mt-6 rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
            <p className="text-sm font-medium text-white">Summary</p>
            <p className="mt-3 text-sm leading-7 text-slate-300">{report.summary}</p>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-[#0b1624]/90 p-6">
          <h2 className="text-xl font-semibold text-white">Sector Exposure</h2>
          <div className="mt-5 space-y-4">
            {report.sector_exposure.map((sector) => (
              <div key={sector.sector} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                <button
                  type="button"
                  onClick={() => setOpenSector((current) => (current === sector.sector ? null : sector.sector))}
                  className="w-full text-left"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-300">{sector.sector}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {sector.holdings.length} stock{sector.holdings.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold text-white">{sector.percentage.toFixed(1)}%</p>
                      {openSector === sector.sector ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </div>
                </button>
                <div className="h-3 overflow-hidden rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-cyan-400" style={{ width: `${Math.min(sector.percentage, 100)}%` }} />
                </div>

                {openSector === sector.sector ? (
                  <div className="mt-4 space-y-2">
                    {sector.holdings.map((holding) => (
                      <div key={holding.id || `${sector.sector}-${holding.symbol}`} className="flex items-center justify-between rounded-[18px] border border-white/8 bg-[#101925] px-3 py-3">
                        <div>
                          <p className="text-sm font-medium text-white">{holding.symbol}</p>
                          <p className="mt-1 text-xs text-slate-400">{holding.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-white">{holding.allocation.toFixed(1)}%</p>
                          <p className="mt-1 text-xs text-slate-400">{formatCurrency(holding.value)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
            <p className="text-sm font-medium text-white">Capital at risk</p>
            <p className="mt-3 text-2xl font-semibold text-white">{formatCurrency(analytics.totals.totalValue)}</p>
            <p className="mt-2 flex items-center gap-2 text-sm text-slate-400">
              <ArrowRight className="h-4 w-4 text-amber-300" />
              Review the largest sector and largest position before adding new capital.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
