import { getSectorBenchmark } from '@/lib/marketData';

const RISK_FREE_RATE = 0.07;
const TRADING_DAYS = 252;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(start, end) {
  return Math.max((end.getTime() - start.getTime()) / 86400000, 0);
}

function yearsBetween(start, end) {
  return daysBetween(start, end) / 365.25;
}

function mean(values = []) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values = []) {
  if (values.length < 2) return null;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function covariance(seriesA = [], seriesB = []) {
  if (seriesA.length < 2 || seriesA.length !== seriesB.length) return null;
  const meanA = mean(seriesA);
  const meanB = mean(seriesB);
  const total = seriesA.reduce((sum, value, index) => sum + ((value - meanA) * (seriesB[index] - meanB)), 0);
  return total / (seriesA.length - 1);
}

function calculateCagr(startValue, endValue, startDate, endDate = new Date()) {
  if (startValue <= 0 || endValue <= 0) return null;
  const years = yearsBetween(startDate, endDate);
  if (!Number.isFinite(years) || years <= 0) return null;
  return ((endValue / startValue) ** (1 / years)) - 1;
}

function calculateXirr(cashflows = []) {
  if (cashflows.length < 2) return null;
  const sorted = [...cashflows]
    .map((entry) => ({ amount: toNumber(entry.amount), date: parseDate(entry.date) }))
    .filter((entry) => entry.date && Number.isFinite(entry.amount))
    .sort((left, right) => left.date - right.date);

  if (sorted.length < 2) return null;
  const startDate = sorted[0].date;

  const npv = (rate) => sorted.reduce((sum, flow) => {
    const years = yearsBetween(startDate, flow.date);
    return sum + (flow.amount / ((1 + rate) ** years));
  }, 0);

  const derivative = (rate) => sorted.reduce((sum, flow) => {
    const years = yearsBetween(startDate, flow.date);
    if (years === 0) return sum;
    return sum - ((years * flow.amount) / ((1 + rate) ** (years + 1)));
  }, 0);

  let rate = 0.12;
  for (let step = 0; step < 50; step += 1) {
    const value = npv(rate);
    const slope = derivative(rate);
    if (!Number.isFinite(value) || !Number.isFinite(slope) || Math.abs(slope) < 1e-10) break;
    const nextRate = rate - (value / slope);
    if (!Number.isFinite(nextRate) || nextRate <= -0.9999) break;
    if (Math.abs(nextRate - rate) < 1e-7) {
      rate = nextRate;
      break;
    }
    rate = nextRate;
  }

  return Number.isFinite(rate) ? rate : null;
}

function buildCashflowsFromHolding(holding) {
  const lots = Array.isArray(holding?.purchase_history) && holding.purchase_history.length
    ? holding.purchase_history
    : [];

  const cashflows = lots
    .map((lot) => ({
      amount: -(toNumber(lot.buy_value, toNumber(lot.quantity) * toNumber(lot.buy_price))),
      date: lot.buy_date,
    }))
    .filter((entry) => entry.amount < 0 && parseDate(entry.date));

  if (holding?.value > 0) {
    cashflows.push({
      amount: toNumber(holding.value),
      date: new Date().toISOString(),
    });
  }

  return cashflows;
}

function normalizeHistoryPoints(points = []) {
  return points
    .map((point) => ({
      ...point,
      date: point?.date,
      close: toNumber(point?.close),
      high: toNumber(point?.high),
      low: toNumber(point?.low),
      volume: toNumber(point?.volume),
    }))
    .filter((point) => point.date && point.close > 0)
    .sort((left, right) => new Date(left.date) - new Date(right.date));
}

function calculateReturnSeries(points = []) {
  const series = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous?.close || !current?.close) continue;
    series.push({
      date: current.date,
      value: (current.close / previous.close) - 1,
    });
  }
  return series;
}

function alignReturnSeries(stockSeries = [], benchmarkSeries = []) {
  const benchmarkMap = new Map(benchmarkSeries.map((entry) => [entry.date, entry.value]));
  const stockValues = [];
  const benchmarkValues = [];

  stockSeries.forEach((entry) => {
    const benchmarkValue = benchmarkMap.get(entry.date);
    if (!Number.isFinite(benchmarkValue)) return;
    stockValues.push(entry.value);
    benchmarkValues.push(benchmarkValue);
  });

  return { stockValues, benchmarkValues };
}

function calculateMaxDrawdown(points = []) {
  let peak = null;
  let drawdown = 0;

  points.forEach((point) => {
    if (!Number.isFinite(point.close) || point.close <= 0) return;
    peak = peak === null ? point.close : Math.max(peak, point.close);
    const currentDrawdown = peak > 0 ? ((point.close - peak) / peak) : 0;
    drawdown = Math.min(drawdown, currentDrawdown);
  });

  return Math.abs(drawdown);
}

