import { buildScenarioPrices, buildTimelinePoints, getCatalogSnapshot, getSectorBenchmark, getStockProfile } from '@/lib/marketData';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatCurrency(value, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

export function formatCompactCurrency(value, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(toNumber(value));
}

export function formatPercent(value, fractionDigits = 1) {
  const amount = toNumber(value);
  return `${amount >= 0 ? '+' : ''}${amount.toFixed(fractionDigits)}%`;
}

export function enrichHolding(stock) {
  const profile = getStockProfile(stock?.symbol);
  const quantity = toNumber(stock?.quantity);
  const buyPrice = toNumber(stock?.buy_price, profile.current_price);
  const currentPrice = toNumber(stock?.current_price, profile.current_price);
  const invested = quantity * buyPrice;
  const value = quantity * currentPrice;
  const pnl = value - invested;
  const pnlPercent = buyPrice > 0 ? ((currentPrice - buyPrice) / buyPrice) * 100 : 0;
  const benchmark = getSectorBenchmark(stock?.sector || profile.sector);
  const monthlyIncome = value * (toNumber(stock?.dividend_yield, profile.dividend_yield) / 100) / 12;
  const convictionScore = Math.max(
    45,
    Math.min(
      95,
      Math.round(
        68
        + (pnlPercent * 0.5)
        + ((benchmark.expected_return - benchmark.risk) * 0.6)
        - (Math.max(toNumber(stock?.beta, profile.beta) - 1, 0) * 12)
      ),
    ),
  );

  return {
    ...profile,
    ...stock,
    quantity,
    buy_price: buyPrice,
    current_price: currentPrice,
    beta: toNumber(stock?.beta, profile.beta),
    pe_ratio: toNumber(stock?.pe_ratio, profile.pe_ratio),
    dividend_yield: toNumber(stock?.dividend_yield, profile.dividend_yield),
    exchange: stock?.exchange || profile.exchange,
    sector: stock?.sector || profile.sector,
    name: stock?.name || profile.name,
    market_cap: stock?.market_cap || profile.market_cap,
    invested,
    value,
    pnl,
    pnlPercent,
    allocation: 0,
    monthlyIncome,
    benchmark,
    convictionScore,
    timeline: buildTimelinePoints({ ...stock, current_price: currentPrice, buy_price: buyPrice }),
    scenarios: buildScenarioPrices({ ...stock, current_price: currentPrice, buy_price: buyPrice, beta: toNumber(stock?.beta, profile.beta) }),
    thesis: stock?.notes || profile.thesis,
  };
}

export function derivePortfolioAnalytics(stocks = []) {
  const holdings = stocks.map(enrichHolding);
  const totalInvested = holdings.reduce((sum, row) => sum + row.invested, 0);
  const totalValue = holdings.reduce((sum, row) => sum + row.value, 0);
  const totalPnL = totalValue - totalInvested;
  const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
  const monthlyIncome = holdings.reduce((sum, row) => sum + row.monthlyIncome, 0);
  const weightedBeta = totalValue > 0
    ? holdings.reduce((sum, row) => sum + (row.value * row.beta), 0) / totalValue
    : 0;

  const withAllocation = holdings
    .map((row) => ({
      ...row,
      allocation: totalValue > 0 ? (row.value / totalValue) * 100 : 0,
    }))
    .sort((left, right) => right.value - left.value);

  const sectorMap = new Map();
  withAllocation.forEach((row) => {
    const current = sectorMap.get(row.sector) || { sector: row.sector, value: 0, invested: 0 };
    current.value += row.value;
    current.invested += row.invested;
    sectorMap.set(row.sector, current);
  });

  const sectorExposure = [...sectorMap.values()]
    .map((sector) => ({
      ...sector,
      allocation: totalValue > 0 ? (sector.value / totalValue) * 100 : 0,
      pnl: sector.value - sector.invested,
    }))
    .sort((left, right) => right.value - left.value);

  const diversificationScore = withAllocation.length === 0
    ? 0
    : Math.max(20, Math.round(100 - ((sectorExposure[0]?.allocation || 0) * 0.9) - (withAllocation[0]?.allocation || 0) * 0.7));

  const riskScore = withAllocation.length === 0
    ? 0
    : Math.max(18, Math.min(94, Math.round(
      (weightedBeta * 32)
      + ((withAllocation[0]?.allocation || 0) * 0.7)
      + ((sectorExposure[0]?.allocation || 0) * 0.35)
      - (diversificationScore * 0.18),
    )));

  const topWinner = [...withAllocation].sort((left, right) => right.pnlPercent - left.pnlPercent)[0] || null;
  const topLoser = [...withAllocation].sort((left, right) => left.pnlPercent - right.pnlPercent)[0] || null;

  const rebalanceIdeas = withAllocation
    .filter((row) => row.allocation >= 18 || row.beta >= 1.2)
    .slice(0, 3)
    .map((row) => ({
      symbol: row.symbol,
      action: row.allocation >= 18 ? 'Trim' : 'Watch risk',
      reason: row.allocation >= 18
        ? `${row.symbol} is ${row.allocation.toFixed(1)}% of the portfolio, above a healthy single-position range.`
        : `${row.symbol} has elevated beta for its current size, which can amplify drawdowns.`,
    }));

  return {
    holdings: withAllocation,
    totals: {
      totalInvested,
      totalValue,
      totalPnL,
      totalPnLPercent,
      monthlyIncome,
      weightedBeta,
      diversificationScore,
      riskScore,
    },
    sectorExposure,
    topWinner,
    topLoser,
    rebalanceIdeas,
    performanceSeries: withAllocation.map((row) => ({
      symbol: row.symbol,
      pnl: row.pnl,
      pnlPercent: row.pnlPercent,
      allocation: row.allocation,
    })),
  };
}

export function deriveWatchlistAnalytics(items = [], holdings = []) {
  const ownedSymbols = new Set((holdings || []).map((row) => row.symbol));

  return items.map((item) => {
    const profile = getStockProfile(item?.symbol);
    const currentPrice = toNumber(item?.current_price, profile.current_price);
    const targetPrice = toNumber(item?.target_price, currentPrice);
    const upside = targetPrice > 0 && currentPrice > 0 ? ((targetPrice - currentPrice) / currentPrice) * 100 : 0;
    const status = targetPrice <= 0
      ? 'No target'
      : currentPrice <= targetPrice
        ? 'Buy zone'
        : upside >= -5
          ? 'Near target'
          : 'Above target';

    return {
      ...profile,
      ...item,
      current_price: currentPrice,
      target_price: targetPrice,
      upside,
      status,
      alreadyOwned: ownedSymbols.has(item.symbol),
    };
  });
}

export function buildRiskNarrative(analytics) {
  const { totals, sectorExposure, holdings } = analytics;
  const biggestSector = sectorExposure[0];
  const biggestHolding = holdings[0];

  return {
    riskFactors: [
      biggestHolding
        ? `${biggestHolding.symbol} drives ${biggestHolding.allocation.toFixed(1)}% of portfolio value, so single-stock risk is meaningful.`
        : 'No holdings yet.',
      biggestSector
        ? `${biggestSector.sector} is the largest sector weight at ${biggestSector.allocation.toFixed(1)}%.`
        : 'Sector exposure is not available yet.',
      totals.weightedBeta > 1
        ? `Weighted beta of ${totals.weightedBeta.toFixed(2)} suggests above-market sensitivity.`
        : `Weighted beta of ${totals.weightedBeta.toFixed(2)} keeps volatility closer to defensive levels.`,
    ],
    summary: holdings.length === 0
      ? 'Add holdings to generate a portfolio risk narrative.'
      : `Risk score ${totals.riskScore}/100 with diversification score ${totals.diversificationScore}/100. The main pressure points are concentration, sector clustering, and portfolio beta.`,
  };
}

export function getMarketLeaders() {
  return getCatalogSnapshot()
    .sort((left, right) => right.day_change_percent - left.day_change_percent)
    .slice(0, 6);
}

export function getMarketLaggards() {
  return getCatalogSnapshot()
    .sort((left, right) => left.day_change_percent - right.day_change_percent)
    .slice(0, 6);
}
