/**
 * Technical Indicator Calculations for Charts
 * 
 * IMPORTANT: All functions return an array of the SAME length as the input data
 * to ensure perfect index alignment across multi-pane charts.
 */

export function calculateSMA(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push({ time: data[i].time });
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

export function calculateEMA(data, period, key = 'close') {
  const ema = [];
  const k = 2 / (period + 1);
  let prevEma = null;

  for (let i = 0; i < data.length; i++) {
    const val = data[i][key];
    
    if (val === undefined || val === null) {
      ema.push({ time: data[i].time });
      continue;
    }

    if (prevEma === null) {
      prevEma = val;
      ema.push({ time: data[i].time, value: val });
    } else {
      const currentEma = (val - prevEma) * k + prevEma;
      ema.push({ time: data[i].time, value: currentEma });
      prevEma = currentEma;
    }
  }
  return ema;
}

export function calculateBollingerBands(data, period = 20, stdDev = 2) {
  const upper = [];
  const middle = [];
  const lower = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push({ time: data[i].time });
      middle.push({ time: data[i].time });
      lower.push({ time: data[i].time });
      continue;
    }

    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    const avg = sum / period;

    let sqDiffSum = 0;
    for (let j = 0; j < period; j++) {
      sqDiffSum += Math.pow(data[i - j].close - avg, 2);
    }
    const dev = Math.sqrt(sqDiffSum / period);

    middle.push({ time: data[i].time, value: avg });
    upper.push({ time: data[i].time, value: avg + stdDev * dev });
    lower.push({ time: data[i].time, value: avg - stdDev * dev });
  }

  return { upper, middle, lower };
}

export function calculateRSI(data, period = 14) {
  const result = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push({ time: data[i].time });
      continue;
    }

    const change = data[i].close - data[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    if (i < period) {
      avgGain += gain;
      avgLoss += loss;
      result.push({ time: data[i].time });
    } else if (i === period) {
      avgGain = (avgGain + gain) / period;
      avgLoss = (avgLoss + loss) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push({ time: data[i].time, value: 100 - 100 / (1 + rs) });
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push({ time: data[i].time, value: 100 - 100 / (1 + rs) });
    }
  }
  return result;
}

export function calculateMACD(data, fast = 12, slow = 26, signal = 9) {
  const emaFast = calculateEMA(data, fast);
  const emaSlow = calculateEMA(data, slow);
  
  const macdLine = [];
  for (let i = 0; i < data.length; i++) {
    const f = emaFast[i]?.value;
    const s = emaSlow[i]?.value;
    if (f !== undefined && s !== undefined) {
      macdLine.push({ time: data[i].time, value: f - s });
    } else {
      macdLine.push({ time: data[i].time });
    }
  }

  const signalLine = calculateEMA(macdLine, signal, 'value');
  
  const histogram = [];
  for (let i = 0; i < data.length; i++) {
    const m = macdLine[i]?.value;
    const sig = signalLine[i]?.value;
    if (m !== undefined && sig !== undefined) {
      const val = m - sig;
      histogram.push({ 
        time: data[i].time, 
        value: val,
        color: val >= 0 ? '#26a69a' : '#ef5350'
      });
    } else {
      histogram.push({ time: data[i].time });
    }
  }

  return { macdLine, signalLine, histogram };
}
