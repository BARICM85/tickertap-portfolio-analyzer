const RRG_WINDOW = 20;
const RRG_MOMENTUM_PERIOD = 14;

export const RRG_BENCHMARKS = {
  nifty50: { label: 'Nifty 50', symbol: '^NSEI' },
  nifty500: { label: 'Nifty 500', symbol: 'NIFTY_500.NS' },
};

export const RRG_UNIVERSES = {
  Index: {
    '^NSEBANK': 'Nifty Bank',
    '^CNXIT': 'Nifty IT',
    '^CNXAUTO': 'Nifty Auto',
    '^CNXFMCG': 'Nifty FMCG',
    '^CNXPHARMA': 'Nifty Pharma',
    '^CNXMETAL': 'Nifty Metal',
    '^CNXENERGY': 'Nifty Energy',
    '^NIFTYPVTBANK': 'Nifty Private Bank',
  },
  Stock: {
    'HDFCBANK.NS': 'HDFC Bank',
    'ICICIBANK.NS': 'ICICI Bank',
    'RELIANCE.NS': 'Reliance',
    'INFY.NS': 'Infosys',
    'TCS.NS': 'TCS',
    'SBIN.NS': 'SBI',
    'BHARTIARTL.NS': 'Bharti Airtel',
    'ITC.NS': 'ITC',
    'LT.NS': 'L&T',
    'AXISBANK.NS': 'Axis Bank',
    'SUNPHARMA.NS': 'Sun Pharma',
    'MARUTI.NS': 'Maruti',
  },
  ETF: {
    'NIFTYBEES.NS': 'Nifty BeES',
    'JUNIORBEES.NS': 'Junior BeES',
    'BANKBEES.NS': 'Bank BeES',
    'ITBEES.NS': 'IT BeES',
    'GOLDBEES.NS': 'Gold BeES',
    'SILVERBEES.NS': 'Silver BeES',
    'MON100.NS': 'Nasdaq 100 ETF',
    'MAFANG.NS': 'NYSE FANG+ ETF',
  },
};

export const RRG_DEFAULT_WATCHLISTS = {
  Index: ['^NSEBANK', '^CNXFMCG', '^CNXPHARMA', '^CNXIT'],
  Stock: ['HDFCBANK.NS', 'ICICIBANK.NS', 'RELIANCE.NS', 'INFY.NS'],
  ETF: ['NIFTYBEES.NS', 'BANKBEES.NS', 'ITBEES.NS', 'GOLDBEES.NS'],
};

export function formatRrgSymbol(symbol, mode = 'Index') {
  return RRG_UNIVERSES[mode]?.[symbol] || symbol.replace('^', '').replace('.NS', '').replace('.BO', '');
}

