import { Capacitor } from '@capacitor/core';

const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BROKER_API_URL || '';
const HOSTED_API_BASE = import.meta.env.VITE_HOSTED_API_BASE_URL || 'https://tickertap-backend-88ts.onrender.com';

function trimSlash(value = '') {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function isLocalApiBase(value = '') {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value);
}

export function getBrokerApiBase() {
  const configuredBase = trimSlash(DEFAULT_API_BASE);
  if (Capacitor.isNativePlatform() && (!configuredBase || isLocalApiBase(configuredBase))) {
    return trimSlash(HOSTED_API_BASE);
  }
  return configuredBase;
}

export function getZerodhaRedirectUrl() {
  const brokerApiBase = getBrokerApiBase();
  if (brokerApiBase) {
    return `${brokerApiBase}/api/zerodha/callback`;
  }
  return 'http://localhost:8000/api/zerodha/callback';
}

async function request(path, options = {}) {
  const brokerBase = getBrokerApiBase();
  const defaultTimeoutMs = /onrender\.com/i.test(brokerBase) ? 15000 : 4500;
  const { timeoutMs = defaultTimeoutMs, ...fetchOptions } = options;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : null;
  const endpoint = `${brokerBase}${path}`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers || {}),
      },
      ...fetchOptions,
      signal: controller?.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || 'Broker request failed.');
    }
    return data;
  } catch (error) {
    const aborted = error?.name === 'AbortError' || controller?.signal?.aborted;
    if (aborted) {
      throw new Error(`Broker request timed out after ${Math.round(timeoutMs / 1000)}s. Check whether the backend is awake and reachable, then retry.`);
    }
    if (error instanceof TypeError) {
      throw new Error(`Unable to reach broker backend at ${brokerBase || endpoint}. Check network access or backend availability.`);
    }
    throw error;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

export function getZerodhaStatus() {
  return request('/api/zerodha/status');
}

export function getZerodhaLoginUrl(platform = 'web') {
  const search = platform === 'native' ? '?platform=native' : '';
  return request(`/api/zerodha/login-url${search}`);
}

export function getZerodhaHoldings() {
  return request('/api/zerodha/holdings');
}

export function getZerodhaPositions() {
  return request('/api/zerodha/positions');
}

export function disconnectZerodha() {
  return request('/api/zerodha/disconnect', { method: 'POST' });
}

export function getLiveMarketQuote(symbol, options = {}) {
  return request(`/api/market/quote?symbol=${encodeURIComponent(symbol)}`, options);
}

export function getLiveMarketHistory(symbol, range = 'ytd', interval = '1d') {
  return request(`/api/market/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`);
}

export function getCompanyIntelligence(symbol) {
  return request(`/api/company/intelligence?symbol=${encodeURIComponent(symbol)}`, { timeoutMs: 8000 });
}

export async function getLiveMarketQuotes(symbols = [], options = {}) {
  const uniqueSymbols = [...new Set(symbols.map((symbol) => String(symbol || '').trim().toUpperCase()).filter(Boolean))];
  const concurrency = Math.max(1, Math.min(options.concurrency || 6, 10));
  const results = new Map();
  const failures = [];

  for (let index = 0; index < uniqueSymbols.length; index += concurrency) {
    const batch = uniqueSymbols.slice(index, index + concurrency);
    const settled = await Promise.allSettled(batch.map((symbol) => getLiveMarketQuote(symbol, options)));

    settled.forEach((entry, batchIndex) => {
      const symbol = batch[batchIndex];
      if (entry.status === 'fulfilled' && Number.isFinite(Number(entry.value?.price)) && Number(entry.value.price) > 0) {
        results.set(symbol, entry.value);
      } else {
        failures.push(symbol);
      }
    });
  }

  return { results, failures };
}

export function mapZerodhaHoldingToPortfolio(holding) {
  const symbol = holding.tradingsymbol || holding.symbol;
  const currentPrice = Number(holding.last_price || holding.close_price || 0);
  const averagePrice = Number(holding.average_price || holding.t1_average_price || currentPrice || 0);
  const quantity = Number(
    holding.quantity
    ?? holding.used_quantity
    ?? holding.t1_quantity
    ?? 0,
  );

  return {
    symbol,
    name: holding.company_name || symbol,
    sector: holding.sector || 'Broker Imported',
    quantity,
    buy_price: averagePrice || currentPrice,
    current_price: currentPrice || averagePrice,
    buy_date: new Date().toISOString().slice(0, 10),
    currency: 'INR',
    exchange: holding.exchange || 'NSE',
    notes: `Imported from Zerodha ${holding.product ? `(${holding.product})` : ''}`.trim(),
  };
}

export function mergeBrokerHoldings(existingStocks = [], brokerHoldings = []) {
  const indexed = new Map(existingStocks.map((stock) => [stock.symbol?.toUpperCase(), stock]));

  return brokerHoldings.map((holding) => {
    const mapped = mapZerodhaHoldingToPortfolio(holding);
    const existing = indexed.get(mapped.symbol?.toUpperCase());

    if (!existing) return mapped;

    return {
      ...existing,
      ...mapped,
      id: existing.id,
      created_date: existing.created_date,
      notes: existing.notes || mapped.notes,
    };
  });
}
