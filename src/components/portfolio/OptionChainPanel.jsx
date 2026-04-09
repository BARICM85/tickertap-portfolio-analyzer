import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { namespacedKey } from '@/lib/appConfig';
import { getBrokerApiBase } from '@/lib/brokerClient';
import { formatCurrency } from '@/lib/portfolioAnalytics';

function buildOptionChain(spotPrice = 0, strikeCount = 9) {
  if (!spotPrice) return [];

  const step = spotPrice >= 5000 ? 100 : spotPrice >= 1000 ? 50 : 20;
  const atmStrike = Math.round(spotPrice / step) * step;
  const totalRows = Math.max(3, Number(strikeCount) || 9);
  const startOffset = -Math.floor(totalRows / 2);

  return Array.from({ length: totalRows }, (_, index) => {
    const strike = atmStrike + ((startOffset + index) * step);
    const distance = Math.abs(strike - spotPrice);
    const baseExtrinsic = Math.max(spotPrice * 0.018 - (distance * 0.15), step * 0.08);
    const callIntrinsic = Math.max(spotPrice - strike, 0);
    const putIntrinsic = Math.max(strike - spotPrice, 0);
    const iv = 16 + (distance / step) * 1.8;
    const oiBase = Math.max(1800 - (distance / step) * 160, 320);

    return {
      strike,
      callLtp: Number((callIntrinsic + baseExtrinsic).toFixed(2)),
      putLtp: Number((putIntrinsic + baseExtrinsic).toFixed(2)),
      callOi: Math.round(oiBase + (strike <= spotPrice ? 280 : 0)),
      putOi: Math.round(oiBase + (strike >= spotPrice ? 280 : 0)),
      callChangeOi: Math.round((Math.sin(index + 1) * 120) + 80),
      putChangeOi: Math.round((Math.cos(index + 1) * 120) + 80),
      iv: Number(iv.toFixed(1)),
      atm: Math.abs(strike - atmStrike) < step / 2,
    };
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addGreeks(rows = [], spotPrice = 0) {
  if (!spotPrice) return rows;

  return rows.map((row) => {
    const distanceRatio = Math.abs(row.strike - spotPrice) / spotPrice;
    const callDelta = clamp(0.55 - (distanceRatio * 2.2) + (row.strike <= spotPrice ? 0.1 : -0.08), 0.05, 0.95);
    const putDelta = -clamp(0.55 - (distanceRatio * 2.2) + (row.strike >= spotPrice ? 0.1 : -0.08), 0.05, 0.95);
    const gamma = clamp(0.12 - (distanceRatio * 0.9), 0.01, 0.18);
    const vega = clamp(0.22 - (distanceRatio * 0.8), 0.03, 0.28);
    const theta = -clamp(0.08 + (distanceRatio * 0.35), 0.04, 0.24);

    return {
      ...row,
      callGreeks: {
        delta: Number(callDelta.toFixed(2)),
        gamma: Number(gamma.toFixed(3)),
        theta: Number(theta.toFixed(3)),
        vega: Number(vega.toFixed(3)),
      },
      putGreeks: {
        delta: Number(putDelta.toFixed(2)),
        gamma: Number(gamma.toFixed(3)),
        theta: Number(theta.toFixed(3)),
        vega: Number(vega.toFixed(3)),
      },
    };
  });
}

function OIBar({ value, maxValue, tone = 'emerald' }) {
  const width = maxValue > 0 ? `${Math.max((value / maxValue) * 100, 6)}%` : '0%';
  const color = tone === 'emerald' ? 'bg-emerald-400/80' : 'bg-rose-400/80';

  return (
    <div className="mt-2 h-2 w-full rounded-full bg-white/8">
      <div className={`h-2 rounded-full ${color}`} style={{ width }} />
    </div>
  );
}

function heatColor(value, maxValue, tone = 'emerald') {
  const ratio = maxValue > 0 ? value / maxValue : 0;
  if (tone === 'emerald') return `rgba(16,185,129,${0.08 + (ratio * 0.28)})`;
  if (tone === 'rose') return `rgba(244,63,94,${0.08 + (ratio * 0.28)})`;
  return `rgba(245,158,11,${0.08 + (ratio * 0.24)})`;
}

export default function OptionChainPanel({ stock, onContractAction }) {
  const columnStorageKey = namespacedKey(`portfolio_analyzer_option_chain_columns_${stock?.symbol || 'default'}`);
  const apiBaseUrl = getBrokerApiBase();
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [strikeCount, setStrikeCount] = useState(12);
  const [sortBy, setSortBy] = useState('strike');
  const [sortDirection, setSortDirection] = useState('asc');
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [columnPrefs, setColumnPrefs] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(window.localStorage.getItem(columnStorageKey) || '{}');
    } catch {
      return {};
    }
  });
  const fallbackChain = useMemo(() => buildOptionChain(stock?.current_price || 0, strikeCount), [stock?.current_price, strikeCount]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['option-chain', stock?.symbol, stock?.exchange, selectedExpiry, strikeCount],
    enabled: Boolean(stock?.symbol),
    queryFn: async () => {
      const response = await fetch(
        `${apiBaseUrl}/api/options/chain?symbol=${encodeURIComponent(stock.symbol)}&exchange=${encodeURIComponent(stock.exchange || 'NSE')}&expiry=${encodeURIComponent(selectedExpiry)}&strikeCount=${encodeURIComponent(strikeCount)}`,
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to load live option chain.');
      }
      return response.json();
    },
  });

  const liveRows = data?.rows || [];
  const usingLive = liveRows.length > 0;
  const chain = usingLive
    ? liveRows.map((row) => ({
        strike: row.strike,
        atm: row.atm,
        call: row.call || null,
        put: row.put || null,
        callLtp: Number(row.call?.ltp || 0),
        putLtp: Number(row.put?.ltp || 0),
        callOi: Number(row.call?.oi || 0),
        putOi: Number(row.put?.oi || 0),
        callChangeOi: Math.max(Number(row.call?.oi || 0) - Number(row.call?.oiDayLow || 0), 0),
        putChangeOi: Math.max(Number(row.put?.oi || 0) - Number(row.put?.oiDayLow || 0), 0),
        iv: row.atm ? 18.5 : 16.8,
      }))
    : fallbackChain;
  const spotPrice = usingLive ? Number(data?.spotPrice || stock?.current_price || 0) : Number(stock?.current_price || 0);
  const enrichedChain = useMemo(() => addGreeks(chain, spotPrice), [chain, spotPrice]);
  const sortedChain = useMemo(() => {
    const rows = [...enrichedChain];
    rows.sort((left, right) => {
      const lookup = {
        strike: [left.strike, right.strike],
        callOi: [left.callOi, right.callOi],
        putOi: [left.putOi, right.putOi],
        callLtp: [left.callLtp, right.callLtp],
        putLtp: [left.putLtp, right.putLtp],
        iv: [left.iv, right.iv],
      };
      const [a, b] = lookup[sortBy] || [left.strike, right.strike];
      return sortDirection === 'asc' ? a - b : b - a;
    });
    return rows;
  }, [enrichedChain, sortBy, sortDirection]);
  const maxCallOi = Math.max(...enrichedChain.map((row) => row.callOi), 0);
  const maxPutOi = Math.max(...enrichedChain.map((row) => row.putOi), 0);
  const maxCallOiRow = enrichedChain.find((row) => row.callOi === maxCallOi) || null;
  const maxPutOiRow = enrichedChain.find((row) => row.putOi === maxPutOi) || null;
  const maxCallChangeOi = Math.max(...enrichedChain.map((item) => item.callChangeOi), 1);
  const maxPutChangeOi = Math.max(...enrichedChain.map((item) => item.putChangeOi), 1);
  const summary = data?.summary;
  const expirySummaries = data?.expirySummaries || [];
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(field);
    setSortDirection(field === 'strike' ? 'asc' : 'desc');
  };

  const headerButtonClass = 'w-full text-inherit transition hover:text-white';
  const visibleColumns = {
    callOi: columnPrefs.callOi ?? true,
    callOiBar: columnPrefs.callOiBar ?? true,
    callChangeOi: columnPrefs.callChangeOi ?? true,
    callLtp: columnPrefs.callLtp ?? true,
    callDelta: columnPrefs.callDelta ?? true,
    callTheta: columnPrefs.callTheta ?? true,
    strike: true,
    iv: columnPrefs.iv ?? true,
    putDelta: columnPrefs.putDelta ?? true,
    putTheta: columnPrefs.putTheta ?? true,
    putLtp: columnPrefs.putLtp ?? true,
    putChangeOi: columnPrefs.putChangeOi ?? true,
    putOiBar: columnPrefs.putOiBar ?? true,
    putOi: columnPrefs.putOi ?? true,
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(columnStorageKey, JSON.stringify(columnPrefs));
  }, [columnPrefs, columnStorageKey]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!sortedChain.length) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveRowIndex((current) => Math.min(current + 1, sortedChain.length - 1));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveRowIndex((current) => Math.max(current - 1, 0));
      }
      if (event.key === 'Home') {
        event.preventDefault();
        setActiveRowIndex(0);
      }
      if (event.key === 'End') {
        event.preventDefault();
        setActiveRowIndex(sortedChain.length - 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sortedChain.length]);

  if (!enrichedChain.length) {
    return (
      <section className="rounded-[32px] border border-white/10 bg-[#0a1018]/95 p-6">
        <p className="text-sm text-slate-400">Option chain will appear when a spot price is available.</p>
      </section>
    );
  }

  return (
    <section className="rounded-[32px] border border-white/10 bg-[#0a1018]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Option Chain</h2>
          <p className="mt-1 text-sm text-slate-400">
            {usingLive
              ? 'Live broker-backed option chain using Zerodha instruments and quote snapshots.'
              : 'Fallback local option chain around the current spot while live broker data is unavailable.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-2 text-xs text-slate-400">
            Spot <span className="font-semibold text-amber-300">{formatCurrency(spotPrice)}</span>
          </div>
          {usingLive ? (
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-emerald-200">
              Zerodha Live
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-2 text-xs uppercase tracking-[0.18em] text-slate-400">
              Local Fallback
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 flex items-center gap-3 rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading option chain...
        </div>
      ) : null}

      {!usingLive && isError ? (
        <div className="mt-4 rounded-[24px] border border-amber-300/15 bg-amber-300/10 px-4 py-4 text-sm text-amber-100">
          {error?.message || 'Live option chain unavailable.'} Showing fallback planning view instead.
        </div>
      ) : null}

      {usingLive ? (
        <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_auto_auto]">
          <div className="flex flex-wrap gap-2">
            {(data?.expiries || []).map((expiry) => (
              <Button
                key={expiry}
                type="button"
                variant="outline"
                onClick={() => setSelectedExpiry(expiry)}
                className={`rounded-2xl border-white/10 ${(!selectedExpiry ? data?.expiry === expiry : selectedExpiry === expiry) ? 'bg-amber-300 text-slate-950 hover:bg-amber-200' : 'bg-white/5 text-white hover:bg-white/10'}`}
              >
                {expiry}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {[8, 10, 12, 15].map((count) => (
              <Button
                key={count}
                type="button"
                variant="outline"
                onClick={() => setStrikeCount(count)}
                className={`rounded-2xl border-white/10 ${strikeCount === count ? 'bg-cyan-300 text-slate-950 hover:bg-cyan-200' : 'bg-white/5 text-white hover:bg-white/10'}`}
              >
                {count} strikes
              </Button>
            ))}
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
            Expiry <span className="font-medium text-white">{data?.expiry}</span>
          </div>
        </div>
      ) : null}

      {usingLive && summary ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {[
            { label: 'PCR', value: summary.pcr?.toFixed(2), tone: 'text-cyan-300' },
            { label: 'Max Pain', value: summary.maxPainStrike ? summary.maxPainStrike.toLocaleString('en-IN') : '--', tone: 'text-amber-300' },
            { label: 'Support', value: summary.supportStrike ? summary.supportStrike.toLocaleString('en-IN') : '--', tone: 'text-emerald-300' },
            { label: 'Resistance', value: summary.resistanceStrike ? summary.resistanceStrike.toLocaleString('en-IN') : '--', tone: 'text-rose-300' },
            { label: 'Max CE OI', value: maxCallOiRow ? `${maxCallOiRow.strike.toLocaleString('en-IN')} • ${Math.round(maxCallOi / 1000)}k` : '--', tone: 'text-emerald-300' },
            { label: 'Max PE OI', value: maxPutOiRow ? `${maxPutOiRow.strike.toLocaleString('en-IN')} • ${Math.round(maxPutOi / 1000)}k` : '--', tone: 'text-rose-300' },
            { label: 'OI Balance', value: `${Math.round((summary.totalPutOi || 0) / 1000)}k / ${Math.round((summary.totalCallOi || 0) / 1000)}k`, tone: 'text-slate-200' },
          ].map((card) => (
            <div key={card.label} className="rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{card.label}</p>
              <p className={`mt-2 text-sm font-semibold ${card.tone}`}>{typeof card.value === 'string' ? card.value.replaceAll('â€¢', '|') : card.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-5 rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-medium text-white">Column Preferences</p>
            <p className="mt-1 text-sm text-slate-400">Show or hide option chain columns. Preferences are saved per symbol.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ['callOi', 'Call OI'],
              ['callLtp', 'Call LTP'],
              ['callDelta', 'Call Delta'],
              ['iv', 'IV'],
              ['putDelta', 'Put Delta'],
              ['putLtp', 'Put LTP'],
              ['putOi', 'Put OI'],
            ].map(([key, label]) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                onClick={() => setColumnPrefs((current) => ({ ...current, [key]: !(current[key] ?? true) }))}
                className={`rounded-2xl border-white/10 ${(columnPrefs[key] ?? true) ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-transparent text-slate-500 hover:bg-white/5'}`}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {usingLive && expirySummaries.length ? (
        <div className="mt-5 rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
          <p className="text-sm font-medium text-white">Expiry-wise OI Trend</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {expirySummaries.map((item) => (
              <div key={item.expiry} className="rounded-2xl border border-white/8 bg-[#111821] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.expiry}</p>
                <p className="mt-2 text-sm text-slate-300">PCR <span className="font-semibold text-cyan-300">{item.pcr.toFixed(2)}</span></p>
                <p className="mt-1 text-sm text-slate-300">ATM <span className="font-semibold text-amber-300">{item.atmStrike?.toLocaleString('en-IN')}</span></p>
                <div className="mt-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-300">Call OI</p>
                  <OIBar value={item.totalCallOi} maxValue={Math.max(...expirySummaries.map((row) => row.totalCallOi), 1)} tone="emerald" />
                </div>
                <div className="mt-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-rose-300">Put OI</p>
                  <OIBar value={item.totalPutOi} maxValue={Math.max(...expirySummaries.map((row) => row.totalPutOi), 1)} tone="rose" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-[28px] border border-white/8 bg-[#060b12]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-[#111b2b] text-[10px] uppercase tracking-[0.24em] text-slate-500">
              <th colSpan={Object.values({ callOi: visibleColumns.callOi, callOiBar: visibleColumns.callOiBar, callChangeOi: visibleColumns.callChangeOi, callLtp: visibleColumns.callLtp, callDelta: visibleColumns.callDelta, callTheta: visibleColumns.callTheta }).filter(Boolean).length} className="sticky top-0 z-20 border-b border-white/6 px-4 py-3 text-right text-emerald-300">Call Side</th>
              <th className="sticky left-0 top-0 z-30 border-b border-white/6 bg-[#111b2b] px-4 py-3 text-center text-amber-200">Strike</th>
              <th colSpan={visibleColumns.iv ? 1 : 0} className="sticky top-0 z-20 border-b border-white/6 px-4 py-3 text-center text-slate-400">IV</th>
              <th colSpan={Object.values({ putDelta: visibleColumns.putDelta, putTheta: visibleColumns.putTheta, putLtp: visibleColumns.putLtp, putChangeOi: visibleColumns.putChangeOi, putOiBar: visibleColumns.putOiBar, putOi: visibleColumns.putOi }).filter(Boolean).length} className="sticky top-0 z-20 border-b border-white/6 px-4 py-3 text-left text-rose-300">Put Side</th>
            </tr>
          </thead>
          <thead className="bg-[#0d1726] text-[11px] uppercase tracking-[0.22em] text-slate-500">
            <tr>
              {visibleColumns.callOi ? <th className="sticky top-[41px] z-20 px-4 py-4 text-right"><button type="button" onClick={() => handleSort('callOi')} className={headerButtonClass}>Call OI</button></th> : null}
              {visibleColumns.callOiBar ? <th className="sticky top-0 z-20 px-4 py-4 text-right">Call OI Bar</th> : null}
              {visibleColumns.callChangeOi ? <th className="sticky top-0 z-20 px-4 py-4 text-right">Call Chg OI</th> : null}
              {visibleColumns.callLtp ? <th className="sticky top-[41px] z-20 px-4 py-4 text-right"><button type="button" onClick={() => handleSort('callLtp')} className={headerButtonClass}>Call LTP</button></th> : null}
              {visibleColumns.callDelta ? <th className="sticky top-0 z-20 px-4 py-4 text-right">Call Delta</th> : null}
              {visibleColumns.callTheta ? <th className="sticky top-0 z-20 px-4 py-4 text-right">Call Theta</th> : null}
              <th className="sticky left-0 top-[41px] z-30 bg-[#0d1726] px-4 py-4 text-center"><button type="button" onClick={() => handleSort('strike')} className={headerButtonClass}>Strike</button></th>
              {visibleColumns.iv ? <th className="sticky top-[41px] z-20 px-4 py-4 text-center"><button type="button" onClick={() => handleSort('iv')} className={headerButtonClass}>IV</button></th> : null}
              {visibleColumns.putDelta ? <th className="sticky top-0 z-20 px-4 py-4 text-left">Put Delta</th> : null}
              {visibleColumns.putTheta ? <th className="sticky top-0 z-20 px-4 py-4 text-left">Put Theta</th> : null}
              {visibleColumns.putLtp ? <th className="sticky top-[41px] z-20 px-4 py-4 text-left"><button type="button" onClick={() => handleSort('putLtp')} className={headerButtonClass}>Put LTP</button></th> : null}
              {visibleColumns.putChangeOi ? <th className="sticky top-0 z-20 px-4 py-4 text-left">Put Chg OI</th> : null}
              {visibleColumns.putOiBar ? <th className="sticky top-0 z-20 px-4 py-4 text-left">Put OI Bar</th> : null}
              {visibleColumns.putOi ? <th className="sticky top-[41px] z-20 px-4 py-4 text-left"><button type="button" onClick={() => handleSort('putOi')} className={headerButtonClass}>Put OI</button></th> : null}
            </tr>
          </thead>
          <tbody>
            {sortedChain.map((row, index) => (
              <tr key={row.strike} className={`border-t border-white/6 ${row.atm ? 'bg-amber-300/10' : 'bg-transparent'} ${index === activeRowIndex ? 'outline outline-1 outline-cyan-300/50' : ''}`}>
                {visibleColumns.callOi ? (
                  <td className="px-4 py-3 text-right text-emerald-300" style={{ backgroundColor: heatColor(row.callOi, maxCallOi, 'emerald') }}>
                    <div className="flex items-center justify-end gap-2">
                      {row.callOi === maxCallOi ? <span className="rounded-full border border-emerald-300/30 bg-emerald-300/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-emerald-200">Max CE</span> : null}
                      <span>{row.callOi.toLocaleString('en-IN')}</span>
                    </div>
                  </td>
                ) : null}
                {visibleColumns.callOiBar ? <td className="px-4 py-3"><OIBar value={row.callOi} maxValue={maxCallOi} tone="emerald" /></td> : null}
                {visibleColumns.callChangeOi ? <td className="px-4 py-3 text-right text-emerald-200" style={{ backgroundColor: heatColor(row.callChangeOi, maxCallChangeOi, 'emerald') }}>{row.callChangeOi.toLocaleString('en-IN')}</td> : null}
                {visibleColumns.callLtp ? (
                  <td className="px-4 py-3 text-right text-white">
                    <div>{formatCurrency(row.callLtp)}</div>
                    {onContractAction && row.call?.tradingsymbol ? (
                      <div className="mt-2 flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onContractAction({
                            segment: 'OPTIONS',
                            optionType: 'CE',
                            contractSymbol: row.call.tradingsymbol,
                            price: row.callLtp,
                            strike: row.strike,
                            expiry: data?.expiry,
                            lotSize: Number(data?.lotSize || 1),
                            symbol: stock?.symbol,
                            action: 'BUY',
                          })}
                          className="rounded-lg bg-emerald-400/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200 hover:bg-emerald-400/25"
                        >
                          Buy
                        </button>
                        <button
                          type="button"
                          onClick={() => onContractAction({
                            segment: 'OPTIONS',
                            optionType: 'CE',
                            contractSymbol: row.call.tradingsymbol,
                            price: row.callLtp,
                            strike: row.strike,
                            expiry: data?.expiry,
                            lotSize: Number(data?.lotSize || 1),
                            symbol: stock?.symbol,
                            action: 'SELL',
                          })}
                          className="rounded-lg bg-rose-400/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-200 hover:bg-rose-400/25"
                        >
                          Sell
                        </button>
                      </div>
                    ) : null}
                  </td>
                ) : null}
                {visibleColumns.callDelta ? <td className="px-4 py-3 text-right text-cyan-300">{row.callGreeks.delta}</td> : null}
                {visibleColumns.callTheta ? <td className="px-4 py-3 text-right text-rose-300">{row.callGreeks.theta}</td> : null}
                <td className="sticky left-0 z-10 px-4 py-3 text-center font-semibold text-amber-200" style={{ backgroundColor: row.atm ? 'rgba(245,158,11,0.18)' : index === activeRowIndex ? '#0b1320' : '#060b12' }}>{row.strike.toLocaleString('en-IN')}</td>
                {visibleColumns.iv ? <td className="px-4 py-3 text-center text-slate-300">{row.iv}%</td> : null}
                {visibleColumns.putDelta ? <td className="px-4 py-3 text-left text-cyan-300">{row.putGreeks.delta}</td> : null}
                {visibleColumns.putTheta ? <td className="px-4 py-3 text-left text-rose-300">{row.putGreeks.theta}</td> : null}
                {visibleColumns.putLtp ? (
                  <td className="px-4 py-3 text-left text-white">
                    <div>{formatCurrency(row.putLtp)}</div>
                    {onContractAction && row.put?.tradingsymbol ? (
                      <div className="mt-2 flex gap-1">
                        <button
                          type="button"
                          onClick={() => onContractAction({
                            segment: 'OPTIONS',
                            optionType: 'PE',
                            contractSymbol: row.put.tradingsymbol,
                            price: row.putLtp,
                            strike: row.strike,
                            expiry: data?.expiry,
                            lotSize: Number(data?.lotSize || 1),
                            symbol: stock?.symbol,
                            action: 'BUY',
                          })}
                          className="rounded-lg bg-emerald-400/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200 hover:bg-emerald-400/25"
                        >
                          Buy
                        </button>
                        <button
                          type="button"
                          onClick={() => onContractAction({
                            segment: 'OPTIONS',
                            optionType: 'PE',
                            contractSymbol: row.put.tradingsymbol,
                            price: row.putLtp,
                            strike: row.strike,
                            expiry: data?.expiry,
                            lotSize: Number(data?.lotSize || 1),
                            symbol: stock?.symbol,
                            action: 'SELL',
                          })}
                          className="rounded-lg bg-rose-400/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-200 hover:bg-rose-400/25"
                        >
                          Sell
                        </button>
                      </div>
                    ) : null}
                  </td>
                ) : null}
                {visibleColumns.putChangeOi ? <td className="px-4 py-3 text-left text-rose-200" style={{ backgroundColor: heatColor(row.putChangeOi, maxPutChangeOi, 'rose') }}>{row.putChangeOi.toLocaleString('en-IN')}</td> : null}
                {visibleColumns.putOiBar ? <td className="px-4 py-3"><OIBar value={row.putOi} maxValue={maxPutOi} tone="rose" /></td> : null}
                {visibleColumns.putOi ? (
                  <td className="px-4 py-3 text-left text-rose-300" style={{ backgroundColor: heatColor(row.putOi, maxPutOi, 'rose') }}>
                    <div className="flex items-center gap-2">
                      {row.putOi === maxPutOi ? <span className="rounded-full border border-rose-300/30 bg-rose-300/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-rose-200">Max PE</span> : null}
                      <span>{row.putOi.toLocaleString('en-IN')}</span>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
          {usingLive && summary ? (
            <tfoot>
              <tr className="sticky bottom-0 z-20 bg-[#111b2b] text-sm text-slate-200">
                <td colSpan={Math.max(Object.values(visibleColumns).filter(Boolean).length, 8)} className="px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <span>PCR <span className="font-semibold text-cyan-300">{summary.pcr?.toFixed(2)}</span></span>
                    <span>Max Pain <span className="font-semibold text-amber-300">{summary.maxPainStrike?.toLocaleString('en-IN')}</span></span>
                    <span>Max CE OI <span className="font-semibold text-emerald-300">{maxCallOiRow?.strike?.toLocaleString('en-IN')}</span></span>
                    <span>Max PE OI <span className="font-semibold text-rose-300">{maxPutOiRow?.strike?.toLocaleString('en-IN')}</span></span>
                    <span>Support <span className="font-semibold text-emerald-300">{summary.supportStrike?.toLocaleString('en-IN')}</span></span>
                    <span>Resistance <span className="font-semibold text-rose-300">{summary.resistanceStrike?.toLocaleString('en-IN')}</span></span>
                    <span className="text-slate-400">Keyboard: Up/Down, Home/End</span>
                  </div>
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}
