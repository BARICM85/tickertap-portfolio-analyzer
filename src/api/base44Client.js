import { createDemoWatchlist, getStockProfile } from '@/lib/marketData';
import { buildRiskNarrative, derivePortfolioAnalytics } from '@/lib/portfolioAnalytics';
import { namespacedKey } from '@/lib/appConfig';

const STORAGE_KEYS = {
  stocks: namespacedKey('portfolio_analyzer_stocks'),
  watchlist: namespacedKey('portfolio_analyzer_watchlist'),
  watchlistCollections: namespacedKey('portfolio_analyzer_watchlist_collections'),
  session: namespacedKey('portfolio_analyzer_session'),
  bootstrapped: namespacedKey('portfolio_analyzer_bootstrapped'),
};

const uploadedFiles = new Map();
const isBrowser = typeof window !== 'undefined';

function getNowIso() {
  return new Date().toISOString();
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readCollection(key) {
  if (!isBrowser) return [];
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCollection(key, rows) {
  if (!isBrowser) return;
  window.localStorage.setItem(key, JSON.stringify(rows));
}

function parseNumber(value, fallback = undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSymbolsFromPrompt(prompt = '') {
  const tokens = prompt.toUpperCase().match(/\b[A-Z]{2,15}\b/g) || [];
  const blocked = new Set(['JSON', 'INR', 'NSE', 'BSE', 'LLM', 'USD', 'ETF']);
  return tokens.filter((token, index) => !blocked.has(token) && tokens.indexOf(token) === index);
}

function createDefaultWatchlistCollection() {
  return {
    id: createId(),
    name: 'Watchlist 1',
    archived: false,
    created_date: getNowIso(),
  };
}

function ensureWatchlistCollections() {
  if (!isBrowser) return;

  let collections = readCollection(STORAGE_KEYS.watchlistCollections);
  if (collections.length === 0) {
    const defaultCollection = createDefaultWatchlistCollection();
    collections = [defaultCollection];
    writeCollection(STORAGE_KEYS.watchlistCollections, collections);
  }

  const normalizedCollections = collections.map((item) => ({
    archived: false,
    ...item,
  }));
  if (JSON.stringify(normalizedCollections) !== JSON.stringify(collections)) {
    collections = normalizedCollections;
    writeCollection(STORAGE_KEYS.watchlistCollections, collections);
  }

  const validIds = new Set(collections.map((item) => item.id));
  const defaultListId = collections[0]?.id;
  const watchlist = readCollection(STORAGE_KEYS.watchlist);
  const needsRepair = watchlist.some((item) => !item.list_id || !validIds.has(item.list_id));

  if (needsRepair) {
    writeCollection(
      STORAGE_KEYS.watchlist,
      watchlist.map((item) => ({
        ...item,
        list_id: validIds.has(item.list_id) ? item.list_id : defaultListId,
      })),
    );
  }
}

function ensureSeeded() {
  if (!isBrowser) return;
  ensureWatchlistCollections();
  if (window.localStorage.getItem(STORAGE_KEYS.bootstrapped)) return;

  const collections = readCollection(STORAGE_KEYS.watchlistCollections);
  const defaultListId = collections[0]?.id;

  if (readCollection(STORAGE_KEYS.watchlist).length === 0) {
    const seededWatchlist = createDemoWatchlist(defaultListId).map((row) => ({
      ...row,
      id: createId(),
      created_date: getNowIso(),
    }));
    writeCollection(STORAGE_KEYS.watchlist, seededWatchlist);
  }
  window.localStorage.setItem(STORAGE_KEYS.bootstrapped, 'true');
}

function buildSingleStockInfo(symbol = '') {
  return getStockProfile(symbol);
}

function buildStockAnalysis(symbol = '') {
  const profile = getStockProfile(symbol);
  const sentiment = profile.day_change_percent >= 1 ? 'bullish' : profile.day_change_percent <= -1 ? 'bearish' : 'neutral';

  return {
    sentiment,
    risks: [
      `${profile.sector} valuations can compress if growth expectations cool.`,
      `Beta near ${profile.beta.toFixed(2)} means price swings may exceed defensive names during stress.`,
      'Thesis should be rechecked after every quarterly result and management commentary update.',
    ],
    opportunities: [
      `Current profile shows ${profile.dividend_yield.toFixed(2)}% yield support and established market position.`,
      `If ${profile.sector} leadership strengthens, operating leverage can lift earnings expectations.`,
      'A staggered accumulation plan can improve cost basis instead of relying on one entry point.',
    ],
    recommendation: profile.thesis,
  };
}

function buildRiskReport() {
  const holdings = readCollection(STORAGE_KEYS.stocks);
  const analytics = derivePortfolioAnalytics(holdings);
  const narrative = buildRiskNarrative(analytics);

  return {
    risk_score: analytics.totals.riskScore,
    diversification_score: analytics.totals.diversificationScore,
    concentration_risks: analytics.holdings
      .filter((holding) => holding.allocation >= 18)
      .map((holding) => ({
        symbol: holding.symbol,
        weight: holding.allocation,
        concern: holding.allocation >= 25 ? 'Oversized core position' : 'Position is approaching an oversized allocation',
      })),
    sector_exposure: analytics.sectorExposure.map((sector) => ({
      sector: sector.sector,
      percentage: sector.allocation,
    })),
    portfolio_beta: analytics.totals.weightedBeta,
    risk_factors: narrative.riskFactors,
    hedging_suggestions: analytics.rebalanceIdeas.map((idea) => ({
      strategy: `${idea.action} ${idea.symbol}`,
      description: idea.reason,
    })),
    summary: narrative.summary,
  };
}

function inferResponseFromPrompt(prompt = '') {
  const symbols = parseSymbolsFromPrompt(prompt);
  const symbol = symbols[0] || 'STOCK';
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes('risk analysis') || lowerPrompt.includes('risk score')) {
    return buildRiskReport();
  }
  if (lowerPrompt.includes('prices in indian rupees') && symbols.length > 1) {
    return { prices: symbols.map((ticker) => ({ symbol: ticker, price: getStockProfile(ticker).current_price })) };
  }
  if (lowerPrompt.includes('investment analysis')) {
    return buildStockAnalysis(symbol);
  }
  if (lowerPrompt.includes('company name and current stock price')) {
    const info = buildSingleStockInfo(symbol);
    return { name: info.name, price: info.current_price };
  }
  if (lowerPrompt.includes('return only the price') || lowerPrompt.includes('current stock price')) {
    return { price: getStockProfile(symbol).current_price };
  }
  return buildSingleStockInfo(symbol);
}

function normalizeBySchema(candidate, schema) {
  if (!schema?.properties || typeof candidate !== 'object' || candidate === null) return candidate;

  const output = {};
  Object.entries(schema.properties).forEach(([key, field]) => {
    if (candidate[key] !== undefined) {
      output[key] = candidate[key];
      return;
    }
    if (field.type === 'array') output[key] = [];
    else if (field.type === 'number') output[key] = 0;
    else if (field.type === 'string') output[key] = '';
    else if (field.type === 'object') output[key] = {};
    else output[key] = null;
  });
  return output;
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      const escaped = inQuotes && line[index + 1] === '"';
      if (escaped) {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current.trim());
  return out;
}

function normalizeStockRecord(row) {
  const source = row || {};
  const pick = (...keys) => {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null && `${source[key]}`.trim() !== '') return source[key];
    }
    return undefined;
  };

  const symbol = String(pick('symbol', 'ticker', 'Symbol', 'Ticker') || '').toUpperCase();
  if (!symbol) return null;

  const profile = getStockProfile(symbol);
  const buyPrice = parseNumber(pick('buy_price', 'buyPrice', 'price', 'Buy Price', 'Price'), profile.current_price);

  return {
    symbol,
    name: String(pick('name', 'company', 'company_name', 'Name', 'Company') || profile.name),
    sector: String(pick('sector', 'Sector') || profile.sector),
    quantity: parseNumber(pick('quantity', 'qty', 'Quantity', 'Qty'), 0),
    buy_price: buyPrice,
    current_price: parseNumber(pick('current_price', 'currentPrice', 'Current Price'), profile.current_price),
    buy_date: pick('buy_date', 'buyDate', 'Buy Date') || undefined,
    currency: String(pick('currency', 'Currency') || 'INR').toUpperCase(),
    notes: pick('notes', 'Notes') || undefined,
    exchange: String(pick('exchange', 'Exchange') || profile.exchange),
    beta: parseNumber(pick('beta', 'Beta'), profile.beta),
    pe_ratio: parseNumber(pick('pe_ratio', 'peRatio', 'P/E Ratio'), profile.pe_ratio),
    market_cap: pick('market_cap', 'marketCap', 'Market Cap') || profile.market_cap,
    dividend_yield: parseNumber(pick('dividend_yield', 'dividendYield', 'Dividend Yield'), profile.dividend_yield),
  };
}

