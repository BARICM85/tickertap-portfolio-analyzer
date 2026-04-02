const STOCK_CATALOG = {
  RELIANCE: {
    name: 'Reliance Industries',
    sector: 'Energy',
    exchange: 'NSE',
    current_price: 2948.4,
    beta: 1.06,
    pe_ratio: 26.8,
    market_cap: '19.9T',
    dividend_yield: 0.38,
    day_change_percent: 1.4,
    thesis: 'Consumer, telecom, and energy cash flows make this a core compounder with multiple growth engines.',
  },
  TCS: {
    name: 'Tata Consultancy Services',
    sector: 'Technology',
    exchange: 'NSE',
    current_price: 4146.2,
    beta: 0.82,
    pe_ratio: 31.4,
    market_cap: '15.0T',
    dividend_yield: 2.9,
    day_change_percent: 0.8,
    thesis: 'Stable margins and strong client retention support lower-volatility portfolio exposure.',
  },
  INFY: {
    name: 'Infosys',
    sector: 'Technology',
    exchange: 'NSE',
    current_price: 1688.55,
    beta: 0.94,
    pe_ratio: 25.3,
    market_cap: '7.0T',
    dividend_yield: 2.4,
    day_change_percent: -0.6,
    thesis: 'A quality IT bellwether with improving large-deal wins and healthy balance sheet quality.',
  },
  HDFCBANK: {
    name: 'HDFC Bank',
    sector: 'Finance',
    exchange: 'NSE',
    current_price: 1624.15,
    beta: 0.9,
    pe_ratio: 18.9,
    market_cap: '12.3T',
    dividend_yield: 1.2,
    day_change_percent: 0.3,
    thesis: 'Large-scale retail banking franchise with resilient deposit engine and broad credit footprint.',
  },
  ICICIBANK: {
    name: 'ICICI Bank',
    sector: 'Finance',
    exchange: 'NSE',
    current_price: 1186.75,
    beta: 1.04,
    pe_ratio: 19.7,
    market_cap: '8.4T',
    dividend_yield: 0.84,
    day_change_percent: 1.1,
    thesis: 'Balance-sheet strength and operating leverage make it a quality growth bank allocation.',
  },
  SBIN: {
    name: 'State Bank of India',
    sector: 'Finance',
    exchange: 'NSE',
    current_price: 787.95,
    beta: 1.17,
    pe_ratio: 10.4,
    market_cap: '7.0T',
    dividend_yield: 1.6,
    day_change_percent: 1.8,
    thesis: 'Public sector lender benefiting from scale, improving asset quality, and valuation support.',
  },
  HINDUNILVR: {
    name: 'Hindustan Unilever',
    sector: 'Consumer Staples',
    exchange: 'NSE',
    current_price: 2432.65,
    beta: 0.52,
    pe_ratio: 54.2,
    market_cap: '5.7T',
    dividend_yield: 1.7,
    day_change_percent: -0.2,
    thesis: 'Defensive consumer staple name that can reduce overall portfolio volatility.',
  },
  ITC: {
    name: 'ITC',
    sector: 'Consumer Staples',
    exchange: 'NSE',
    current_price: 432.9,
    beta: 0.68,
    pe_ratio: 26.1,
    market_cap: '5.4T',
    dividend_yield: 3.1,
    day_change_percent: 0.5,
    thesis: 'Cash generative and yield-supportive holding with FMCG optionality.',
  },
  LT: {
    name: 'Larsen & Toubro',
    sector: 'Industrials',
    exchange: 'NSE',
    current_price: 3726.4,
    beta: 1.11,
    pe_ratio: 35.8,
    market_cap: '5.1T',
    dividend_yield: 0.77,
    day_change_percent: 1.2,
    thesis: 'Infrastructure and project execution exposure adds cyclical participation to the mix.',
  },
  BHARTIARTL: {
    name: 'Bharti Airtel',
    sector: 'Communication Services',
    exchange: 'NSE',
    current_price: 1438.7,
    beta: 0.89,
    pe_ratio: 58.2,
    market_cap: '8.7T',
    dividend_yield: 0.35,
    day_change_percent: 0.7,
    thesis: 'Tariff optionality and improving ARPU trends provide growth with moderate defensiveness.',
  },
  ASIANPAINT: {
    name: 'Asian Paints',
    sector: 'Materials',
    exchange: 'NSE',
    current_price: 2918.55,
    beta: 0.74,
    pe_ratio: 49.1,
    market_cap: '2.8T',
    dividend_yield: 0.95,
    day_change_percent: -0.4,
    thesis: 'Strong brand and distribution quality, though valuation leaves less room for execution misses.',
  },
  SUNPHARMA: {
    name: 'Sun Pharmaceutical',
    sector: 'Healthcare',
    exchange: 'NSE',
    current_price: 1754.35,
    beta: 0.71,
    pe_ratio: 37.9,
    market_cap: '4.2T',
    dividend_yield: 0.83,
    day_change_percent: 0.9,
    thesis: 'Healthcare ballast with specialty pharma upside and lower correlation to cyclical sectors.',
  },
};

