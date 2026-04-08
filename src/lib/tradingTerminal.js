import { namespacedKey } from '@/lib/appConfig';
import { formatCurrency, formatPercent } from '@/lib/portfolioAnalytics';

export const TERMINAL_LAYOUTS = [
  {
    title: 'Market ingress',
    subtitle: 'Quotes, futures ladder, option chain, broker positions',
    points: [
      'Zerodha-backed broker status and session',
      'Spot quote plus near-month futures ladder',
      'Option chain with expiry and OI structure',
    ],
  },
  {
    title: 'Execution workspace',
    subtitle: 'Dense operator screen with one-click context',
    points: [
      'Tracked underlyings board on the left',
      'Central chain and futures structure',
      'Order ticket and risk inspector on the right',
    ],
  },
  {
    title: 'Risk gate',
    subtitle: 'Capital, available margin, and position concentration first',
    points: [
      'Order routing stays paper-first in the terminal build',
      'Margins, exposure, and open positions are visible before action',
      'Manual blotter keeps intent history for audit',
    ],
  },
  {
    title: 'Review and monitor',
    subtitle: 'Orders, holdings, expiry map, and operating notes',
    points: [
      'Flattened positions and order history',
      'PCR, support, resistance, max pain, ATM context',
      'Architecture mirrors serious terminal workflows without pretending to auto-trade yet',
    ],
  },
];

export const TERMINAL_PRESET_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'RELIANCE', 'SBIN'];

const BLOTTER_STORAGE_KEY = namespacedKey('portfolio_analyzer_terminal_blotter');
const TRACKER_STORAGE_KEY = namespacedKey('portfolio_analyzer_terminal_tracker');
const EXECUTION_GUARD_KEY = namespacedKey('portfolio_analyzer_terminal_execution_guard');

function isBrowser() {
  return typeof window !== 'undefined';
}

function readStoredJson(key, fallback) {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function readTerminalBlotter() {
  return Array.isArray(readStoredJson(BLOTTER_STORAGE_KEY, []))
    ? readStoredJson(BLOTTER_STORAGE_KEY, [])
    : [];
}

export function writeTerminalBlotter(rows = []) {
  if (!isBrowser()) return;
  window.localStorage.setItem(BLOTTER_STORAGE_KEY, JSON.stringify(rows));
}

export function readTrackedSymbols() {
  const rows = readStoredJson(TRACKER_STORAGE_KEY, TERMINAL_PRESET_SYMBOLS);
  return Array.isArray(rows) && rows.length ? rows : TERMINAL_PRESET_SYMBOLS;
}

export function writeTrackedSymbols(rows = []) {
  if (!isBrowser()) return;
  window.localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(rows));
}

export function readExecutionGuard() {
  const fallback = {
    liveMode: false,
    armed: false,
  };
  const rows = readStoredJson(EXECUTION_GUARD_KEY, fallback);
  return typeof rows === 'object' && rows ? { ...fallback, ...rows } : fallback;
}

export function writeExecutionGuard(value = {}) {
  if (!isBrowser()) return;
  window.localStorage.setItem(EXECUTION_GUARD_KEY, JSON.stringify({
    liveMode: Boolean(value.liveMode),
    armed: Boolean(value.armed),
  }));
}

export function flattenBrokerPositions(payload = {}) {
  const net = Array.isArray(payload?.net) ? payload.net : [];
  const day = Array.isArray(payload?.day) ? payload.day : [];
  const indexed = new Map();

  [...net, ...day].forEach((row, index) => {
    const key = `${row.exchange || 'NSE'}:${row.tradingsymbol || row.symbol || index}`;
    const quantity = Number(row.quantity ?? row.net_quantity ?? row.day_quantity ?? 0);
    const pnl = Number(row.pnl ?? row.m2m ?? 0);
    const avgPrice = Number(row.average_price ?? row.buy_price ?? row.sell_price ?? 0);
    const ltp = Number(row.last_price ?? row.close_price ?? row.average_price ?? 0);
    const product = row.product || row.segment || 'NRML';
    const existing = indexed.get(key);

    indexed.set(key, {
      key,
      symbol: row.tradingsymbol || row.symbol || key,
      exchange: row.exchange || 'NSE',
      product,
      quantity,
      pnl,
      avgPrice,
      ltp,
      overnight: existing?.overnight || net.includes(row),
      intraday: existing?.intraday || day.includes(row),
      raw: row,
    });
  });

  return [...indexed.values()].sort((left, right) => Math.abs(right.pnl) - Math.abs(left.pnl));
}

