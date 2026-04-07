function average(values = []) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildSma(values = [], period = 20) {
  return values.map((_, index) => {
    const start = Math.max(0, index - period + 1);
    const slice = values.slice(start, index + 1);
    if (slice.length < period) return null;
    return average(slice);
  });
}

function buildRsi(values = [], period = 14) {
  const rsi = Array(values.length).fill(null);
  if (values.length <= period) return rsi;

  let avgGain = 0;
  let avgLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    avgGain += Math.max(change, 0);
    avgLoss += Math.max(-change, 0);
  }
  avgGain /= period;
  avgLoss /= period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    rsi[index] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
  }

  return rsi;
}

function computeDrawdown(equityCurve = []) {
  let peak = 0;
  let maxDrawdown = 0;

  equityCurve.forEach((value) => {
    peak = Math.max(peak, value);
    if (!peak) return;
    const drawdown = ((peak - value) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  });

  return maxDrawdown;
}

function normalizePoint(point = {}) {
  return {
    ...point,
    close: Number(point.close || 0),
    high: Number(point.high || 0),
    low: Number(point.low || 0),
    open: Number(point.open || 0),
    volume: Number(point.volume || 0),
  };
}

function runSmaCrossover(history, params = {}) {
  const fastPeriod = Math.max(2, Number(params.fastPeriod) || 20);
  const slowPeriod = Math.max(fastPeriod + 1, Number(params.slowPeriod) || 50);
  const closes = history.map((point) => point.close);
  const fast = buildSma(closes, fastPeriod);
  const slow = buildSma(closes, slowPeriod);

  return history.map((point, index) => {
    const prevFast = fast[index - 1];
    const prevSlow = slow[index - 1];
    const fastValue = fast[index];
    const slowValue = slow[index];

    return {
      enter: fastValue !== null && slowValue !== null && prevFast !== null && prevSlow !== null && fastValue > slowValue && prevFast <= prevSlow,
      exit: fastValue !== null && slowValue !== null && prevFast !== null && prevSlow !== null && fastValue < slowValue && prevFast >= prevSlow,
      meta: {
        fast: fastValue,
        slow: slowValue,
      },
      point,
    };
  });
}

function runRsiMeanReversion(history, params = {}) {
  const period = Math.max(2, Number(params.rsiPeriod) || 14);
  const entryLevel = Number(params.entryRsi) || 30;
  const exitLevel = Number(params.exitRsi) || 55;
  const closes = history.map((point) => point.close);
  const rsi = buildRsi(closes, period);

  return history.map((point, index) => {
    const rsiValue = rsi[index];
    return {
      enter: rsiValue !== null && rsiValue <= entryLevel,
      exit: rsiValue !== null && rsiValue >= exitLevel,
      meta: {
        rsi: rsiValue,
      },
      point,
    };
  });
}

function runBreakoutMomentum(history, params = {}) {
  const breakoutPeriod = Math.max(5, Number(params.breakoutPeriod) || 20);
  const exitPeriod = Math.max(3, Number(params.exitPeriod) || 10);

  return history.map((point, index) => {
    const breakoutWindow = history.slice(Math.max(0, index - breakoutPeriod), index);
    const exitWindow = history.slice(Math.max(0, index - exitPeriod), index);
    const breakoutHigh = breakoutWindow.length ? Math.max(...breakoutWindow.map((item) => item.high)) : null;
    const exitLow = exitWindow.length ? Math.min(...exitWindow.map((item) => item.low)) : null;

    return {
      enter: breakoutHigh !== null && point.close > breakoutHigh,
      exit: exitLow !== null && point.close < exitLow,
      meta: {
        breakoutHigh,
        exitLow,
      },
      point,
    };
  });
}

export const ALGO_STRATEGY_TEMPLATES = [
  {
    id: 'sma_crossover',
    name: 'SMA Crossover',
    summary: 'Trend-following system that enters when fast SMA crosses above slow SMA.',
    defaultParams: {
      fastPeriod: 20,
      slowPeriod: 50,
    },
    architectureRole: 'Signal engine',
  },
  {
    id: 'rsi_mean_reversion',
    name: 'RSI Mean Reversion',
    summary: 'Buys oversold pullbacks and exits when momentum normalizes.',
    defaultParams: {
      rsiPeriod: 14,
      entryRsi: 30,
      exitRsi: 55,
    },
    architectureRole: 'Signal engine',
  },
  {
    id: 'breakout_momentum',
    name: 'Breakout Momentum',
    summary: 'Enters when price closes above a rolling breakout range and exits on weakness.',
    defaultParams: {
      breakoutPeriod: 20,
      exitPeriod: 10,
    },
    architectureRole: 'Execution candidate',
  },
];

export const ALGO_ARCHITECTURE_BLOCKS = [
  {
    title: '1. Market Data Ingress',
    subtitle: 'Ticks, quotes, candles, and instrument master',
    points: [
      'Zerodha login handled by remote backend for Android/web safety.',
      'Use WebSocket ticks for real-time signals and REST history for warm-up/backtests.',
      'Normalize symbols and enrich with instrument metadata before strategy logic.',
    ],
  },
  {
    title: '2. Event Bus + Strategy Runtime',
    subtitle: 'Decoupled signal generation',
    points: [
      'Stream each market event into small strategy workers instead of a monolith.',
      'Keep strategies stateless where possible and rebuild state from event history.',
      'Support paper mode first, then promote proven strategies to broker-ready mode.',
    ],
  },
  {
    title: '3. Risk Gate',
    subtitle: 'Capital, drawdown, and kill-switch checks',
    points: [
      'Every order intent passes position sizing, exposure, and stop-loss checks.',
      'Portfolio-level limits should block duplicate correlated positions.',
      'One emergency kill switch should disable all live execution paths.',
    ],
  },
  {
    title: '4. Execution Router',
    subtitle: 'Order intent to broker adapter',
    points: [
      'Translate strategy intents into broker-safe order payloads.',
      'Track acknowledgements, rejects, and retries with idempotent order ids.',
      'Separate paper fills from real fills so testing never touches live capital by mistake.',
    ],
  },
  {
    title: '5. Journal + Monitoring',
    subtitle: 'Observability and operator workflow',
    points: [
      'Log every signal, risk decision, order event, and fill in a journal.',
      'Show strategy health, broker connectivity, and most recent failures.',
      'Persist runs and metrics so Android and web share the same operator view.',
    ],
  },
];

export function createAlgoStrategyDraft(templateId = 'sma_crossover') {
  const template = ALGO_STRATEGY_TEMPLATES.find((item) => item.id === templateId) || ALGO_STRATEGY_TEMPLATES[0];
  return {
    name: `${template.name} Strategy`,
    template_id: template.id,
    symbol: 'SBIN',
    interval: '1d',
    range: '1y',
    mode: 'paper',
    status: 'draft',
    capital: 100000,
    risk_percent: 1,
    params: { ...template.defaultParams },
    notes: template.summary,
  };
}

export function createAlgoControlDraft() {
  return {
    scope: 'global',
    kill_switch: true,
    live_execution_enabled: false,
    max_daily_loss_percent: 2,
    max_open_positions: 5,
    notes: 'Default to paper-safe mode until broker, risk, and schedule checks are approved.',
  };
}

export function createAlgoSchedulerDraft(strategy = null) {
  return {
    strategy_id: strategy?.id || '',
    strategy_name: strategy?.name || '',
    status: 'paused',
    frequency: 'market_open',
    run_time: '09:20',
    timezone: 'Asia/Calcutta',
    last_run_at: null,
    notes: 'Runs only as an operator-approved scheduler configuration.',
  };
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function computeNextScheduledRun(schedule = {}, now = new Date()) {
  const base = new Date(now);
  const [hour, minute] = String(schedule.run_time || '09:20').split(':').map((value) => Number(value));
  const next = new Date(base);
  next.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 20, 0, 0);

  if (schedule.frequency === 'hourly') {
    if (next <= base) {
      next.setHours(next.getHours() + 1);
    }
    return next;
  }

  if (schedule.frequency === 'weekly') {
    while (next <= base || next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  while (next <= base || next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function buildStrategySignals(strategy, rawHistory = []) {
  const history = rawHistory.map(normalizePoint).filter((point) => Number.isFinite(point.close) && point.close > 0);
  switch (strategy?.template_id) {
    case 'rsi_mean_reversion':
      return runRsiMeanReversion(history, strategy?.params);
    case 'breakout_momentum':
      return runBreakoutMomentum(history, strategy?.params);
    case 'sma_crossover':
    default:
      return runSmaCrossover(history, strategy?.params);
  }
}

export function backtestStrategy(strategy, rawHistory = []) {
  const signals = buildStrategySignals(strategy, rawHistory);
  if (!signals.length) {
    return {
      summary: {
        tradeCount: 0,
        winRate: 0,
        totalReturnPercent: 0,
        maxDrawdownPercent: 0,
        lastSignal: 'No data',
        startCapital: Number(strategy?.capital || 100000),
        endCapital: Number(strategy?.capital || 100000),
      },
      trades: [],
      equityCurve: [],
    };
  }

  let capital = Number(strategy?.capital || 100000);
  let quantity = 0;
  let entryPrice = 0;
  let entryDate = null;
  let inPosition = false;
  const trades = [];
  const equityCurve = [];
  let lastSignal = 'Flat';

  signals.forEach(({ point, enter, exit }) => {
    if (!inPosition && enter) {
      quantity = capital / point.close;
      entryPrice = point.close;
      entryDate = point.date;
      inPosition = true;
      lastSignal = `Buy ${new Date(point.date).toLocaleDateString('en-IN')}`;
    } else if (inPosition && exit) {
      const exitValue = quantity * point.close;
      const pnl = exitValue - (quantity * entryPrice);
      capital = exitValue;
      trades.push({
        entryDate,
        exitDate: point.date,
        entryPrice,
        exitPrice: point.close,
        pnl,
        pnlPercent: entryPrice ? ((point.close - entryPrice) / entryPrice) * 100 : 0,
      });
      quantity = 0;
      entryPrice = 0;
      entryDate = null;
      inPosition = false;
      lastSignal = `Sell ${new Date(point.date).toLocaleDateString('en-IN')}`;
    }

    const markToMarket = inPosition ? quantity * point.close : capital;
    equityCurve.push(markToMarket);
  });

  if (inPosition && signals.length) {
    const lastPoint = signals[signals.length - 1].point;
    const exitValue = quantity * lastPoint.close;
    const pnl = exitValue - (quantity * entryPrice);
    capital = exitValue;
    trades.push({
      entryDate,
      exitDate: lastPoint.date,
      entryPrice,
      exitPrice: lastPoint.close,
      pnl,
      pnlPercent: entryPrice ? ((lastPoint.close - entryPrice) / entryPrice) * 100 : 0,
    });
  }

  const tradeCount = trades.length;
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const endCapital = Number(capital.toFixed(2));
  const startCapital = Number(strategy?.capital || 100000);
  const totalReturnPercent = startCapital ? ((endCapital - startCapital) / startCapital) * 100 : 0;

  return {
    summary: {
      tradeCount,
      winRate: tradeCount ? (wins / tradeCount) * 100 : 0,
      totalReturnPercent,
      maxDrawdownPercent: computeDrawdown(equityCurve),
      lastSignal,
      startCapital,
      endCapital,
    },
    trades,
    equityCurve,
  };
}

export function buildPaperOrderIntent({
  strategy,
  latestRun,
  currentPrice,
  brokerConnected = false,
  killSwitch = true,
  liveExecutionEnabled = false,
}) {
  if (!strategy || !latestRun || !Number.isFinite(Number(currentPrice)) || Number(currentPrice) <= 0) {
    return null;
  }

  const signal = String(latestRun.summary?.lastSignal || '');
  const side = signal.startsWith('Buy') ? 'BUY' : signal.startsWith('Sell') ? 'SELL' : null;
  if (!side) return null;

  const capital = Number(strategy.capital || 0);
  const riskPercent = Number(strategy.risk_percent || 1);
  const riskBudget = capital * (riskPercent / 100);
  const quantity = Math.max(1, Math.floor((riskBudget || capital * 0.1 || currentPrice) / currentPrice));
  const notional = quantity * currentPrice;
  const mode = strategy.mode || 'paper';

  let status = 'paper_ready';
  let route = 'paper_blotter';
  let reason = 'Ready for paper execution.';

  if (killSwitch) {
    status = 'blocked';
    reason = 'Global kill switch is engaged.';
  } else if (mode === 'live' && !liveExecutionEnabled) {
    status = 'blocked';
    reason = 'Live execution is not enabled in operator controls.';
  } else if (mode === 'live' && !brokerConnected) {
    status = 'blocked';
    reason = 'Broker session is not connected.';
  } else if (mode === 'live') {
    status = 'live_ready';
    route = 'zerodha_router';
    reason = 'Eligible for broker routing after final confirmation.';
  }

  return {
    strategy_id: strategy.id,
    strategy_name: strategy.name,
    symbol: strategy.symbol,
    side,
    quantity,
    trigger_price: Number(currentPrice.toFixed(2)),
    notional: Number(notional.toFixed(2)),
    mode,
    route,
    status,
    reason,
    signal,
  };
}