function calculateRsi(points = [], period = 14) {
  if (points.length <= period) return null;
  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = points[index].close - points[index - 1].close;
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let index = period + 1; index < points.length; index += 1) {
    const change = points[index].close - points[index - 1].close;
    avgGain = ((avgGain * (period - 1)) + Math.max(change, 0)) / period;
    avgLoss = ((avgLoss * (period - 1)) + Math.max(-change, 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function movingAverage(points = [], length = 50) {
  if (points.length < length) return null;
  const window = points.slice(-length);
  return mean(window.map((point) => point.close));
}

function classifyTrend(close, ma50, ma200) {
  if (!Number.isFinite(close) || !Number.isFinite(ma50) || !Number.isFinite(ma200)) return 'Insufficient data';
  if (close > ma50 && ma50 > ma200) return 'Uptrend';
  if (close < ma50 && ma50 < ma200) return 'Downtrend';
  return 'Sideways';
}

function classifyVolumeStrength(currentVolume, averageVolume) {
  if (!Number.isFinite(currentVolume) || !Number.isFinite(averageVolume) || averageVolume <= 0) {
    return { label: 'Unavailable', ratio: null };
  }

  const ratio = currentVolume / averageVolume;
  if (ratio >= 1.5) return { label: 'Strong', ratio };
  if (ratio >= 0.8) return { label: 'Normal', ratio };
  return { label: 'Weak', ratio };
}

function getRecentRange(points = [], lookback = 60) {
  const window = points.slice(-lookback);
  if (!window.length) return { support: null, resistance: null };
  return {
    support: Math.min(...window.map((point) => point.low || point.close)),
    resistance: Math.max(...window.map((point) => point.high || point.close)),
  };
}

function classifySectorRisk(sector = '') {
  const benchmark = getSectorBenchmark(sector);
  if (benchmark.risk >= 20) return 'High';
  if (benchmark.risk >= 15) return 'Moderate';
  return 'Low';
}

export function getHoldingStartDate(holding) {
  const dates = (holding?.purchase_history || [])
    .map((lot) => parseDate(lot.buy_date))
    .filter(Boolean)
    .sort((left, right) => left - right);

  if (dates.length) return dates[0];
  return parseDate(holding?.buy_date);
}

export function getSuggestedHistoryRange(startDate) {
  const date = parseDate(startDate);
  if (!date) return '1y';
  const ageDays = daysBetween(date, new Date());
  if (ageDays <= 400) return '1y';
  if (ageDays <= 1100) return '3y';
  if (ageDays <= 1850) return '5y';
  return 'all';
}

export function buildPortfolioAdvancedMetrics(analytics) {
  const holdings = analytics?.holdings || [];
  const startDates = holdings
    .map((holding) => getHoldingStartDate(holding))
    .filter(Boolean)
    .sort((left, right) => left - right);

  const startDate = startDates[0] || null;
  const xirr = calculateXirr(
    holdings.flatMap((holding) => buildCashflowsFromHolding(holding)),
  );
  const cagr = startDate
    ? calculateCagr(
      toNumber(analytics?.totals?.totalInvested),
      toNumber(analytics?.totals?.totalValue),
      startDate,
    )
    : null;
  const treynor = Number.isFinite(analytics?.totals?.weightedBeta) && analytics.totals.weightedBeta > 0 && cagr !== null
    ? (cagr - RISK_FREE_RATE) / analytics.totals.weightedBeta
    : null;

  return {
    absoluteReturnPercent: toNumber(analytics?.totals?.totalPnLPercent),
    cagrPercent: cagr !== null ? cagr * 100 : null,
    xirrPercent: xirr !== null ? xirr * 100 : null,
    weightedBeta: toNumber(analytics?.totals?.weightedBeta),
    treynorRatio: treynor,
    startDate,
    topHoldingWeight: toNumber(analytics?.holdings?.[0]?.allocation),
    topSectorWeight: toNumber(analytics?.sectorExposure?.[0]?.allocation),
  };
}

export function buildStockAdvancedMetrics(holding, historyPayload, benchmarkPayload) {
  const points = normalizeHistoryPoints(historyPayload?.points || []);
  const benchmarkPoints = normalizeHistoryPoints(benchmarkPayload?.points || []);
  const startDate = getHoldingStartDate(holding) || parseDate(points[0]?.date);
  const now = new Date();
  const stockReturnSeries = calculateReturnSeries(points);
  const benchmarkReturnSeries = calculateReturnSeries(benchmarkPoints);
  const aligned = alignReturnSeries(stockReturnSeries, benchmarkReturnSeries);

  const volatility = standardDeviation(stockReturnSeries.map((entry) => entry.value));
  const downsideDeviation = standardDeviation(
    stockReturnSeries
      .map((entry) => Math.min(entry.value, 0))
      .filter((value) => value < 0),
  );
  const annualizedMeanReturn = mean(stockReturnSeries.map((entry) => entry.value));
  const annualizedBenchmarkReturn = mean(benchmarkReturnSeries.map((entry) => entry.value));

  const ma50 = movingAverage(points, 50);
  const ma200 = movingAverage(points, 200);
  const latestPoint = points[points.length - 1];
  const recentRange = getRecentRange(points);
  const currentVolume = latestPoint?.volume ?? null;
  const averageVolume20 = points.length >= 20
    ? mean(points.slice(-20).map((point) => point.volume))
    : null;
  const volumeStrength = classifyVolumeStrength(currentVolume, averageVolume20);

  const benchmarkReturn = benchmarkPoints.length >= 2
    ? ((benchmarkPoints[benchmarkPoints.length - 1].close / benchmarkPoints[0].close) - 1)
    : null;
  const betaFromHistory = aligned.stockValues.length >= 20
    ? (covariance(aligned.stockValues, aligned.benchmarkValues) / (standardDeviation(aligned.benchmarkValues) ** 2))
    : null;
  const effectiveBeta = Number.isFinite(betaFromHistory) ? betaFromHistory : toNumber(holding?.beta, null);
  const absoluteReturn = toNumber(holding?.pnlPercent) / 100;
  const cagr = startDate ? calculateCagr(toNumber(holding?.invested), toNumber(holding?.value), startDate, now) : null;
  const xirr = calculateXirr(buildCashflowsFromHolding(holding));
  const annualReturn = annualizedMeanReturn !== null ? annualizedMeanReturn * TRADING_DAYS : null;
  const annualBenchmark = annualizedBenchmarkReturn !== null ? annualizedBenchmarkReturn * TRADING_DAYS : null;
  const sharpe = annualReturn !== null && volatility ? (annualReturn - RISK_FREE_RATE) / (volatility * Math.sqrt(TRADING_DAYS)) : null;
  const sortino = annualReturn !== null && downsideDeviation ? (annualReturn - RISK_FREE_RATE) / (downsideDeviation * Math.sqrt(TRADING_DAYS)) : null;
  const treynor = annualReturn !== null && effectiveBeta ? (annualReturn - RISK_FREE_RATE) / effectiveBeta : null;
  const alpha = cagr !== null && annualBenchmark !== null && effectiveBeta
    ? (cagr - (RISK_FREE_RATE + (effectiveBeta * (annualBenchmark - RISK_FREE_RATE))))
    : (absoluteReturn !== null && benchmarkReturn !== null ? absoluteReturn - benchmarkReturn : null);

  return {
    performance: {
      absoluteReturnPercent: absoluteReturn * 100,
      cagrPercent: cagr !== null ? cagr * 100 : null,
      xirrPercent: xirr !== null ? xirr * 100 : null,
      benchmarkReturnPercent: benchmarkReturn !== null ? benchmarkReturn * 100 : null,
      priceVsBenchmarkPercent: benchmarkReturn !== null ? (absoluteReturn - benchmarkReturn) * 100 : null,
      alphaPercent: alpha !== null ? alpha * 100 : null,
    },
    risk: {
      volatilityPercent: volatility ? volatility * Math.sqrt(TRADING_DAYS) * 100 : null,
      beta: effectiveBeta,
      maxDrawdownPercent: calculateMaxDrawdown(points) * 100,
      downsideRiskPercent: downsideDeviation ? downsideDeviation * Math.sqrt(TRADING_DAYS) * 100 : null,
    },
    riskAdjusted: {
      sharpeRatio: sharpe,
      sortinoRatio: sortino,
      treynorRatio: treynor,
    },
    technicals: {
      trend: classifyTrend(latestPoint?.close, ma50, ma200),
      support: recentRange.support,
      resistance: recentRange.resistance,
      movingAverage50: ma50,
      movingAverage200: ma200,
      rsi14: calculateRsi(points, 14),
      volumeStrength,
    },
    valuation: {
      peRatio: toNumber(holding?.pe_ratio, null),
      dividendYield: toNumber(holding?.dividend_yield, null),
      marketCap: holding?.market_cap || null,
    },
    stockSpecificRisk: {
      sectorRisk: classifySectorRisk(holding?.sector),
      sector: holding?.sector || 'Unknown',
      portfolioWeight: toNumber(holding?.allocation, null),
    },
    meta: {
      historyRangeDays: points.length,
      benchmarkSymbol: benchmarkPayload?.symbol || '^NSEI',
      historyAvailable: points.length > 20,
    },
  };
}
