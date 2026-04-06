const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BROKER_API_URL || '';

function trimSlash(value = '') {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getBrokerApiBase() {
  return trimSlash(DEFAULT_API_BASE);
}

async function request(path, options = {}) {
  const { timeoutMs = 4500, ...fetchOptions } = options;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : null;

  const response = await fetch(`${getBrokerApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers || {}),
    },
    ...fetchOptions,
    signal: controller?.signal,
  });
  if (timeoutId) window.clearTimeout(timeoutId);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Broker request failed.');
  }
  return data;
}

export function getZerodhaStatus() {
  return request('/api/zerodha/status');
}

export function getZerodhaLoginUrl() {
  return request('/api/zerodha/login-url');
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
