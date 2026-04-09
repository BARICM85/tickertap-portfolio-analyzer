function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intrinsicAtExpiry(leg, spot) {
  if (leg.segment === 'FUTURES') {
    return leg.side === 'BUY' ? spot - leg.entryPrice : leg.entryPrice - spot;
  }

  if (leg.optionType === 'CE') {
    const intrinsic = Math.max(spot - leg.strike, 0);
    return leg.side === 'BUY' ? intrinsic - leg.entryPrice : leg.entryPrice - intrinsic;
  }

  const intrinsic = Math.max(leg.strike - spot, 0);
  return leg.side === 'BUY' ? intrinsic - leg.entryPrice : leg.entryPrice - intrinsic;
}

function contractMultiplier(leg) {
  return safeNumber(leg.lotSize, 1) * safeNumber(leg.lots, 1);
}

export function createBuilderLeg(contract, side = 'BUY', lots = 1) {
  return {
    id: `${contract.contractSymbol}-${side}-${Math.random().toString(16).slice(2, 8)}`,
    contractSymbol: contract.contractSymbol,
    segment: contract.segment || 'OPTIONS',
    optionType: contract.optionType || null,
    strike: safeNumber(contract.strike, 0),
    expiry: contract.expiry || '',
    side,
    lots: safeNumber(lots, 1),
    lotSize: safeNumber(contract.lotSize, 1),
    entryPrice: safeNumber(contract.price, 0),
    underlying: contract.underlying || contract.symbol || '',
  };
}

export function buildPayoffPoints(legs = [], spotPrice = 0) {
  if (!legs.length) return [];

  const strikes = legs.map((leg) => leg.strike).filter(Boolean);
  const reference = safeNumber(spotPrice, strikes[0] || 100);
  const minStrike = strikes.length ? Math.min(...strikes) : reference;
  const maxStrike = strikes.length ? Math.max(...strikes) : reference;
  const start = Math.max(1, Math.floor(Math.min(reference, minStrike) * 0.7));
  const end = Math.ceil(Math.max(reference, maxStrike) * 1.3);
  const steps = 28;
  const stepSize = Math.max((end - start) / steps, 1);

  return Array.from({ length: steps + 1 }, (_, index) => {
    const spot = start + (index * stepSize);
    const pnl = legs.reduce((sum, leg) => sum + (intrinsicAtExpiry(leg, spot) * contractMultiplier(leg)), 0);
    return {
      spot,
      pnl,
    };
  });
}

export function summarizeBuilder(legs = [], spotPrice = 0) {
  const points = buildPayoffPoints(legs, spotPrice);
  if (!points.length) {
    return {
      points: [],
      currentPnl: 0,
      maxProfit: null,
      maxLoss: null,
      breakevens: [],
    };
  }

  const currentPnl = legs.reduce((sum, leg) => sum + (intrinsicAtExpiry(leg, safeNumber(spotPrice, 0)) * contractMultiplier(leg)), 0);
  const values = points.map((point) => point.pnl);
  const maxProfit = Math.max(...values);
  const maxLoss = Math.min(...values);
  const breakevens = [];

  points.forEach((point, index) => {
    if (index === 0) return;
    const previous = points[index - 1];
    if ((previous.pnl <= 0 && point.pnl >= 0) || (previous.pnl >= 0 && point.pnl <= 0)) {
      breakevens.push(((previous.spot + point.spot) / 2));
    }
  });

  return {
    points,
    currentPnl,
    maxProfit,
    maxLoss,
    breakevens: [...new Set(breakevens.map((value) => Number(value.toFixed(2))))],
  };
}