export function flattenBrokerOrders(payload = []) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.orders) ? payload.orders : [];
  return rows
    .map((row, index) => ({
      id: row.order_id || row.exchange_order_id || `${row.tradingsymbol || 'ORD'}-${index}`,
      symbol: row.tradingsymbol || row.symbol || '--',
      exchange: row.exchange || '--',
      side: row.transaction_type || row.side || '--',
      orderType: row.order_type || '--',
      product: row.product || '--',
      quantity: Number(row.quantity || row.filled_quantity || 0),
      price: Number(row.price || row.average_price || row.trigger_price || 0),
      status: row.status || row.order_status || 'Unknown',
      updatedAt: row.exchange_update_timestamp || row.order_timestamp || row.created_at || null,
      raw: row,
    }))
    .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
}

export function summarizeMargins(payload = {}) {
  const equity = payload?.equity || payload?.data?.equity || payload || {};
  const available = equity.available || {};
  const utilised = equity.utilised || {};

  const liveBalance = Number(
    available.live_balance
    ?? available.cash
    ?? available.opening_balance
    ?? 0,
  );
  const collateral = Number(available.collateral || 0);
  const debits = Number(utilised.debits || utilised.span || 0);
  const optionPremium = Number(utilised.option_premium || 0);
  const exposure = Number(utilised.exposure || utilised.m2m_realised || 0);
  const availableForTrade = liveBalance + collateral - debits - optionPremium;

  return {
    liveBalance,
    collateral,
    debits,
    optionPremium,
    exposure,
    availableForTrade,
  };
}

export function buildTerminalBias(optionSummary, futuresRows = []) {
  const pcr = Number(optionSummary?.pcr || 0);
  const frontFuture = futuresRows[0];
  const basis = Number(frontFuture?.basisPercent || 0);

  if (!optionSummary) {
    return {
      label: 'Waiting for live structure',
      note: 'Connect broker data to compute option and futures bias.',
      tone: 'slate',
    };
  }

  if (pcr > 1.1 && basis >= 0) {
    return {
      label: 'Bullish structure',
      note: `PCR ${pcr.toFixed(2)} with positive near-month basis.`,
      tone: 'emerald',
    };
  }

  if (pcr < 0.85 && basis < 0) {
    return {
      label: 'Bearish structure',
      note: `PCR ${pcr.toFixed(2)} with discounting in front future.`,
      tone: 'rose',
    };
  }

  return {
    label: 'Balanced / range',
    note: `PCR ${pcr.toFixed(2)} and basis ${formatPercent(basis)} suggest mixed structure.`,
    tone: 'amber',
  };
}

export function createTicketDraft(symbol = 'NIFTY') {
  return {
    symbol,
    contractSymbol: '',
    segment: 'OPTIONS',
    exchange: 'NFO',
    side: 'BUY',
    orderType: 'MARKET',
    product: 'NRML',
    validity: 'DAY',
    quantity: 1,
    price: '',
    triggerPrice: '',
    note: '',
  };
}

export function createBlotterEntry(ticket, context = {}) {
  const now = new Date().toISOString();
  return {
    id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
    symbol: ticket.symbol,
    contractSymbol: ticket.contractSymbol || ticket.symbol,
    segment: ticket.segment,
    exchange: ticket.exchange || 'NFO',
    side: ticket.side,
    orderType: ticket.orderType,
    product: ticket.product,
    validity: ticket.validity || 'DAY',
    quantity: Number(ticket.quantity || 0),
    price: Number(ticket.price || context.referencePrice || 0),
    triggerPrice: Number(ticket.triggerPrice || 0),
    note: ticket.note || context.note || '',
    state: context.liveExecutionEnabled ? 'Live-ready' : 'Paper',
    createdAt: now,
  };
}

export function getToneClasses(tone = 'slate') {
  return {
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
    rose: 'border-rose-400/20 bg-rose-400/10 text-rose-100',
    amber: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
    cyan: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100',
    slate: 'border-white/8 bg-white/[0.03] text-slate-200',
  }[tone] || 'border-white/8 bg-white/[0.03] text-slate-200';
}

export function formatTerminalOrder(order) {
  return `${order.side} ${order.quantity} ${order.contractSymbol || order.symbol} @ ${order.orderType === 'MARKET' ? 'MKT' : formatCurrency(order.price || 0)}`;
}
