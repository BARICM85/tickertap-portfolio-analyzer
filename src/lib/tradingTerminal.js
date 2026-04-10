import { namespacedKey } from '@/lib/appConfig';
import { formatCurrency, formatPercent } from '@/lib/portfolioAnalytics';

export const SEMI_AUTO_BUILD_STEPS = [
  {
    step: '1',
    title: 'Scope lock',
    subtitle: 'Semi-automatic delta hedging only',
    points: [
      'Human confirms every live hedge',
      'Paper mode remains the default route',
      'No fully autonomous hedging loop in phase 1',
    ],
    status: 'active',
  },
  {
    step: '2',
    title: 'Broker foundation',
    subtitle: 'Paid Zerodha app, session, and auth recovery',
    points: [
      'Hosted backend manages auth handshake',
      'Session recovery and reconnect rules',
      'Instrument master and broker health checks',
    ],
    status: 'active',
  },
  {
    step: '3',
    title: 'Market data core',
    subtitle: 'Option chain, futures ladder, and quote normalization',
    points: [
      'Spot quote plus futures basis view',
      'Broker-backed option chain with strikes and OI',
      'Fast cache path for repeated contract lookup',
    ],
    status: 'active',
  },
  {
    step: '4',
    title: 'Greeks engine',
    subtitle: 'Live delta, gamma, vega, theta per position',
    points: [
      'Approximate contract greeks now feed the assistant',
      'Still needs richer expiry and IV sensitivity later',
      'Already powers the first hedge recommendation flow',
    ],
    status: 'active',
  },
  {
    step: '5',
    title: 'Position intelligence',
    subtitle: 'Read current F&O structure from broker positions',
    points: [
      'Broker positions now roll into net delta and gamma',
      'Risk pockets are shown for the selected underlying',
      'Still room for portfolio-wide cross-underlying rollups',
    ],
    status: 'active',
  },
  {
    step: '6',
    title: 'Hedge suggestion engine',
    subtitle: 'Semi-auto recommendations instead of blind execution',
    points: [
      'Recommends futures or ATM option hedges',
      'Shows before and after delta effect',
      'One-click hedge preparation now loads the ticket or queues paper intent',
    ],
    status: 'active',
  },
  {
    step: '7',
    title: 'Terminal UI',
    subtitle: 'Dealer workflow across board, chain, ticket, and blotter',
    points: [
      'One route, one terminal, no duplicate surfaces',
      'Fast option chain actions into paper or live flow',
      'README and learning guidance built into the page',
    ],
    status: 'active',
  },
  {
    step: '8',
    title: 'Pre-trade risk controls',
    subtitle: 'Live safety gate before any broker order',
    points: [
      'Arm code, product checks, and max quantity guard',
      'Margin and available funds awareness',
      'Manual operator note and audit trail',
    ],
    status: 'active',
  },
  {
    step: '9',
    title: 'Execution router',
    subtitle: 'Paper by default, guarded live mode',
    points: [
      'Same contract actions route into current mode',
      'Paper intent goes to blotter instantly',
      'Live intent requires explicit confirmation',
    ],
    status: 'active',
  },
  {
    step: '10',
    title: 'Monitoring and resilience',
    subtitle: 'Stale feed, reconnect, and broker failure handling',
    points: [
      'Auto-monitor watches thresholds continuously',
      'Fallback messaging still guards broker-denied structure',
      'Cooldown and audit state prevent noisy duplicate triggers',
    ],
    status: 'active',
  },
  {
    step: '11',
    title: 'Controlled automation',
    subtitle: 'Only after manual semi-auto flow is stable',
    points: [
      'Threshold-based hedge staging is now supported',
      'Live orders still stop at manual confirmation',
      'Full unmanned hedging stays for a later approval gate',
    ],
    status: 'planned',
  },
];

export const TERMINAL_README_SECTIONS = [
  {
    title: 'What This Terminal Is',
    body: 'This is a semi-automatic F&O dealing workspace for Zerodha. It is meant to help monitor structure, prepare trades, and route paper or live orders with human confirmation.',
  },
  {
    title: 'What Phase 1 Covers',
    body: 'Phase 1 focuses on broker connection, option chain, futures ladder, order ticket, blotter, positions, and guarded live execution. It does not promise full automatic delta hedging yet.',
  },
  {
    title: 'What Phase 2 Adds',
    body: 'Phase 2 adds the delta hedge assistant: approximate Greeks, net delta view, risk thresholds, and hedge suggestions that can be loaded into the ticket with one click.',
  },
  {
    title: 'What Phase 3 Adds',
    body: 'Phase 3 introduces controlled automation: auto-monitoring, threshold breach alerts, and semi-auto hedge preparation. It still stops short of full unattended execution.',
  },
  {
    title: 'How To Use It',
    body: 'Pick the underlying, inspect futures and option structure, click Buy or Sell from the chain to preload the ticket, then route to paper blotter or arm live mode for actual order submission.',
  },
  {
    title: 'What Comes Next',
    body: 'The next engineering layer is a proper greeks engine, net portfolio delta monitor, and hedge recommendation module that can suggest the exact hedge contract before execution.',
  },
  {
    title: 'Live Trading Warning',
    body: 'Live mode should stay manual and operator-confirmed. A fully automated hedging loop can create execution, compliance, and risk-management issues if introduced too early.',
  },
];

