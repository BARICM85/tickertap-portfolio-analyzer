/**
 * Technical Indicator Calculations for Charts
 */

export function calculateSMA(data, period) {
  const sma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push({ time: data[i].time, value: null });
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    sma.push({ time: data[i].time, value: sum / period });
  }
  return sma.filter(d => d.value !== null);
}

export function calculateBollingerBands(data, period = 20, stdDev = 2) {
  const upper = [];
  const middle = [];
  const lower = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;

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
  const rsi = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < data.length; i++) {
    const difference = data[i].close - data[i - 1].close;
    if (i <= period) {
      if (difference >= 0) gains += difference;
      else losses -= difference;

      if (i === period) {
        let avgGain = gains / period;
        let avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push({ time: data[i].time, value: 100 - 100 / (1 + rs) });
      }
    } else {
      const gain = difference >= 0 ? difference : 0;
      const loss = difference < 0 ? -difference : 0;

      const lastRsi = rsi[rsi.length - 1];
      // Note: This is a simplified EMA-based RSI calculation (Wilder's)
      // For more accurate RSI, we'd need to track rolling average gains/losses
    }
  }
  
  // More robust RSI implementation
  const result = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    if (i < period) {
      avgGain += gain;
      avgLoss += loss;
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
  for (let i = 0; i < emaSlow.length; i++) {
    const fastPoint = emaFast.find(d => d.time === emaSlow[i].time);
    if (fastPoint) {
      macdLine.push({ time: emaSlow[i].time, value: fastPoint.value - emaSlow[i].value });
    }
  }

  const signalLine = calculateEMA(macdLine, signal, 'value');
  
  const histogram = [];
  for (let i = 0; i < signalLine.length; i++) {
    const macdPoint = macdLine.find(d => d.time === signalLine[i].time);
    if (macdPoint) {
      histogram.push({ 
        time: signalLine[i].time, 
        value: macdPoint.value - signalLine[i].value,
        color: (macdPoint.value - signalLine[i].value) >= 0 ? '#26a69a' : '#ef5350'
      });
    }
  }

  return { macdLine, signalLine, histogram };
}

function calculateEMA(data, period, key = 'close') {
  const ema = [];
  const k = 2 / (period + 1);
  let prevEma = data[0][key];

  ema.push({ time: data[0].time, value: prevEma });

  for (let i = 1; i < data.length; i++) {
    const val = data[i][key];
    const currentEma = (val - prevEma) * k + prevEma;
    ema.push({ time: data[i].time, value: currentEma });
    prevEma = currentEma;
  }
  return ema.slice(period - 1);
}