const SECTOR_BENCHMARKS = {
  Technology: { expected_return: 14, risk: 19 },
  Finance: { expected_return: 13, risk: 20 },
  Energy: { expected_return: 12, risk: 22 },
  Healthcare: { expected_return: 12, risk: 15 },
  Industrials: { expected_return: 13, risk: 18 },
  'Consumer Staples': { expected_return: 10, risk: 11 },
  'Consumer Discretionary': { expected_return: 13, risk: 21 },
  Utilities: { expected_return: 9, risk: 10 },
  Materials: { expected_return: 11, risk: 17 },
  'Communication Services': { expected_return: 12, risk: 16 },
  'Real Estate': { expected_return: 11, risk: 18 },
};

function hashSymbol(symbol = '') {
  return [...symbol.toUpperCase()].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function fallbackSector(symbol = '') {
  const sectors = Object.keys(SECTOR_BENCHMARKS);
  return sectors[hashSymbol(symbol) % sectors.length];
}

function fallbackEntry(symbol = '') {
  const normalized = symbol.toUpperCase() || 'STOCK';
  const basis = hashSymbol(normalized);
  const sector = fallbackSector(normalized);

  return {
    name: `${normalized} Holdings`,
    sector,
    exchange: basis % 2 === 0 ? 'NSE' : 'BSE',
    current_price: Number((150 + (basis % 3500) + ((basis % 13) * 0.37)).toFixed(2)),
    beta: Number((0.65 + ((basis % 80) / 100)).toFixed(2)),
    pe_ratio: Number((12 + (basis % 36)).toFixed(1)),
    market_cap: `${(120 + (basis % 950)).toLocaleString('en-IN')}B`,
    dividend_yield: Number((0.35 + ((basis % 260) / 100)).toFixed(2)),
    day_change_percent: Number((((basis % 23) - 11) / 4).toFixed(1)),
    thesis: 'Locally generated stock profile based on ticker pattern; replace with your own research if needed.',
  };
}

export function getStockProfile(symbol = '') {
  const normalized = symbol.toUpperCase();
  return STOCK_CATALOG[normalized] || fallbackEntry(normalized);
}

export function getSectorBenchmark(sector = '') {
  return SECTOR_BENCHMARKS[sector] || { expected_return: 11, risk: 16 };
}

export function getCatalogSnapshot() {
  return Object.entries(STOCK_CATALOG).map(([symbol, profile]) => ({
    symbol,
    ...profile,
  }));
}

function normalizeSearchText(value = '') {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function searchStockCatalog(query = '', limit = 8) {
  const needle = query.trim().toUpperCase();
  if (!needle) return getCatalogSnapshot().slice(0, limit);

  return getCatalogSnapshot()
    .map((item) => {
      const symbolScore = item.symbol.startsWith(needle) ? 4 : item.symbol.includes(needle) ? 3 : 0;
      const nameScore = item.name.toUpperCase().startsWith(needle) ? 2 : item.name.toUpperCase().includes(needle) ? 1 : 0;
      return {
        ...item,
        score: symbolScore + nameScore,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.symbol.localeCompare(right.symbol))
    .slice(0, limit);
}

export function resolveStockInput(input = '') {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const directProfile = STOCK_CATALOG[raw.toUpperCase()];
  if (directProfile) {
    return {
      symbol: raw.toUpperCase(),
      ...directProfile,
    };
  }

  const normalizedNeedle = normalizeSearchText(raw);
  const exactNameMatch = getCatalogSnapshot().find((item) => normalizeSearchText(item.name) === normalizedNeedle);
  if (exactNameMatch) return exactNameMatch;

  return searchStockCatalog(raw, 1)[0] || null;
}

export function buildTimelinePoints(stock, months = 6) {
  const symbol = stock?.symbol?.toUpperCase() || 'STOCK';
  const profile = getStockProfile(symbol);
  const startPrice = Number(stock?.buy_price || profile.current_price);
  const currentPrice = Number(stock?.current_price || profile.current_price);
  const drift = currentPrice - startPrice;

  return Array.from({ length: months }, (_, index) => {
    const monthIndex = index + 1;
    const progress = months === 1 ? 1 : index / (months - 1);
    const seasonal = Math.sin((hashSymbol(symbol) + monthIndex) / 3.2) * (startPrice * 0.04);
    const price = Number((startPrice + drift * progress + seasonal).toFixed(2));

    return {
      month: `M${monthIndex}`,
      price,
      benchmark: Number((startPrice + (progress * startPrice * 0.06)).toFixed(2)),
    };
  });
}

export function buildScenarioPrices(stock) {
  const currentPrice = Number(stock?.current_price || stock?.buy_price || 0);
  const beta = Number(stock?.beta || getStockProfile(stock?.symbol).beta || 1);

  return [
    {
      label: 'Bear Case',
      move: Number((-12 - beta * 3).toFixed(1)),
      price: Number((currentPrice * (1 - (12 + beta * 3) / 100)).toFixed(2)),
    },
    {
      label: 'Base Case',
      move: Number((8 + beta * 2).toFixed(1)),
      price: Number((currentPrice * (1 + (8 + beta * 2) / 100)).toFixed(2)),
    },
    {
      label: 'Bull Case',
      move: Number((18 + beta * 4).toFixed(1)),
      price: Number((currentPrice * (1 + (18 + beta * 4) / 100)).toFixed(2)),
    },
  ];
}

export function createDemoPortfolio() {
  return [
    { symbol: 'RELIANCE', quantity: 14, buy_price: 2710, buy_date: '2025-06-12', notes: 'Core energy + telecom compounding thesis.' },
    { symbol: 'TCS', quantity: 8, buy_price: 3890, buy_date: '2024-11-22', notes: 'Defensive IT cash flow anchor.' },
    { symbol: 'ICICIBANK', quantity: 28, buy_price: 1092, buy_date: '2025-08-03', notes: 'Private bank growth exposure.' },
    { symbol: 'SUNPHARMA', quantity: 10, buy_price: 1620, buy_date: '2025-02-18', notes: 'Healthcare ballast.' },
  ].map((row) => {
    const profile = getStockProfile(row.symbol);

    return {
      ...row,
      name: profile.name,
      sector: profile.sector,
      exchange: profile.exchange,
      current_price: profile.current_price,
      currency: 'INR',
      beta: profile.beta,
      pe_ratio: profile.pe_ratio,
      market_cap: profile.market_cap,
      dividend_yield: profile.dividend_yield,
    };
  });
}

export function createDemoWatchlist() {
  return [
    { symbol: 'INFY', target_price: 1600, notes: 'Buy on margin recovery follow-through.' },
    { symbol: 'HINDUNILVR', target_price: 2325, notes: 'Defensive add if valuation cools.' },
    { symbol: 'LT', target_price: 3600, notes: 'Infra cycle tracker.' },
  ].map((row) => {
    const profile = getStockProfile(row.symbol);

    return {
      ...row,
      name: profile.name,
      sector: profile.sector,
      current_price: profile.current_price,
      exchange: profile.exchange,
    };
  });
}
