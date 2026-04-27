import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { useQuery } from '@tanstack/react-query';
import { getBrokerApiBase } from '@/lib/brokerClient';
import { calculateBollingerBands, calculateMACD, calculateRSI, calculateSMA, calculateEMA } from '@/utils/indicators';
import { Loader2 } from 'lucide-react';
import IndicatorSettings from './IndicatorSettings';

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

const DEFAULT_INDICATORS = {
  sma20: { name: 'SMA 20', active: true, type: 'sma', period: 20, color: '#22D3EE', thickness: 1 },
  sma50: { name: 'SMA 50', active: true, type: 'sma', period: 50, color: '#C084FC', thickness: 1 },
  sma200: { name: 'SMA 200', active: true, type: 'sma', period: 200, color: '#34D399', thickness: 1 },
  ema20: { name: 'EMA 20', active: false, type: 'ema', period: 20, color: '#F59E0B', thickness: 1 },
  bb: { name: 'Bollinger Bands', active: true, type: 'bb', period: 20, stdDev: 2, color: 'rgba(148, 163, 184, 0.2)', thickness: 1 },
  rsi: { name: 'RSI (Pane)', active: true, type: 'rsi', period: 14, color: '#FB7185', thickness: 2 },
  macd: { name: 'MACD (Pane)', active: true, type: 'macd', fast: 12, slow: 26, signal: 9, color: '#22D3EE', thickness: 1 },
};

