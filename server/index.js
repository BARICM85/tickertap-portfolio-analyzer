import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, 'utf8');
  return content.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return acc;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    acc[key] = value.replace(/^['"]|['"]$/g, '');
    return acc;
  }, {});
}

const projectRoot = resolve(__dirname, '..');
const env = {
  ...loadEnvFile(resolve(projectRoot, '.env')),
  ...loadEnvFile(resolve(projectRoot, '.env.local')),
  ...process.env,
};

const { Pool } = pg;

const PORT = Number(env.PORT || env.ZERODHA_SERVER_PORT || 8000);
const API_KEY = env.ZERODHA_API_KEY || '';
const API_SECRET = env.ZERODHA_API_SECRET || '';
const FRONTEND_URL = env.ZERODHA_FRONTEND_URL || 'http://localhost:5173';
const REDIRECT_URI = env.ZERODHA_REDIRECT_URI || `http://localhost:${PORT}/api/zerodha/callback`;
const SESSION_PATH = resolve(projectRoot, env.ZERODHA_SESSION_PATH || 'server/.zerodha-session.json');
const DATABASE_URL = env.ZERODHA_DATABASE_URL || env.DATABASE_URL || '';
const FMP_API_KEY = env.FMP_API_KEY || '';
const FMP_API_BASE_URL = env.FMP_API_BASE_URL || 'https://financialmodelingprep.com/stable';
const SESSION_STORE_KEY = 'zerodha_session';
const INSTRUMENTS_CACHE_PATH = resolve(projectRoot, 'server/.zerodha-instruments-cache.json');
const POSTBACK_LOG_PATH = resolve(projectRoot, 'server/.zerodha-postbacks.log');
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 Codex Portfolio Analyzer',
  Accept: 'application/json',
};
const FMP_HEADERS = {
  Accept: 'application/json',
};
const sessionPool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
    })
  : null;

function ensureSessionDir() {
  mkdirSync(dirname(SESSION_PATH), { recursive: true });
}

