import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Shield } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { buildRiskNarrative, derivePortfolioAnalytics, formatCurrency } from '@/lib/portfolioAnalytics';

export default function RiskAnalysis() {
  const { data: stocks = [] } = useQuery({
    queryKey: ['stocks'],
    queryFn: () => base44.entities.Stock.list('-created_date'),
  });

  const analytics = useMemo(
    () => derivePortfolioAnalytics(stocks, { includeTimeline: false, includeScenarios: false }),
    [stocks],
  );
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
    })),
    portfolio_beta: analytics.totals.weightedBeta,
    risk_factors: narrative.riskFactors,
    hedging_suggestions: analytics.rebalanceIdeas.map((idea) => ({ strategy: `${idea.action} ${idea.symbol}`, description: idea.reason })),
    summary: narrative.summary,
  }), [analytics, narrative]);

  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-white/10 bg-[#0b1624]/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Risk lab</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Stress-test the portfolio before it surprises you</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-300">
              Review concentration, sector clustering, portfolio beta, and rebalance ideas in the same place you manage holdings.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
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
              <div key={sector.sector}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm text-slate-300">{sector.sector}</p>
                  <p className="text-sm font-semibold text-white">{sector.percentage.toFixed(1)}%</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-cyan-400" style={{ width: `${Math.min(sector.percentage, 100)}%` }} />
                </div>
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