function rollingMean(values, endIndex, window) {
  const start = Math.max(0, endIndex - window + 1);
  const slice = values.slice(start, endIndex + 1).filter(Number.isFinite);
  if (slice.length < Math.max(5, Math.floor(window / 2))) return null;
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

function rollingStd(values, endIndex, window, mean) {
  const start = Math.max(0, endIndex - window + 1);
  const slice = values.slice(start, endIndex + 1).filter(Number.isFinite);
  if (slice.length < Math.max(5, Math.floor(window / 2))) return null;
  const variance = slice.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / slice.length;
  return Math.sqrt(variance);
}

function zscoreSeries(values, window = RRG_WINDOW) {
  return values.map((value, index) => {
    if (!Number.isFinite(value)) return null;
    const mean = rollingMean(values, index, window);
    if (!Number.isFinite(mean)) return null;
    const std = rollingStd(values, index, window, mean);
    if (!Number.isFinite(std) || std === 0) return null;
    return (value - mean) / std;
  });
}

function classifyQuadrant(rsRatio, rsMomentum) {
  if (rsRatio >= 0 && rsMomentum >= 0) return 'Leading';
  if (rsRatio >= 0 && rsMomentum < 0) return 'Weakening';
  if (rsRatio < 0 && rsMomentum < 0) return 'Lagging';
  return 'Improving';
}

function toDateKey(dateLike) {
  return new Date(dateLike).toISOString().slice(0, 10);
}

function startOfIsoWeek(date) {
  const copy = new Date(date);
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export function resampleHistoryPoints(points = [], timeframe = 'weekly', includePartial = false) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const normalized = points
    .map((point) => ({
      ...point,
      date: new Date(point.date),
      close: Number(point.close),
    }))
    .filter((point) => Number.isFinite(point.close))
    .sort((a, b) => a.date - b.date);

  if (timeframe === 'daily') {
    return includePartial ? normalized : normalized.slice(0, -1);
  }

  const weeklyMap = new Map();
  normalized.forEach((point) => {
    const weekKey = startOfIsoWeek(point.date).toISOString();
    weeklyMap.set(weekKey, point);
  });

  const weekly = [...weeklyMap.values()];
  return includePartial ? weekly : weekly.slice(0, -1);
}

export function buildRrgSnapshot(historyMap, benchmarkSymbol, { tailLength = 10, timeframe = 'weekly', includePartial = false, labels = {} } = {}) {
  const benchmarkRaw = historyMap?.[benchmarkSymbol]?.points || [];
  const benchmarkPoints = resampleHistoryPoints(benchmarkRaw, timeframe, includePartial);
  if (!benchmarkPoints.length) return [];

  const benchmarkSeries = new Map(benchmarkPoints.map((point) => [toDateKey(point.date), Number(point.close)]));

  return Object.entries(historyMap)
    .filter(([symbol]) => symbol !== benchmarkSymbol)
    .map(([symbol, payload]) => {
      const resampled = resampleHistoryPoints(payload?.points || [], timeframe, includePartial);
      const aligned = resampled
        .map((point) => {
          const key = toDateKey(point.date);
          const benchmarkClose = benchmarkSeries.get(key);
          const close = Number(point.close);
          if (!Number.isFinite(close) || !Number.isFinite(benchmarkClose) || benchmarkClose <= 0) return null;
          return { date: key, close, benchmarkClose };
        })
        .filter(Boolean);

      if (aligned.length < Math.max(tailLength + RRG_MOMENTUM_PERIOD, 24)) {
        return null;
      }

      const rsValues = aligned.map((point) => point.close / point.benchmarkClose);
      const momentumValues = rsValues.map((value, index) => {
        if (index < RRG_MOMENTUM_PERIOD) return null;
        const base = rsValues[index - RRG_MOMENTUM_PERIOD];
        if (!Number.isFinite(base) || base === 0) return null;
        return (value - base) / base;
      });

      const ratioZ = zscoreSeries(rsValues);
      const momentumZ = zscoreSeries(momentumValues);
      const rows = aligned
        .map((point, index) => {
          const rsRatio = ratioZ[index];
          const rsMomentum = momentumZ[index];
          if (!Number.isFinite(rsRatio) || !Number.isFinite(rsMomentum)) return null;
          return {
            date: point.date,
            rsRatio,
            rsMomentum,
          };
        })
        .filter(Boolean);

      if (rows.length < tailLength) {
        return null;
      }

      const tail = rows.slice(-tailLength);
      const latest = tail[tail.length - 1];
      return {
        symbol,
        label: labels[symbol] || symbol,
        quadrant: classifyQuadrant(latest.rsRatio, latest.rsMomentum),
        rsRatio: latest.rsRatio,
        rsMomentum: latest.rsMomentum,
        score: latest.rsRatio + latest.rsMomentum,
        tail,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
}

export function toRrg100(value) {
  return 100 + value * 4;
}

export function quadrantTone(quadrant) {
  return {
    Leading: '#22c55e',
    Weakening: '#f59e0b',
    Lagging: '#ef4444',
    Improving: '#60a5fa',
  }[quadrant] || '#cbd5e1';
}
