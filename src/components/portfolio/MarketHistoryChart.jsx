import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { useQuery } from '@tanstack/react-query';
import { getBrokerApiBase } from '@/lib/brokerClient';
import { calculateBollingerBands, calculateMACD, calculateRSI, calculateSMA } from '@/utils/indicators';
import { Loader2 } from 'lucide-react';

const RANGE_OPTIONS = [
  { label: '1D', value: '1d' },
  { label: '5D', value: '5d' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: 'ALL', value: 'all' },
];

const INTERVAL_OPTIONS = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1h', value: '60m' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
];

export default function MarketHistoryChart({ stock }) {
  const mainChartContainerRef = useRef(null);
  const rsiChartContainerRef = useRef(null);
  const macdChartContainerRef = useRef(null);
  
  const [range, setRange] = useState('1d');
  const [interval, setInterval] = useState('5m');
  const apiBaseUrl = getBrokerApiBase();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['market-history-custom', stock?.symbol, range, interval],
    enabled: Boolean(stock?.symbol),
    refetchInterval: 15000,
    queryFn: async () => {
      const response = await fetch(
        `${apiBaseUrl}/api/market/history?symbol=${encodeURIComponent(stock.symbol)}&range=${range}&interval=${interval}&exchange=${stock.exchange || 'NSE'}`,
      );
      if (!response.ok) throw new Error('Failed to fetch market history');
      return response.json();
    },
  });

  const chartData = useMemo(() => {
    if (!data?.points) return [];
    return data.points.map(p => ({
      time: new Date(p.date).getTime() / 1000,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    })).sort((a, b) => a.time - b.time);
  }, [data]);

  useEffect(() => {
    if (!mainChartContainerRef.current || chartData.length === 0) return;

    const commonOptions = {
      layout: { background: { color: '#04070c' }, textColor: '#d1d4dc' },
      grid: { vertLines: { color: 'rgba(42, 46, 57, 0.2)' }, horzLines: { color: 'rgba(42, 46, 57, 0.2)' } },
      timeScale: { visible: false },
    };

    // 1. Main Chart
    const mainChart = createChart(mainChartContainerRef.current, {
      ...commonOptions,
      timeScale: { borderColor: 'rgba(197, 203, 206, 0.8)', timeVisible: true },
      crosshair: { mode: 0 },
    });

    const candleSeries = mainChart.addSeries(CandlestickSeries, { upColor: '#26a69a', downColor: '#ef5350' });
    candleSeries.setData(chartData);

    const volumeSeries = mainChart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeries.setData(chartData.map(d => ({
      time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(38, 166, 154, 0.3)' : 'rgba(239, 83, 80, 0.3)'
    })));

    mainChart.addSeries(LineSeries, { color: '#22D3EE', lineWidth: 1 }).setData(calculateSMA(chartData, 20));
    mainChart.addSeries(LineSeries, { color: '#C084FC', lineWidth: 1 }).setData(calculateSMA(chartData, 50));
    mainChart.addSeries(LineSeries, { color: '#34D399', lineWidth: 1 }).setData(calculateSMA(chartData, 200));

    const bb = calculateBollingerBands(chartData);
    mainChart.addSeries(LineSeries, { color: 'rgba(148, 163, 184, 0.3)', lineWidth: 1, lineStyle: 2 }).setData(bb.upper);
    mainChart.addSeries(LineSeries, { color: 'rgba(148, 163, 184, 0.3)', lineWidth: 1, lineStyle: 2 }).setData(bb.lower);

    // 2. RSI Chart
    const rsiChart = createChart(rsiChartContainerRef.current, { ...commonOptions, height: 120 });
    const rsiSeries = rsiChart.addSeries(LineSeries, { color: '#FB7185', lineWidth: 2 });
    rsiSeries.setData(calculateRSI(chartData));
    rsiChart.addSeries(LineSeries, { color: 'rgba(255,255,255,0.1)', lineWidth: 1 }).setData(chartData.map(d => ({ time: d.time, value: 70 })));
    rsiChart.addSeries(LineSeries, { color: 'rgba(255,255,255,0.1)', lineWidth: 1 }).setData(chartData.map(d => ({ time: d.time, value: 30 })));

    // 3. MACD Chart
    const macdChart = createChart(macdChartContainerRef.current, { ...commonOptions, height: 120 });
    const macd = calculateMACD(chartData);
    macdChart.addSeries(HistogramSeries).setData(macd.histogram);
    macdChart.addSeries(LineSeries, { color: '#22D3EE', lineWidth: 1 }).setData(macd.macdLine);
    macdChart.addSeries(LineSeries, { color: '#F59E0B', lineWidth: 1 }).setData(macd.signalLine);

    // Sync charts
    mainChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      rsiChart.timeScale().setVisibleRange(range);
      macdChart.timeScale().setVisibleRange(range);
    });

    mainChart.timeScale().fitContent();

    const handleResize = () => {
      const width = mainChartContainerRef.current.clientWidth;
      mainChart.applyOptions({ width });
      rsiChart.applyOptions({ width });
      macdChart.applyOptions({ width });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      mainChart.remove();
      rsiChart.remove();
      macdChart.remove();
    };
  }, [chartData]);

  return (
    <div className="flex h-full w-full flex-col bg-[#04070c] overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 border-b border-white/10 bg-[#0b1119] px-4 py-2">
        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
          {INTERVAL_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => setInterval(opt.value)}
              className={`rounded px-2 py-1 text-xs font-medium transition ${interval === opt.value ? 'bg-amber-300 text-slate-950' : 'text-slate-400 hover:text-white'}`}>
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => setRange(opt.value)}
              className={`rounded px-2 py-1 text-xs font-medium transition ${range === opt.value ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'}`}>
              {opt.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-amber-300" />}
          <span className="text-xs font-semibold text-amber-200">{stock.symbol}</span>
        </div>
      </div>

      <div className="flex-grow flex flex-col overflow-y-auto">
        <div ref={mainChartContainerRef} className="flex-grow min-h-[400px]" />
        <div className="h-px bg-white/10" />
        <div className="bg-[#0b1119] px-4 py-1 text-[10px] text-slate-500 uppercase tracking-widest">RSI (14)</div>
        <div ref={rsiChartContainerRef} className="h-[120px] shrink-0" />
        <div className="h-px bg-white/10" />
        <div className="bg-[#0b1119] px-4 py-1 text-[10px] text-slate-500 uppercase tracking-widest">MACD (12, 26, 9)</div>
        <div ref={macdChartContainerRef} className="h-[120px] shrink-0" />
      </div>

      <div className="flex items-center justify-between border-t border-white/10 bg-[#0b1119] px-4 py-1.5 text-[10px] text-slate-500">
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-[#22D3EE]" /> SMA 20</span>
          <span className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-[#C084FC]" /> SMA 50</span>
          <span className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-[#34D399]" /> SMA 200</span>
        </div>
        <div>Zerodha Real-time • {range.toUpperCase()} / {interval}</div>
      </div>
    </div>
  );
}