function readFileSession() {
  if (!existsSync(SESSION_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SESSION_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeFileSession(session) {
  ensureSessionDir();
  writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2), 'utf8');
}

function clearFileSession() {
  if (existsSync(SESSION_PATH)) unlinkSync(SESSION_PATH);
}

async function ensureSessionStore() {
  if (!sessionPool) return;
  await sessionPool.query(`
    CREATE TABLE IF NOT EXISTS app_session_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function readSession() {
  if (!sessionPool) {
    return readFileSession();
  }

  try {
    const result = await sessionPool.query(
      'SELECT value FROM app_session_store WHERE key = $1 LIMIT 1',
      [SESSION_STORE_KEY],
    );
    return result.rows[0]?.value || null;
  } catch {
    return readFileSession();
  }
}

async function writeSession(session) {
  if (!sessionPool) {
    writeFileSession(session);
    return;
  }

  try {
    await sessionPool.query(
      `
        INSERT INTO app_session_store (key, value, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `,
      [SESSION_STORE_KEY, JSON.stringify(session)],
    );
  } catch {
    writeFileSession(session);
  }
}

async function clearSession() {
  if (!sessionPool) {
    clearFileSession();
    return;
  }

  try {
    await sessionPool.query('DELETE FROM app_session_store WHERE key = $1', [SESSION_STORE_KEY]);
  } catch {
    clearFileSession();
  }
}

function readJsonFile(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, payload) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function readRequestBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolveBody(body));
    req.on('error', rejectBody);
  });
}

function logPostback(payload) {
  mkdirSync(dirname(POSTBACK_LOG_PATH), { recursive: true });
  appendFileSync(
    POSTBACK_LOG_PATH,
    `${new Date().toISOString()} ${JSON.stringify(payload)}\n`,
    'utf8',
  );
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.writeHead(302, {
    Location: location,
    'Access-Control-Allow-Origin': '*',
  });
  res.end();
}

async function kiteRequest(path, { method = 'GET', body } = {}) {
  const session = await readSession();
  if (!session?.access_token) {
    throw new Error('No active Zerodha session.');
  }

  const response = await fetch(`https://api.kite.trade${path}`, {
    method,
    headers: {
      'X-Kite-Version': '3',
      Authorization: `token ${API_KEY}:${session.access_token}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body,
  });

  const data = await response.json();
  if (!response.ok || data.status !== 'success') {
    throw new Error(data.message || 'Zerodha API request failed.');
  }
  return data;
}

async function kiteTextRequest(path) {
  const session = await readSession();
  if (!session?.access_token) {
    throw new Error('No active Zerodha session.');
  }

  const response = await fetch(`https://api.kite.trade${path}`, {
    headers: {
      'X-Kite-Version': '3',
      Authorization: `token ${API_KEY}:${session.access_token}`,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error('Zerodha API request failed.');
  }
  return text;
}

async function exchangeRequestToken(requestToken) {
  const checksum = createHash('sha256')
    .update(`${API_KEY}${requestToken}${API_SECRET}`)
    .digest('hex');

  const body = new URLSearchParams({
    api_key: API_KEY,
    request_token: requestToken,
    checksum,
  });

  const response = await fetch('https://api.kite.trade/session/token', {
    method: 'POST',
    headers: {
      'X-Kite-Version': '3',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await response.json();
  if (!response.ok || data.status !== 'success') {
    throw new Error(data.message || 'Failed to exchange request token.');
  }

  await writeSession({
    connected_at: new Date().toISOString(),
    ...data.data,
  });
  return data.data;
}

function getLoginUrl() {
  const base = new URL('https://kite.zerodha.com/connect/login');
  base.searchParams.set('v', '3');
  base.searchParams.set('api_key', API_KEY);
  return base.toString();
}

function buildFrontendRedirect(status, error) {
  const url = new URL('/Portfolio', FRONTEND_URL);
  url.searchParams.set('broker', 'zerodha');
  url.searchParams.set('status', status);
  if (error) url.searchParams.set('error', error);
  return url.toString();
}

function normalizeQuoteSymbol(symbol = '') {
  const trimmed = symbol.trim().toUpperCase();
  if (!trimmed) return '';
  if (trimmed.includes('.')) return trimmed;
  return `${trimmed}.NS`;
}

function buildYahooSymbolCandidates(symbol = '') {
  const trimmed = symbol.trim().toUpperCase();
  if (!trimmed) return [];
  if (trimmed.startsWith('^')) return [trimmed];
  if (trimmed.includes('_')) return [trimmed, `${trimmed}.NS`];
  if (trimmed.includes('.')) return [trimmed];

  return [...new Set([
    `${trimmed}.NS`,
    `${trimmed}.BO`,
    trimmed,
  ])];
}

function buildCompanySymbolCandidates(symbol = '') {
  const trimmed = symbol.trim().toUpperCase();
  if (!trimmed || trimmed.startsWith('^')) return [];
  if (trimmed.includes('.')) return [trimmed];
  return [...new Set([
    trimmed,
    `${trimmed}.NS`,
    `${trimmed}.BO`,
  ])];
}

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function pickNumber(source, keys = [], fallback = null) {
  for (const key of keys) {
    const value = toNumber(source?.[key], null);
    if (value !== null) return value;
  }
  return fallback;
}

function computeGrowthPercent(currentValue, previousValue) {
  const current = toNumber(currentValue, null);
  const previous = toNumber(previousValue, null);
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatHeadlineNote(item) {
  if (!item) return null;
  const title = item.title || item.headline || item.text || '';
  const publishedAt = item.publishedDate || item.date || item.published_at || item.published;
  if (!title) return null;
  if (!publishedAt) return title;
  return `${title} (${String(publishedAt).slice(0, 10)})`;
}

function summarizeNewsRisk(items = []) {
  const recentItems = items.filter(Boolean);
  if (!recentItems.length) {
    return { value: null, note: null };
  }

  const riskTerms = ['downgrade', 'lawsuit', 'fraud', 'warning', 'miss', 'pledge', 'debt', 'probe', 'penalty', 'loss', 'decline'];
  const joinedText = recentItems
    .map((item) => `${item.title || ''} ${item.text || ''}`.toLowerCase())
    .join(' ');
  const hits = riskTerms.reduce((count, term) => count + (joinedText.includes(term) ? 1 : 0), 0);
  const value = hits >= 2 ? 'Elevated' : hits === 1 ? 'Mixed' : 'Calm';

  return {
    value,
    note: formatHeadlineNote(recentItems[0]),
  };
}

function summarizeCorporateActions(items = []) {
  const recentItems = items.filter(Boolean);
  if (!recentItems.length) {
    return { value: null, note: null };
  }

  return {
    value: `${recentItems.length} recent releases`,
    note: formatHeadlineNote(recentItems[0]),
  };
}

async function fetchFmp(path, params = {}) {
  if (!FMP_API_KEY) {
    throw new Error('FMP feed not configured.');
  }

  const baseUrl = `${FMP_API_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  url.searchParams.set('apikey', FMP_API_KEY);

  const response = await fetch(url, { headers: FMP_HEADERS });
  const data = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(data?.error || data?.message || 'FMP request failed.');
  }
  return data;
}

async function resolveCompanyFeedSymbol(symbol = '') {
  const candidates = buildCompanySymbolCandidates(symbol);
  if (!candidates.length) return null;

  for (const candidate of candidates) {
    try {
      const payload = await fetchFmp('profile', { symbol: candidate });
      const profile = extractArrayPayload(payload)[0];
      if (profile) {
        return { symbol: candidate, profile };
      }
    } catch {
      // keep scanning other candidates
    }
  }

  try {
    const payload = await fetchFmp('search-exchange-variants', { symbol: symbol.trim().toUpperCase() });
    const variants = extractArrayPayload(payload);
    const preferred = variants.find((item) => ['NSE', 'BSE'].includes(String(item.exchangeShortName || item.exchange || '').toUpperCase()));
    if (preferred?.symbol) {
      return { symbol: preferred.symbol, profile: null };
    }
  } catch {
    // keep fallback null
  }

  return null;
}

async function fetchCompanyIntelligence(symbol = '') {
  if (!FMP_API_KEY) {
    return {
      configured: false,
      source: 'unconfigured',
      symbol: symbol.trim().toUpperCase(),
      valuation: {},
      quality: {},
      stockSpecificRisk: {},
      notes: {},
      meta: {
        provider: 'fmp',
        reason: 'FMP_API_KEY missing',
      },
    };
  }

  const resolved = await resolveCompanyFeedSymbol(symbol);
  if (!resolved?.symbol) {
    return {
      configured: true,
      source: 'fmp',
      symbol: symbol.trim().toUpperCase(),
      valuation: {},
      quality: {},
      stockSpecificRisk: {},
      notes: {},
      meta: {
        provider: 'fmp',
        reason: 'Symbol not found in provider feed',
      },
    };
  }

  const profile = resolved.profile || null;
  const settled = await Promise.allSettled([
    fetchFmp('profile', { symbol: resolved.symbol }),
    fetchFmp('key-metrics-ttm', { symbol: resolved.symbol }),
    fetchFmp('ratios-ttm', { symbol: resolved.symbol }),
    fetchFmp('income-statement', { symbol: resolved.symbol, period: 'annual', limit: 2 }),
    fetchFmp('income-statement', { symbol: resolved.symbol, period: 'quarter', limit: 2 }),
    fetchFmp('cash-flow-statement', { symbol: resolved.symbol, period: 'annual', limit: 1 }),
    fetchFmp('company-executives', { symbol: resolved.symbol }),
    fetchFmp('news/stock', { symbols: resolved.symbol, limit: 5 }),
    fetchFmp('news/press-releases', { symbols: resolved.symbol, limit: 3 }),
  ]);

  const [
    profileResult,
    keyMetricsResult,
    ratiosResult,
    annualIncomeResult,
    quarterlyIncomeResult,
    cashFlowResult,
    executivesResult,
    newsResult,
    pressReleaseResult,
  ] = settled;

  const liveProfile = extractArrayPayload(profileResult.status === 'fulfilled' ? profileResult.value : [profile])[0] || profile;
  const keyMetrics = extractArrayPayload(keyMetricsResult.status === 'fulfilled' ? keyMetricsResult.value : [])[0] || {};
  const ratios = extractArrayPayload(ratiosResult.status === 'fulfilled' ? ratiosResult.value : [])[0] || {};
  const annualIncomeRows = extractArrayPayload(annualIncomeResult.status === 'fulfilled' ? annualIncomeResult.value : []);
  const quarterlyIncomeRows = extractArrayPayload(quarterlyIncomeResult.status === 'fulfilled' ? quarterlyIncomeResult.value : []);
  const cashFlowRows = extractArrayPayload(cashFlowResult.status === 'fulfilled' ? cashFlowResult.value : []);
  const executives = extractArrayPayload(executivesResult.status === 'fulfilled' ? executivesResult.value : []);
  const newsItems = extractArrayPayload(newsResult.status === 'fulfilled' ? newsResult.value : []);
  const pressReleases = extractArrayPayload(pressReleaseResult.status === 'fulfilled' ? pressReleaseResult.value : []);

  const annualCurrent = annualIncomeRows[0] || {};
  const annualPrevious = annualIncomeRows[1] || {};
  const quarterlyCurrent = quarterlyIncomeRows[0] || {};
  const quarterlyPrevious = quarterlyIncomeRows[1] || {};
  const latestCashFlow = cashFlowRows[0] || {};
  const newsRisk = summarizeNewsRisk(newsItems);
  const corporateActions = summarizeCorporateActions(pressReleases);

  return {
    configured: true,
    source: 'fmp',
    symbol: resolved.symbol,
    valuation: {
      peRatio: pickNumber(keyMetrics, ['peRatioTTM', 'peRatio'], pickNumber(ratios, ['priceEarningsRatioTTM'], pickNumber(liveProfile, ['pe'], null))),
      pegRatio: pickNumber(ratios, ['pegRatioTTM', 'pegRatio'], null),
      pbRatio: pickNumber(keyMetrics, ['pbRatioTTM', 'priceToBookRatioTTM', 'pbRatio'], pickNumber(ratios, ['priceToBookRatioTTM', 'priceToBookRatio'], null)),
      evToEbitda: pickNumber(keyMetrics, ['enterpriseValueOverEBITDATTM', 'evToEbitdaTTM'], pickNumber(ratios, ['enterpriseValueMultipleTTM', 'enterpriseValueMultiple'], null)),
      marketCap: pickNumber(liveProfile, ['mktCap', 'marketCap'], null),
    },
    quality: {
      earningsGrowthYoYPercent: computeGrowthPercent(annualCurrent.netIncome, annualPrevious.netIncome),
      earningsGrowthQoQPercent: computeGrowthPercent(quarterlyCurrent.netIncome, quarterlyPrevious.netIncome),
      revenueGrowthPercent: computeGrowthPercent(annualCurrent.revenue, annualPrevious.revenue),
      roePercent: pickNumber(keyMetrics, ['roeTTM', 'roe'], pickNumber(ratios, ['returnOnEquityTTM', 'returnOnEquity'], null)),
      rocePercent: pickNumber(keyMetrics, ['roicTTM', 'returnOnCapitalEmployedTTM'], pickNumber(ratios, ['returnOnCapitalEmployedTTM', 'returnOnCapitalEmployed'], null)),
      debtToEquity: pickNumber(ratios, ['debtEquityRatioTTM', 'debtToEquityTTM', 'debtEquityRatio', 'debtToEquity'], null),
      freeCashFlow: pickNumber(latestCashFlow, ['freeCashFlow', 'freeCashFlowTTM'], null),
    },
    stockSpecificRisk: {
      managementQuality: null,
      promoterHoldingPercent: null,
      promoterPledgePercent: null,
      latestNewsRisk: newsRisk.value,
      corporateActions: corporateActions.value,
    },
    notes: {
      quality: {
        earningsGrowthYoYPercent: annualCurrent.date ? `Annual net income growth from ${annualCurrent.date}` : null,
        earningsGrowthQoQPercent: quarterlyCurrent.date ? `Quarterly net income growth from ${quarterlyCurrent.date}` : null,
        revenueGrowthPercent: annualCurrent.date ? `Annual revenue growth from ${annualCurrent.date}` : null,
        roePercent: 'Trailing twelve-month return on equity',
        rocePercent: 'Provider return-on-capital proxy',
        debtToEquity: 'Trailing leverage ratio',
        freeCashFlow: latestCashFlow.date ? `Latest annual cash-flow statement ${latestCashFlow.date}` : null,
      },
      valuation: {
        peRatio: liveProfile?.companyName ? `${liveProfile.companyName} profile + TTM metrics` : 'Provider valuation feed',
        pegRatio: 'Growth-adjusted valuation from provider feed',
        pbRatio: 'Price-to-book from provider feed',
        evToEbitda: 'Enterprise value versus EBITDA from provider feed',
      },
      stockSpecificRisk: {
        managementQuality: executives.length ? `${executives.length} executives available; qualitative scoring still manual.` : 'Executive feed not available for this symbol.',
        promoterHoldingPercent: 'Promoter holding feed still not connected for Indian disclosures.',
        promoterPledgePercent: 'Promoter pledge feed still not connected for Indian disclosures.',
        latestNewsRisk: newsRisk.note,
        corporateActions: corporateActions.note,
      },
    },
    meta: {
      provider: 'fmp',
      executivesCount: executives.length,
      newsCount: newsItems.length,
      pressReleaseCount: pressReleases.length,
      companyName: liveProfile?.companyName || liveProfile?.name || null,
      sector: liveProfile?.sector || null,
    },
  };
}

function parseCsv(text = '') {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    return row;
  });
}

function parseExpiryDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function getZerodhaInstruments() {
  const cached = readJsonFile(INSTRUMENTS_CACHE_PATH);
  const now = Date.now();

  if (cached?.fetchedAt && Array.isArray(cached.rows) && (now - cached.fetchedAt) < (12 * 60 * 60 * 1000)) {
    return cached.rows;
  }

  try {
    const text = await kiteTextRequest('/instruments');
    const rows = parseCsv(text);
    writeJsonFile(INSTRUMENTS_CACHE_PATH, { fetchedAt: now, rows });
    return rows;
  } catch (error) {
    if (Array.isArray(cached?.rows) && cached.rows.length > 0) {
      return cached.rows;
    }
    throw error;
  }
}

async function searchMarketSymbols(query = '', limit = 12) {
  const term = query.trim().toUpperCase();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 12, 50));
  const results = [];
  const seen = new Set();

  INDEX_CATALOG.forEach((item) => {
    const label = item.label || '';
    if (term && !label.includes(term) && !item.symbol.includes(term)) {
      return;
    }

    const key = `INDEX:${item.symbol}`;
    if (seen.has(key) || results.length >= safeLimit) {
      return;
    }

    seen.add(key);
    results.push({
      symbol: item.symbol,
      name: item.label,
      exchange: 'INDEX',
      type: 'index',
    });
  });

  const instruments = await getZerodhaInstruments();
  for (const row of instruments) {
    const exchange = (row.exchange || '').toUpperCase();
    const instrumentType = (row.instrument_type || '').toUpperCase();
    const symbol = (row.tradingsymbol || '').toUpperCase();
    const name = (row.name || '').trim();

    if (exchange !== 'NSE') continue;
    if (instrumentType && instrumentType !== 'EQ') continue;
    if (!symbol) continue;

    const haystack = `${symbol} ${name}`.toUpperCase();
    if (term && !haystack.includes(term)) continue;

    const key = `${exchange}:${symbol}`;
    if (seen.has(key)) continue;

    seen.add(key);
    results.push({
      symbol,
      name: name || symbol,
      exchange,
      type: 'stock',
    });

    if (results.length >= safeLimit) break;
  }

  return results;
}

async function resolveZerodhaInstrument(symbol = '', exchange = 'NSE') {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const normalizedExchange = exchange.trim().toUpperCase() || 'NSE';
  if (!normalizedSymbol) return null;

  const instruments = await getZerodhaInstruments();
  const exact = instruments.find((row) => row.tradingsymbol === normalizedSymbol && row.exchange === normalizedExchange);
  if (exact) return exact;

  const alternate = instruments.find((row) => row.tradingsymbol === normalizedSymbol);
  return alternate || null;
}

async function fetchZerodhaQuoteSnapshot(instrumentRefs = []) {
  if (!instrumentRefs.length) return {};
  const search = instrumentRefs.map((item) => `i=${encodeURIComponent(item)}`).join('&');
  const response = await kiteRequest(`/quote?${search}`);
  return response?.data || {};
}

async function fetchZerodhaQuote(symbol, exchange = 'NSE') {
  const instrumentRef = `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;
  const response = await kiteRequest(`/quote/ltp?i=${encodeURIComponent(instrumentRef)}`);
  const quote = response?.data?.[instrumentRef];
  if (!quote?.last_price) {
    throw new Error(`No Zerodha quote available for ${instrumentRef}.`);
  }

  return {
    symbol: symbol.toUpperCase(),
    marketSymbol: instrumentRef,
    shortName: symbol.toUpperCase(),
    price: Number(quote.last_price || 0),
    changePercent: 0,
    exchange: exchange.toUpperCase(),
    currency: 'INR',
    source: 'zerodha',
  };
}

function buildZerodhaDateRange(range = '6mo', interval = 'day') {
  const to = new Date();
  const from = new Date(to);
  let resolvedInterval = interval || 'day';

  if (range === '1d') {
    from.setDate(to.getDate() - 1);
  } else if (range === '5d') {
    from.setDate(to.getDate() - 5);
  } else if (range === '1mo') {
    from.setMonth(to.getMonth() - 1);
  } else if (range === '3mo') {
    from.setMonth(to.getMonth() - 3);
  } else if (range === '6mo') {
    from.setMonth(to.getMonth() - 6);
  } else if (range === '1y') {
    from.setFullYear(to.getFullYear() - 1);
  } else if (range === '3y') {
    from.setFullYear(to.getFullYear() - 3);
  } else if (range === '5y') {
    from.setFullYear(to.getFullYear() - 5);
  } else if (range === 'ytd') {
    from.setMonth(0, 1);
    from.setHours(0, 0, 0, 0);
  } else if (range === 'all') {
    from.setFullYear(to.getFullYear() - 15);
  }

  return {
    from,
    to,
    interval: resolvedInterval,
  };
}

function getZerodhaChunkDays(interval = 'day') {
  const limits = {
    minute: 60,
    '3minute': 100,
    '5minute': 100,
    '10minute': 100,
    '15minute': 200,
    '30minute': 200,
    '60minute': 400,
    day: 2000,
  };

  return limits[interval] || 60;
}

function mapRequestedInterval(requestedInterval = 'day', range = '1d') {
  const normalized = requestedInterval.toLowerCase();
  const allowed = new Set(['minute', '3minute', '5minute', '10minute', '15minute', '30minute', '60minute', 'day']);
  if (allowed.has(normalized)) return normalized;

  if (normalized === '1m') return 'minute';
  if (normalized === '3m') return '3minute';
  if (normalized === '5m') return '5minute';
  if (normalized === '10m') return '10minute';
  if (normalized === '15m') return '15minute';
  if (normalized === '30m') return '30minute';
  if (normalized === '60m' || normalized === '1h') return '60minute';
  if (normalized === '180m' || normalized === '3h') return '60minute';
  if (normalized === '1d') return 'day';
  if (normalized === '1w' || normalized === '1mo') return 'day';

  if (range === '1d') return '5minute';
  if (range === '5d') return '15minute';
  return 'day';
}

function mapYahooInterval(requestedInterval = '1d', range = '1d') {
  const normalized = requestedInterval.toLowerCase();
  const direct = new Map([
    ['minute', '1m'],
    ['1m', '1m'],
    ['2m', '2m'],
    ['3minute', '5m'],
    ['3m', '5m'],
    ['5minute', '5m'],
    ['5m', '5m'],
    ['10minute', '15m'],
    ['10m', '15m'],
    ['15minute', '15m'],
    ['15m', '15m'],
    ['30minute', '30m'],
    ['30m', '30m'],
    ['60minute', '60m'],
    ['60m', '60m'],
    ['1h', '1h'],
    ['180m', '1h'],
    ['3h', '1h'],
    ['day', '1d'],
    ['1d', '1d'],
    ['1w', '1wk'],
    ['1mo', '1mo'],
    ['5d', '5d'],
  ]);

  if (direct.has(normalized)) {
    return direct.get(normalized);
  }

  if (range === '1d') return '5m';
  if (range === '5d') return '15m';
  if (range === 'all') return '1mo';
  return '1d';
}

async function fetchZerodhaHistory(symbol, exchange = 'NSE', range = '6mo', requestedInterval = 'day') {
  const instrument = await resolveZerodhaInstrument(symbol, exchange);
  if (!instrument?.instrument_token) {
    throw new Error(`No Zerodha instrument token found for ${exchange}:${symbol}.`);
  }

  const interval = mapRequestedInterval(requestedInterval, range);
  const { from, to } = buildZerodhaDateRange(range, interval);
  const chunkDays = getZerodhaChunkDays(interval);
  const candles = [];
  let cursor = new Date(from);

  while (cursor <= to) {
    const chunkEnd = new Date(
      Math.min(
        to.getTime(),
        cursor.getTime() + (chunkDays * 24 * 60 * 60 * 1000) - 1000,
      ),
    );

    const response = await kiteRequest(
      `/instruments/historical/${instrument.instrument_token}/${interval}?from=${encodeURIComponent(cursor.toISOString())}&to=${encodeURIComponent(chunkEnd.toISOString())}&oi=0`,
    );

    candles.push(...(response?.data?.candles || []));
    cursor = new Date(chunkEnd.getTime() + 1000);
  }

  const uniqueCandles = [...new Map(
    candles.map((entry) => [new Date(entry[0]).toISOString(), entry]),
  ).values()];
  const points = uniqueCandles
    .map((entry) => ({
      date: new Date(entry[0]).toISOString(),
      open: Number(entry[1]),
      high: Number(entry[2]),
      low: Number(entry[3]),
      close: Number(entry[4]),
      volume: Number(entry[5] || 0),
    }))
    .filter((point) => [point.open, point.high, point.low, point.close].every(Number.isFinite));

  if (points.length === 0) {
    throw new Error(`No Zerodha candle data available for ${exchange}:${symbol}.`);
  }

  return {
    symbol: instrument.tradingsymbol || symbol.toUpperCase(),
    marketSymbol: `${instrument.exchange}:${instrument.tradingsymbol}`,
    currency: 'INR',
    exchange: instrument.exchange || exchange,
    source: 'zerodha',
    points,
  };
}

function computeOptionSummary(rows = []) {
  if (!rows.length) return null;

  const totalCallOi = rows.reduce((sum, row) => sum + Number(row.call?.oi || 0), 0);
  const totalPutOi = rows.reduce((sum, row) => sum + Number(row.put?.oi || 0), 0);
  const pcr = totalCallOi > 0 ? totalPutOi / totalCallOi : 0;

  const supportStrike = [...rows]
    .sort((left, right) => Number(right.put?.oi || 0) - Number(left.put?.oi || 0))[0]?.strike || null;
  const resistanceStrike = [...rows]
    .sort((left, right) => Number(right.call?.oi || 0) - Number(left.call?.oi || 0))[0]?.strike || null;

  const maxPain = rows.reduce((best, candidate) => {
    const pain = rows.reduce((sum, row) => {
      const callPain = Math.max(candidate.strike - row.strike, 0) * Number(row.call?.oi || 0);
      const putPain = Math.max(row.strike - candidate.strike, 0) * Number(row.put?.oi || 0);
      return sum + callPain + putPain;
    }, 0);

    if (!best || pain < best.pain) {
      return { strike: candidate.strike, pain };
    }
    return best;
  }, null);

  return {
    totalCallOi,
    totalPutOi,
    pcr,
    supportStrike,
    resistanceStrike,
    maxPainStrike: maxPain?.strike || null,
  };
}

function computeExpirySummaries(optionRows = [], spotPrice = 0) {
  const grouped = new Map();

  optionRows.forEach((row) => {
    const expiry = row.expiry;
    if (!expiry) return;
    const bucket = grouped.get(expiry) || {
      expiry,
      totalCallOi: 0,
      totalPutOi: 0,
      nearestStrikeDistance: Number.POSITIVE_INFINITY,
      atmStrike: null,
    };

    const strike = Number(row.strike || 0);
    const distance = Math.abs(strike - spotPrice);
    if (distance < bucket.nearestStrikeDistance) {
      bucket.nearestStrikeDistance = distance;
      bucket.atmStrike = strike;
    }

    if ((row.instrument_type || '').toUpperCase() === 'CE') {
      bucket.totalCallOi += 1;
    }
    if ((row.instrument_type || '').toUpperCase() === 'PE') {
      bucket.totalPutOi += 1;
    }

    grouped.set(expiry, bucket);
  });

  return [...grouped.values()]
    .map((item) => ({
      expiry: item.expiry,
      atmStrike: item.atmStrike,
      totalCallOi: item.totalCallOi,
      totalPutOi: item.totalPutOi,
      pcr: item.totalCallOi > 0 ? item.totalPutOi / item.totalCallOi : 0,
    }))
    .sort((left, right) => parseExpiryDate(left.expiry) - parseExpiryDate(right.expiry));
}

async function fetchZerodhaOptionChain(symbol, exchange = 'NSE', expiry = '', strikeCount = 9) {
  const uppercaseSymbol = symbol.trim().toUpperCase();
  if (!uppercaseSymbol) {
    throw new Error('Missing symbol for option chain.');
  }

  const instruments = await getZerodhaInstruments();
  const optionRows = instruments.filter((row) => {
    const instrumentType = (row.instrument_type || '').toUpperCase();
    const rowExchange = (row.exchange || '').toUpperCase();
    const name = (row.name || '').toUpperCase();
    return rowExchange === 'NFO' && name === uppercaseSymbol && (instrumentType === 'CE' || instrumentType === 'PE');
  });

  if (!optionRows.length) {
    throw new Error(`No Zerodha option instruments found for ${uppercaseSymbol}.`);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiries = [...new Set(
    optionRows
      .map((row) => row.expiry)
      .filter(Boolean),
  )]
    .map((value) => ({ raw: value, date: parseExpiryDate(value) }))
    .filter((entry) => entry.date && entry.date >= today)
    .sort((left, right) => left.date - right.date);

  const selectedExpiry = expiry && expiries.some((item) => item.raw === expiry) ? expiry : expiries[0]?.raw;
  if (!selectedExpiry) {
    throw new Error(`No active expiry found for ${uppercaseSymbol}.`);
  }

  const underlyingQuote = await fetchZerodhaQuote(uppercaseSymbol, exchange);
  const spotPrice = underlyingQuote.price;

  const expiryOptions = optionRows
    .filter((row) => row.expiry === selectedExpiry)
    .map((row) => ({
      ...row,
      strike: Number(row.strike || 0),
      lot_size: Number(row.lot_size || 0),
      instrument_type: (row.instrument_type || '').toUpperCase(),
    }))
    .filter((row) => Number.isFinite(row.strike) && row.strike > 0)
    .sort((left, right) => left.strike - right.strike);

  const uniqueStrikes = [...new Set(expiryOptions.map((row) => row.strike))];
  const atmStrike = uniqueStrikes.reduce((closest, strike) => {
    if (closest === null) return strike;
    return Math.abs(strike - spotPrice) < Math.abs(closest - spotPrice) ? strike : closest;
  }, null);

  const atmIndex = uniqueStrikes.findIndex((strike) => strike === atmStrike);
  const safeStrikeCount = Math.max(5, Math.min(Number(strikeCount) || 9, 21));
  const sideWindow = Math.floor(safeStrikeCount / 2);
  const selectedStrikes = uniqueStrikes.slice(
    Math.max(0, atmIndex - sideWindow),
    Math.min(uniqueStrikes.length, atmIndex + sideWindow + 1),
  );

  const selectedOptions = expiryOptions.filter((row) => selectedStrikes.includes(row.strike));
  const quoteRefs = selectedOptions.map((row) => `${row.exchange}:${row.tradingsymbol}`);
  const quotes = await fetchZerodhaQuoteSnapshot(quoteRefs);

  const grouped = selectedStrikes.map((strike) => {
    const call = selectedOptions.find((row) => row.strike === strike && row.instrument_type === 'CE');
    const put = selectedOptions.find((row) => row.strike === strike && row.instrument_type === 'PE');
    const callQuote = call ? quotes[`${call.exchange}:${call.tradingsymbol}`] : null;
    const putQuote = put ? quotes[`${put.exchange}:${put.tradingsymbol}`] : null;

    return {
      strike,
      atm: strike === atmStrike,
      call: call ? {
        tradingsymbol: call.tradingsymbol,
        ltp: Number(callQuote?.last_price || 0),
        oi: Number(callQuote?.oi || 0),
        oiDayHigh: Number(callQuote?.oi_day_high || 0),
        oiDayLow: Number(callQuote?.oi_day_low || 0),
        volume: Number(callQuote?.volume || 0),
      } : null,
      put: put ? {
        tradingsymbol: put.tradingsymbol,
        ltp: Number(putQuote?.last_price || 0),
        oi: Number(putQuote?.oi || 0),
        oiDayHigh: Number(putQuote?.oi_day_high || 0),
        oiDayLow: Number(putQuote?.oi_day_low || 0),
        volume: Number(putQuote?.volume || 0),
      } : null,
    };
  });

  const summary = computeOptionSummary(grouped);

  return {
    source: 'zerodha',
    symbol: uppercaseSymbol,
    exchange,
    expiry: selectedExpiry,
    expiries: expiries.map((entry) => entry.raw),
    expirySummaries: computeExpirySummaries(optionRows, spotPrice),
    spotPrice,
    atmStrike,
    lotSize: Number(selectedOptions[0]?.lot_size || 0),
    strikeCount: selectedStrikes.length,
    summary,
    rows: grouped,
  };
}

async function fetchLiveQuote(symbol) {
  try {
    const zerodhaQuote = await fetchZerodhaQuote(symbol, 'NSE');
    return zerodhaQuote;
  } catch {
    // fall through to Yahoo fallback when Zerodha is disconnected or unavailable
  }

  const candidates = buildYahooSymbolCandidates(symbol);
  if (candidates.length === 0) {
    throw new Error('Missing stock symbol.');
  }

  for (const candidate of candidates) {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${candidate}`);
    url.searchParams.set('range', '5d');
    url.searchParams.set('interval', '1d');

    const response = await fetch(url, { headers: YAHOO_HEADERS });
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const quote = result?.meta;

    if (!response.ok || !quote?.regularMarketPrice) {
      continue;
    }

    return {
      symbol: quote.symbol || candidate,
      marketSymbol: candidate,
      shortName: quote.shortName || quote.longName || candidate,
      price: Number(quote.regularMarketPrice || 0),
      changePercent: Number(quote.regularMarketChangePercent || 0),
      exchange: quote.exchangeName || quote.fullExchangeName || '',
      currency: quote.currency || 'INR',
      source: 'yahoo',
    };
  }

  throw new Error(`No live quote available for ${candidates.join(', ')}.`);
}

const INDEX_CATALOG = [
  { key: 'nifty50', symbol: '^NSEI', label: 'NIFTY 50', fallbackPrice: 22419.95, fallbackChangePercent: -0.24 },
  { key: 'banknifty', symbol: '^NSEBANK', label: 'BANK NIFTY', fallbackPrice: 48265.2, fallbackChangePercent: -0.31 },
  { key: 'sensex', symbol: '^BSESN', label: 'SENSEX', fallbackPrice: 73642.15, fallbackChangePercent: -0.18 },
  { key: 'niftynext50', symbol: '^NSMIDCP', label: 'NIFTY NEXT 50', fallbackPrice: 62184.3, fallbackChangePercent: 0.12 },
  { key: 'midcap100', symbol: 'NIFTY_MIDCAP_100.NS', label: 'MIDCAP 100', fallbackPrice: 51432.8, fallbackChangePercent: 0.21 },
  { key: 'midcap150', symbol: 'NIFTY_MIDCAP_150.NS', label: 'MIDCAP 150', fallbackPrice: 19864.3, fallbackChangePercent: 0.17 },
  { key: 'smallcap100', symbol: 'NIFTY_SMLCAP_100.NS', label: 'SMALLCAP 100', fallbackPrice: 16782.45, fallbackChangePercent: -0.09 },
  { key: 'smallcap250', symbol: 'NIFTY_SMALLCAP_250.NS', label: 'SMALLCAP 250', fallbackPrice: 14586.25, fallbackChangePercent: 0.28 },
  { key: 'nifty500', symbol: 'NIFTY_500.NS', label: 'NIFTY 500', fallbackPrice: 20894.6, fallbackChangePercent: 0.05 },
  { key: 'nifty200', symbol: 'NIFTY_200.NS', label: 'NIFTY 200', fallbackPrice: 12456.35, fallbackChangePercent: 0.08 },
  { key: 'niftypsubank', symbol: '^NIFTYPSU', label: 'PSU BANK', fallbackPrice: 6842.5, fallbackChangePercent: -0.42 },
  { key: 'niftypse', symbol: '^CNXPSE', label: 'NIFTY PSE', fallbackPrice: 10234.8, fallbackChangePercent: -0.33 },
  { key: 'niftyinfra', symbol: '^CNXINFRA', label: 'NIFTY INFRA', fallbackPrice: 8912.7, fallbackChangePercent: 0.24 },
  { key: 'niftyenergy', symbol: '^CNXENERGY', label: 'NIFTY ENERGY', fallbackPrice: 39874.25, fallbackChangePercent: -0.11 },
  { key: 'niftyprivatebank', symbol: '^NIFTYPVTBANK', label: 'PVT BANK', fallbackPrice: 24836.1, fallbackChangePercent: 0.19 },
  { key: 'niftyit', symbol: '^CNXIT', label: 'NIFTY IT', fallbackPrice: 35842.6, fallbackChangePercent: 0.18 },
  { key: 'niftyauto', symbol: '^CNXAUTO', label: 'NIFTY AUTO', fallbackPrice: 21984.35, fallbackChangePercent: -0.12 },
  { key: 'niftypharma', symbol: '^CNXPHARMA', label: 'NIFTY PHARMA', fallbackPrice: 18642.8, fallbackChangePercent: 0.42 },
  { key: 'niftyfmcg', symbol: '^CNXFMCG', label: 'NIFTY FMCG', fallbackPrice: 54873.55, fallbackChangePercent: 0.07 },
  { key: 'niftymetal', symbol: '^CNXMETAL', label: 'NIFTY METAL', fallbackPrice: 8342.4, fallbackChangePercent: -0.56 },
  { key: 'niftyrealty', symbol: '^CNXREALTY', label: 'NIFTY REALTY', fallbackPrice: 918.2, fallbackChangePercent: -0.21 },
];

async function fetchIndexQuotes() {
  const results = await Promise.all(
    INDEX_CATALOG.map(async (item) => {
      try {
        const response = await fetchLiveQuote(item.symbol);
        return {
          key: item.key,
          label: item.label,
          symbol: item.symbol,
          price: response.price,
          changePercent: response.changePercent,
          source: response.source,
          currency: response.currency || 'INR',
          delayed: false,
        };
      } catch {
        return {
          key: item.key,
          label: item.label,
          symbol: item.symbol,
          price: item.fallbackPrice,
          changePercent: item.fallbackChangePercent,
          source: 'fallback',
          currency: 'INR',
          delayed: true,
        };
      }
    }),
  );

  return {
    updatedAt: new Date().toISOString(),
    items: results.filter(Boolean),
  };
}

async function fetchMarketHistory(symbol, range = '6mo', interval = '1d') {
  try {
    return await fetchZerodhaHistory(symbol, 'NSE', range, interval);
  } catch {
    // fall through to Yahoo fallback when Zerodha is disconnected or unavailable
  }

  const candidates = buildYahooSymbolCandidates(symbol);
  if (candidates.length === 0) {
    throw new Error('Missing stock symbol.');
  }

  for (const candidate of candidates) {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${candidate}`);
    url.searchParams.set('range', range === 'all' ? 'max' : range);
    url.searchParams.set('interval', mapYahooInterval(interval, range));
    url.searchParams.set('includePrePost', 'false');
    url.searchParams.set('events', 'div,splits');

    const response = await fetch(url, { headers: YAHOO_HEADERS });
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    const timestamps = result?.timestamp || [];

    if (!response.ok || !result || !quote || timestamps.length === 0) {
      continue;
    }

    const points = timestamps
      .map((timestamp, index) => {
        const close = Number(quote.close?.[index]);
        const open = Number(quote.open?.[index]);
        const high = Number(quote.high?.[index]);
        const low = Number(quote.low?.[index]);

        if (![open, high, low, close].every(Number.isFinite)) return null;

        return {
          date: new Date(timestamp * 1000).toISOString(),
          open,
          high,
          low,
          close,
          volume: Number(quote.volume?.[index] || 0),
        };
      })
      .filter(Boolean);

    if (points.length === 0) {
      continue;
    }

    return {
      symbol: candidate,
      marketSymbol: candidate,
      currency: result?.meta?.currency || 'INR',
      exchange: result?.meta?.exchangeName || '',
      source: 'yahoo',
      points,
    };
  }

  throw new Error(`No chart history available for ${candidates.join(', ')}.`);
}

const server = createServer(async (req, res) => {
  if (!req.url) return sendJson(res, 400, { error: 'Missing URL.' });
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/zerodha/postback') {
      const rawBody = await readRequestBody(req);
      const contentType = req.headers['content-type'] || '';
      let payload = { raw: rawBody };

      if (contentType.includes('application/json')) {
        try {
          payload = JSON.parse(rawBody || '{}');
        } catch {
          payload = { raw: rawBody };
        }
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        payload = Object.fromEntries(new URLSearchParams(rawBody));
      }

      logPostback(payload);
      return sendJson(res, 200, { success: true, received: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/market/quote') {
      const symbol = url.searchParams.get('symbol') || '';
      const quote = await fetchLiveQuote(symbol);
      return sendJson(res, 200, quote);
    }

    if (req.method === 'GET' && url.pathname === '/api/market/indices') {
      const payload = await fetchIndexQuotes();
      return sendJson(res, 200, payload);
    }

    if (req.method === 'GET' && url.pathname === '/api/market/search') {
      const query = url.searchParams.get('q') || '';
      const limit = url.searchParams.get('limit') || '12';
      const items = await searchMarketSymbols(query, limit);
      return sendJson(res, 200, { items });
    }

    if (req.method === 'GET' && url.pathname === '/api/market/history') {
      const symbol = url.searchParams.get('symbol') || '';
      const range = url.searchParams.get('range') || '6mo';
      const interval = url.searchParams.get('interval') || '1d';
      const history = await fetchMarketHistory(symbol, range, interval);
      return sendJson(res, 200, history);
    }

    if (req.method === 'GET' && url.pathname === '/api/company/intelligence') {
      const symbol = url.searchParams.get('symbol') || '';
      const intelligence = await fetchCompanyIntelligence(symbol);
      return sendJson(res, 200, intelligence);
    }

    if (req.method === 'GET' && url.pathname === '/api/options/chain') {
      const symbol = url.searchParams.get('symbol') || '';
      const exchange = url.searchParams.get('exchange') || 'NSE';
      const expiry = url.searchParams.get('expiry') || '';
      const strikeCount = url.searchParams.get('strikeCount') || '9';
      const chain = await fetchZerodhaOptionChain(symbol, exchange, expiry, strikeCount);
      return sendJson(res, 200, chain);
    }

    if (req.method === 'GET' && url.pathname === '/api/zerodha/status') {
      const session = await readSession();
      return sendJson(res, 200, {
        configured: Boolean(API_KEY && API_SECRET),
        connected: Boolean(session?.access_token),
        profile: session ? {
          user_id: session.user_id,
          user_name: session.user_name,
          email: session.email,
          login_time: session.login_time,
        } : null,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/zerodha/login-url') {
      if (!API_KEY || !API_SECRET) {
        return sendJson(res, 400, { error: 'ZERODHA_API_KEY and ZERODHA_API_SECRET must be set in .env.' });
      }
      return sendJson(res, 200, {
        loginUrl: getLoginUrl(),
        redirectUri: REDIRECT_URI,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/zerodha/callback') {
      const requestToken = url.searchParams.get('request_token');
      if (!requestToken) {
        return redirect(res, buildFrontendRedirect('error', 'missing_request_token'));
      }

      try {
        await exchangeRequestToken(requestToken);
        return redirect(res, buildFrontendRedirect('connected'));
      } catch (error) {
        return redirect(res, buildFrontendRedirect('error', error.message));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/zerodha/holdings') {
      const data = await kiteRequest('/portfolio/holdings');
      return sendJson(res, 200, data);
    }

    if (req.method === 'GET' && url.pathname === '/api/zerodha/positions') {
      const data = await kiteRequest('/portfolio/positions');
      return sendJson(res, 200, data);
    }

    if (req.method === 'POST' && url.pathname === '/api/zerodha/disconnect') {
      await clearSession();
      return sendJson(res, 200, { success: true });
    }

    return sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Server error.' });
  }
});

ensureSessionStore()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Broker server listening on http://localhost:${PORT}`);
      console.log(`Configured redirect URI: ${REDIRECT_URI}`);
      console.log(`Session storage: ${sessionPool ? 'postgres' : 'file'}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize session store.', error);
    process.exit(1);
  });