export default function MarketHistoryChart({ stock }) {
  const mainChartContainerRef = useRef(null);
  const rsiChartContainerRef = useRef(null);
  const macdChartContainerRef = useRef(null);
  
  const [range, setRange] = useState('1d');
  const [interval, setInterval] = useState('5m');
  const [indicators, setIndicators] = useState(() => {
    const saved = localStorage.getItem('chart_indicators_config');
    return saved ? JSON.parse(saved) : DEFAULT_INDICATORS;
  });

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

  useEffect(() => {
    localStorage.setItem('chart_indicators_config', JSON.stringify(indicators));
  }, [indicators]);

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
      grid: { vertLines: { color: 'rgba(42, 46, 57, 0.05)' }, horzLines: { color: 'rgba(42, 46, 57, 0.05)' } },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.1)',
        autoScale: true,
        minimumWidth: 80,
      },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    };

    // 1. Initialize Main Chart
    const mainChart = createChart(mainChartContainerRef.current, {
      ...commonOptions,
      timeScale: { 
        visible: true, 
        borderColor: 'rgba(197, 203, 206, 0.5)', 
        timeVisible: true,
        fixLeftEdge: true,
        shiftVisibleRangeOnNewBar: true,
      },
      handleScroll: true,
      handleScale: true,
      crosshair: { mode: 0 },
    });

    const candleSeries = mainChart.addSeries(CandlestickSeries, { 
      upColor: '#26a69a', downColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350', borderVisible: false,
    });
    candleSeries.setData(chartData);

    const volumeSeries = mainChart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeries.setData(chartData.map(d => ({
      time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(38, 166, 154, 0.2)' : 'rgba(239, 83, 80, 0.2)'
    })));

    // Overlay Indicators
    if (indicators.sma20.active) mainChart.addSeries(LineSeries, { color: indicators.sma20.color, lineWidth: indicators.sma20.thickness, crosshairMarkerVisible: false }).setData(calculateSMA(chartData, indicators.sma20.period));
    if (indicators.sma50.active) mainChart.addSeries(LineSeries, { color: indicators.sma50.color, lineWidth: indicators.sma50.thickness, crosshairMarkerVisible: false }).setData(calculateSMA(chartData, indicators.sma50.period));
    if (indicators.sma200.active) mainChart.addSeries(LineSeries, { color: indicators.sma200.color, lineWidth: indicators.sma200.thickness, crosshairMarkerVisible: false }).setData(calculateSMA(chartData, indicators.sma200.period));
    if (indicators.ema20.active) mainChart.addSeries(LineSeries, { color: indicators.ema20.color, lineWidth: indicators.ema20.thickness, crosshairMarkerVisible: false }).setData(calculateEMA(chartData, indicators.ema20.period));
    
    if (indicators.bb.active) {
      const bb = calculateBollingerBands(chartData, indicators.bb.period, indicators.bb.stdDev);
      mainChart.addSeries(LineSeries, { color: indicators.bb.color, lineWidth: indicators.bb.thickness, lineStyle: 2, crosshairMarkerVisible: false }).setData(bb.upper);
      mainChart.addSeries(LineSeries, { color: indicators.bb.color, lineWidth: indicators.bb.thickness, lineStyle: 2, crosshairMarkerVisible: false }).setData(bb.lower);
    }

    // 2. Initialize RSI Chart (If active)
    let rsiChart = null;
    let rsiSeries = null;
    if (indicators.rsi.active && rsiChartContainerRef.current) {
      rsiChart = createChart(rsiChartContainerRef.current, { ...commonOptions, height: 120 });
      rsiSeries = rsiChart.addSeries(LineSeries, { color: indicators.rsi.color, lineWidth: indicators.rsi.thickness });
      rsiSeries.setData(calculateRSI(chartData, indicators.rsi.period));
      rsiChart.addSeries(LineSeries, { color: 'rgba(255,255,255,0.05)', lineWidth: 1, crosshairMarkerVisible: false }).setData(chartData.map(d => ({ time: d.time, value: 70 })));
      rsiChart.addSeries(LineSeries, { color: 'rgba(255,255,255,0.05)', lineWidth: 1, crosshairMarkerVisible: false }).setData(chartData.map(d => ({ time: d.time, value: 30 })));
    }

    // 3. Initialize MACD Chart (If active)
    let macdChart = null;
    let macdLineSeries = null;
    if (indicators.macd.active && macdChartContainerRef.current) {
      macdChart = createChart(macdChartContainerRef.current, { ...commonOptions, height: 140 });
      const macdData = calculateMACD(chartData, indicators.macd.fast, indicators.macd.slow, indicators.macd.signal);
      macdChart.addSeries(HistogramSeries).setData(macdData.histogram);
      macdLineSeries = macdChart.addSeries(LineSeries, { color: indicators.macd.color, lineWidth: indicators.macd.thickness });
      macdLineSeries.setData(macdData.macdLine);
      macdChart.addSeries(LineSeries, { color: '#F59E0B', lineWidth: 1 }).setData(macdData.signalLine);
    }

    // Multi-Pane SYNC
    const timeScale = mainChart.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      if (rsiChart) rsiChart.timeScale().setVisibleLogicalRange(range);
      if (macdChart) macdChart.timeScale().setVisibleLogicalRange(range);
    });

    mainChart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        if (rsiChart) rsiChart.clearCrosshairPosition();
        if (macdChart) macdChart.clearCrosshairPosition();
        return;
      }
      if (rsiChart) rsiChart.setCrosshairPosition(0, param.time, rsiSeries);
      if (macdChart) macdChart.setCrosshairPosition(0, param.time, macdLineSeries);
    });

    const handleResize = () => {
      if (!mainChartContainerRef.current) return;
      const width = mainChartContainerRef.current.clientWidth;
      mainChart.applyOptions({ width });
      if (rsiChart) rsiChart.applyOptions({ width });
      if (macdChart) macdChart.applyOptions({ width });
      
      const priceWidth = mainChart.priceScale('right').width();
      if (priceWidth > 0) {
        if (rsiChart) rsiChart.priceScale('right').applyOptions({ minimumWidth: priceWidth });
        if (macdChart) macdChart.priceScale('right').applyOptions({ minimumWidth: priceWidth });
      }
    };

    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      mainChart.remove();
      if (rsiChart) rsiChart.remove();
      if (macdChart) macdChart.remove();
    };
  }, [chartData, indicators]);

  return (
    <div className="flex h-full w-full flex-col bg-[#04070c] overflow-hidden select-none">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 border-b border-white/10 bg-[#0b1119] px-4 py-2 z-10">
        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
          {INTERVAL_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => setInterval(opt.value)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${interval === opt.value ? 'bg-amber-300 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}>
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => setRange(opt.value)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${range === opt.value ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'}`}>
              {opt.label}
            </button>
          ))}
        </div>
        
        <IndicatorSettings indicators={indicators} onUpdate={setIndicators} />

        <div className="ml-auto flex items-center gap-3">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-amber-300" />}
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-amber-200 leading-none">{stock.symbol}</span>
            <span className="text-[9px] uppercase tracking-wider text-slate-500 mt-1">{stock.exchange || 'NSE'} Real-time</span>
          </div>
        </div>
      </div>

      <div className="flex-grow flex flex-col overflow-hidden">
        <div className="relative flex-grow min-h-[200px]">
          <div ref={mainChartContainerRef} className="absolute inset-0" />
        </div>
        
        {indicators.rsi.active && (
          <div className="shrink-0 border-t border-white/10">
            <div className="bg-[#0b1119]/50 px-4 py-0.5 flex justify-between items-center border-b border-white/5">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">RSI ({indicators.rsi.period})</span>
            </div>
            <div ref={rsiChartContainerRef} className="h-[120px]" />
          </div>
        )}

        {indicators.macd.active && (
          <div className="shrink-0 border-t border-white/10">
            <div className="bg-[#0b1119]/50 px-4 py-0.5 flex justify-between items-center border-b border-white/5">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">MACD ({indicators.macd.fast}, {indicators.macd.slow}, {indicators.macd.signal})</span>
            </div>
            <div ref={macdChartContainerRef} className="h-[140px]" />
          </div>
        )}
      </div>

      {/* Legend Footer */}
      <div className="flex items-center justify-between border-t border-white/10 bg-[#0b1119] px-4 py-1.5 text-[10px] text-slate-500">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(indicators).filter(([_, c]) => c.active && c.type !== 'rsi' && c.type !== 'macd').map(([id, config]) => (
            <span key={id} className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: config.color }} /> 
              {config.name} {config.period ? `(${config.period})` : ''}
            </span>
          ))}
        </div>
        <div className="font-mono opacity-80 shrink-0">{range.toUpperCase()} • {interval}</div>
      </div>
    </div>
  );
}