function createEntityApi(storageKey) {
  return {
    async list(order) {
      ensureSeeded();
      const items = readCollection(storageKey);
      if (order === '-created_date') {
        return [...items].sort((left, right) => new Date(right.created_date) - new Date(left.created_date));
      }
      return items;
    },
    async create(payload) {
      ensureSeeded();
      const items = readCollection(storageKey);
      const created = { ...payload, id: createId(), created_date: getNowIso() };
      writeCollection(storageKey, [...items, created]);
      return created;
    },
    async bulkCreate(payloads = []) {
      ensureSeeded();
      const items = readCollection(storageKey);
      const created = payloads.map((payload) => ({ ...payload, id: createId(), created_date: getNowIso() }));
      writeCollection(storageKey, [...items, ...created]);
      return created;
    },
    async update(id, updates) {
      ensureSeeded();
      const items = readCollection(storageKey);
      const next = items.map((item) => (item.id === id ? { ...item, ...updates } : item));
      writeCollection(storageKey, next);
      return next.find((item) => item.id === id) || null;
    },
    async delete(id) {
      ensureSeeded();
      const items = readCollection(storageKey);
      writeCollection(storageKey, items.filter((item) => item.id !== id));
      return { success: true };
    },
    async replace(rows = []) {
      ensureSeeded();
      writeCollection(storageKey, rows.map((row) => ({
        ...row,
        id: row.id || createId(),
        created_date: row.created_date || getNowIso(),
      })));
      return rows;
    },
  };
}