export const TERMINAL_PRESET_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'RELIANCE', 'SBIN'];

const BLOTTER_STORAGE_KEY = namespacedKey('portfolio_analyzer_terminal_blotter');
const TRACKER_STORAGE_KEY = namespacedKey('portfolio_analyzer_terminal_tracker');
const EXECUTION_GUARD_KEY = namespacedKey('portfolio_analyzer_terminal_execution_guard');
const AUTOMATION_SETTINGS_KEY = namespacedKey('portfolio_analyzer_terminal_automation');

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

export function readAutomationSettings() {
  const fallback = {
    maxNetDelta: 1000,
    maxAbsGamma: 2.5,
    maxOpenLoss: 25000,
    autoMonitoring: true,
    semiAutoTrigger: false,
    autoPreparePaperTrades: true,
    triggerCooldownMinutes: 15,
    lastTriggeredAt: null,
    lastTriggeredSignature: '',
  };
  const rows = readStoredJson(AUTOMATION_SETTINGS_KEY, fallback);
  return typeof rows === 'object' && rows ? { ...fallback, ...rows } : fallback;
}

export function writeAutomationSettings(value = {}) {
  if (!isBrowser()) return;
  const current = readAutomationSettings();
  window.localStorage.setItem(AUTOMATION_SETTINGS_KEY, JSON.stringify({
    ...current,
    ...value,
  }));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function estimateOptionGreeks(strike = 0, spotPrice = 0) {
  if (!spotPrice || !strike) {
    return {
      call: { delta: 0.5, gamma: 0.05, theta: -0.08, vega: 0.12 },
      put: { delta: -0.5, gamma: 0.05, theta: -0.08, vega: 0.12 },
    };
  }

  const distanceRatio = Math.abs(strike - spotPrice) / spotPrice;
  const callDelta = clamp(0.55 - (distanceRatio * 2.2) + (strike <= spotPrice ? 0.1 : -0.08), 0.05, 0.95);
  const putDelta = -clamp(0.55 - (distanceRatio * 2.2) + (strike >= spotPrice ? 0.1 : -0.08), 0.05, 0.95);
  const gamma = clamp(0.12 - (distanceRatio * 0.9), 0.01, 0.18);
  const vega = clamp(0.22 - (distanceRatio * 0.8), 0.03, 0.28);
  const theta = -clamp(0.08 + (distanceRatio * 0.35), 0.04, 0.24);

  return {
    call: {
      delta: Number(callDelta.toFixed(2)),
      gamma: Number(gamma.toFixed(3)),
      theta: Number(theta.toFixed(3)),
      vega: Number(vega.toFixed(3)),
    },
    put: {
      delta: Number(putDelta.toFixed(2)),
      gamma: Number(gamma.toFixed(3)),
      theta: Number(theta.toFixed(3)),
      vega: Number(vega.toFixed(3)),
    },
  };
}

export function enrichOptionRowsWithGreeks(rows = [], spotPrice = 0, lotSize = 1) {
  return rows.map((row) => {
    const strike = Number(row.strike || 0);
    const greeks = estimateOptionGreeks(strike, spotPrice);
    return {
      ...row,
      lotSize: Number(row.call?.lot_size || row.put?.lot_size || lotSize || 1),
      callGreeks: row.callGreeks || greeks.call,
      putGreeks: row.putGreeks || greeks.put,
    };
  });
}

function parseContractDescriptor(symbol = '', fallbackSymbol = '') {
  const upper = String(symbol || '').toUpperCase();
  const fallback = String(fallbackSymbol || '').toUpperCase();
  const descriptor = {
    type: 'OTHER',
    underlying: fallback,
    optionType: '',
    strike: 0,
  };

  if (!upper) return descriptor;
  if (upper.endsWith('CE') || upper.endsWith('PE')) {
    descriptor.type = 'OPTION';
    descriptor.optionType = upper.endsWith('CE') ? 'CE' : 'PE';
    const strikeMatch = upper.match(/(\d+)(CE|PE)$/);
    descriptor.strike = Number(strikeMatch?.[1] || 0);
    const root = upper.replace(/\d+(CE|PE)$/, '').replace(/\d{2}[A-Z]{3}/, '');
    descriptor.underlying = root || fallback;
    return descriptor;
  }

  if (/-?FUT$/.test(upper) || upper.includes('FUT')) {
    descriptor.type = 'FUTURE';
    descriptor.underlying = upper.replace(/\d{2}[A-Z]{3}FUT$/, '').replace(/FUT$/, '') || fallback;
    return descriptor;
  }

  if (upper === fallback) {
    descriptor.type = 'SPOT';
    descriptor.underlying = fallback;
  }

  return descriptor;
}

export function buildDeltaAssistant({
  selectedSymbol = '',
  spotPrice = 0,
  positions = [],
  optionRows = [],
  futuresRows = [],
  optionLotSize = 1,
  thresholds = {},
} = {}) {
  const normalizedSymbol = String(selectedSymbol || '').toUpperCase();
  const enrichedRows = enrichOptionRowsWithGreeks(optionRows, Number(spotPrice || 0), optionLotSize);
  const optionIndex = new Map();

  enrichedRows.forEach((row) => {
    const strike = Number(row.strike || 0);
    if (row.call?.tradingsymbol) {
      optionIndex.set(String(row.call.tradingsymbol).toUpperCase(), {
        row,
        side: 'call',
        contractSymbol: row.call.tradingsymbol,
        price: Number(row.call?.ltp || row.call?.last_price || row.call?.price || 0),
      });
    }
    if (row.put?.tradingsymbol) {
      optionIndex.set(String(row.put.tradingsymbol).toUpperCase(), {
        row,
        side: 'put',
        contractSymbol: row.put.tradingsymbol,
        price: Number(row.put?.ltp || row.put?.last_price || row.put?.price || 0),
      });
    }
    optionIndex.set(`${normalizedSymbol}:${strike}:CE`, {
      row,
      side: 'call',
      contractSymbol: row.call?.tradingsymbol || '',
      price: Number(row.call?.ltp || row.call?.last_price || 0),
    });
    optionIndex.set(`${normalizedSymbol}:${strike}:PE`, {
      row,
      side: 'put',
      contractSymbol: row.put?.tradingsymbol || '',
      price: Number(row.put?.ltp || row.put?.last_price || 0),
    });
  });

  const relevantPositions = positions.filter((row) => {
    const upper = String(row.symbol || '').toUpperCase();
    return upper.includes(normalizedSymbol) || upper === normalizedSymbol;
  });

  const greekRows = relevantPositions.map((row) => {
    const quantity = Number(row.quantity || 0);
    const descriptor = parseContractDescriptor(row.symbol, normalizedSymbol);
    const lotGuess = Number(optionLotSize || futuresRows?.[0]?.lotSize || 1);
    let delta = 0;
    let gamma = 0;
    let theta = 0;
    let vega = 0;
    let pricingSource = 'derived';

    if (descriptor.type === 'FUTURE' || descriptor.type === 'SPOT') {
      delta = quantity;
      pricingSource = 'linear';
    } else if (descriptor.type === 'OPTION') {
      const bySymbol = optionIndex.get(String(row.symbol || '').toUpperCase());
      const byStrike = optionIndex.get(`${normalizedSymbol}:${descriptor.strike}:${descriptor.optionType}`);
      const resolved = bySymbol || byStrike;
      const greekSource = resolved?.side === 'call' ? resolved.row.callGreeks : resolved?.row.putGreeks;
      if (greekSource) {
        delta = quantity * Number(greekSource.delta || 0);
        gamma = quantity * Number(greekSource.gamma || 0);
        theta = quantity * Number(greekSource.theta || 0);
        vega = quantity * Number(greekSource.vega || 0);
        pricingSource = resolved?.contractSymbol ? 'chain-matched' : 'synthetic';
      } else {
        const fallbackGreeks = estimateOptionGreeks(descriptor.strike || spotPrice, spotPrice);
        const greekFallback = descriptor.optionType === 'PE' ? fallbackGreeks.put : fallbackGreeks.call;
        delta = quantity * Number(greekFallback.delta || 0);
        gamma = quantity * Number(greekFallback.gamma || 0);
        theta = quantity * Number(greekFallback.theta || 0);
        vega = quantity * Number(greekFallback.vega || 0);
      }
    }

    return {
      ...row,
      descriptor,
      pricingSource,
      lotGuess,
      delta,
      gamma,
      theta,
      vega,
    };
  });

  const netDelta = greekRows.reduce((sum, row) => sum + Number(row.delta || 0), 0);
  const netGamma = greekRows.reduce((sum, row) => sum + Number(row.gamma || 0), 0);
  const netTheta = greekRows.reduce((sum, row) => sum + Number(row.theta || 0), 0);
  const netVega = greekRows.reduce((sum, row) => sum + Number(row.vega || 0), 0);
  const baseLotSize = Number(optionLotSize || futuresRows?.[0]?.lotSize || 1);
  const lotEquivalent = baseLotSize ? netDelta / baseLotSize : netDelta;

  const maxNetDelta = Number(thresholds.maxNetDelta || 1000);
  const maxAbsGamma = Number(thresholds.maxAbsGamma || 2.5);
  const maxOpenLoss = Number(thresholds.maxOpenLoss || 25000);
  const openPnl = greekRows.reduce((sum, row) => sum + Number(row.pnl || 0), 0);
  const breachReasons = [];
  if (Math.abs(netDelta) > maxNetDelta) breachReasons.push(`Net delta ${netDelta.toFixed(0)} > limit ${maxNetDelta.toFixed(0)}`);
  if (Math.abs(netGamma) > maxAbsGamma) breachReasons.push(`Gamma ${netGamma.toFixed(2)} > limit ${maxAbsGamma.toFixed(2)}`);
  if (openPnl < -Math.abs(maxOpenLoss)) breachReasons.push(`Open P&L below -${formatCurrency(Math.abs(maxOpenLoss))}`);

  const frontFuture = Array.isArray(futuresRows) ? futuresRows[0] : null;
  const atmRow = enrichedRows.find((row) => row.atm) || enrichedRows[0] || null;
  const direction = netDelta > 0 ? 'reduce-positive' : netDelta < 0 ? 'reduce-negative' : 'balanced';
  let hedgeSuggestion = null;

  if (Math.abs(netDelta) > 0 && (frontFuture || atmRow)) {
    const hedgeSide = netDelta > 0 ? 'SELL' : 'BUY';
    const futureLot = Number(frontFuture?.lotSize || baseLotSize || 1);
    const futureLotsNeeded = futureLot ? Math.max(1, Math.round(Math.abs(netDelta) / futureLot)) : 1;
    const optionRow = atmRow;
    const optionType = netDelta > 0 ? 'PE' : 'CE';
    const optionContract = optionType === 'PE' ? optionRow?.put : optionRow?.call;
    const optionGreeks = optionType === 'PE' ? optionRow?.putGreeks : optionRow?.callGreeks;
    const optionLot = Number(optionContract?.lot_size || optionRow?.lotSize || baseLotSize || 1);
    const optionDeltaPerLot = Math.abs(Number(optionGreeks?.delta || 0) * optionLot);
    const optionLotsNeeded = optionDeltaPerLot ? Math.max(1, Math.round(Math.abs(netDelta) / optionDeltaPerLot)) : 1;
    const useFuture = Boolean(frontFuture?.tradingsymbol);

    hedgeSuggestion = {
      key: `${normalizedSymbol}-${direction}-${Math.round(netDelta)}-${frontFuture?.tradingsymbol || optionContract?.tradingsymbol || 'hedge'}`,
      summary: netDelta > 0 ? 'Portfolio is net long delta. Hedge on downside.' : 'Portfolio is net short delta. Hedge on upside.',
      rationale: useFuture
        ? `${hedgeSide} ${futureLotsNeeded} future lot(s) to pull delta closer to neutral quickly.`
        : `${hedgeSide === 'SELL' ? 'BUY' : 'BUY'} ${optionLotsNeeded} ATM ${optionType} lot(s) as directional hedge.`,
      beforeDelta: netDelta,
      estimatedAfterDelta: useFuture
        ? netDelta - ((hedgeSide === 'SELL' ? -1 : 1) * futureLot * futureLotsNeeded)
        : netDelta - ((netDelta > 0 ? -1 : 1) * optionDeltaPerLot * optionLotsNeeded),
      contract: useFuture
        ? {
            segment: 'FUTURES',
            symbol: normalizedSymbol,
            exchange: 'NFO',
            action: hedgeSide,
            contractSymbol: frontFuture.tradingsymbol,
            price: Number(frontFuture.lastPrice || 0),
            quantity: futureLot * futureLotsNeeded,
            lotSize: futureLot,
            expiry: frontFuture.expiry,
          }
        : {
            segment: 'OPTIONS',
            symbol: normalizedSymbol,
            exchange: 'NFO',
            optionType,
            action: 'BUY',
            contractSymbol: optionContract?.tradingsymbol || '',
            strike: optionRow?.strike,
            price: Number(optionContract?.ltp || 0),
            quantity: optionLot * optionLotsNeeded,
            lotSize: optionLot,
            expiry: optionContract?.expiry || optionRow?.expiry,
          },
    };
  }

  return {
    positions: greekRows,
    netDelta,
    netGamma,
    netTheta,
    netVega,
    lotEquivalent,
    thresholds: {
      maxNetDelta,
      maxAbsGamma,
      maxOpenLoss,
    },
    breachReasons,
    hedgeSuggestion,
    monitoringState: breachReasons.length ? 'threshold-breach' : 'within-threshold',
  };
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