export const base44 = {
  auth: {
    async me() {
      if (!isBrowser) return { id: 'local-user', email: 'local@portfolio.app', role: 'admin' };
      ensureSeeded();
      const raw = window.localStorage.getItem(STORAGE_KEYS.session);
      if (raw) return JSON.parse(raw);
      const user = { id: 'local-user', email: 'local@portfolio.app', role: 'admin' };
      window.localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(user));
      return user;
    },
    logout(redirectTo) {
      if (!isBrowser) return;
      window.localStorage.removeItem(STORAGE_KEYS.session);
      if (redirectTo) window.location.assign(redirectTo);
    },
    redirectToLogin(target) {
      if (!isBrowser) return;
      window.location.assign(target || window.location.origin);
    },
  },
  entities: {
    Stock: createEntityApi(STORAGE_KEYS.stocks),
    Watchlist: createEntityApi(STORAGE_KEYS.watchlist),
    WatchlistCollection: createEntityApi(STORAGE_KEYS.watchlistCollections),
  },
  integrations: {
    Core: {
      async InvokeLLM({ prompt = '', response_json_schema } = {}) {
        ensureSeeded();
        const candidate = inferResponseFromPrompt(prompt);
        return normalizeBySchema(candidate, response_json_schema);
      },
      async UploadFile({ file } = {}) {
        if (!file) throw new Error('No file provided');
        const fileUrl = `local://upload/${createId()}`;
        uploadedFiles.set(fileUrl, file);
        return { file_url: fileUrl };
      },
      async ExtractDataFromUploadedFile({ file_url } = {}) {
        const file = uploadedFiles.get(file_url);
        if (!file) return { status: 'failed', details: 'Upload reference not found.' };

        const extension = (file.name.split('.').pop() || '').toLowerCase();
        const text = await file.text();

        if (extension === 'json') {
          try {
            const parsed = JSON.parse(text);
            const rows = Array.isArray(parsed) ? parsed : parsed?.stocks || [];
            const stocks = rows.map(normalizeStockRecord).filter(Boolean);
            return { status: 'success', output: { stocks } };
          } catch {
            return { status: 'failed', details: 'Invalid JSON file format.' };
          }
        }

        if (extension === 'csv') {
          const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
          if (lines.length < 2) return { status: 'failed', details: 'CSV file does not contain enough rows.' };
          const headers = parseCsvLine(lines[0]);
          const rows = lines.slice(1).map((line) => {
            const values = parseCsvLine(line);
            const row = {};
            headers.forEach((header, index) => {
              row[header] = values[index];
            });
            return row;
          });
          const stocks = rows.map(normalizeStockRecord).filter(Boolean);
          return { status: 'success', output: { stocks } };
        }

        if (extension === 'xlsx' || extension === 'xls') {
          return {
            status: 'failed',
            details: 'Spreadsheet parsing is disabled in this local build. Export to CSV and import again.',
          };
        }

        return {
          status: 'failed',
          details: 'Unsupported file type. Please upload a CSV or JSON file.',
        };
      },
    },
  },
};
