import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Layers3,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import StockAutocompleteInput from '@/components/shared/StockAutocompleteInput';
import OptionChainPanel from '@/components/portfolio/OptionChainPanel';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  createBlotterEntry,
  createTicketDraft,
  buildTerminalBias,
  flattenBrokerOrders,
  flattenBrokerPositions,
  formatTerminalOrder,
  getToneClasses,
  readExecutionGuard,
  readTerminalBlotter,
  readTrackedSymbols,
  summarizeMargins,
  TERMINAL_LAYOUTS,
  writeExecutionGuard,
  writeTerminalBlotter,
  writeTrackedSymbols,
} from '@/lib/tradingTerminal';
import {
  getFuturesBoard,
  getLiveMarketQuote,
  getOptionChain,
  getZerodhaMargins,
  getZerodhaOrders,
  getZerodhaPositions,
  getZerodhaStatus,
  placeZerodhaOrder,
} from '@/lib/brokerClient';
import { getStockProfile } from '@/lib/marketData';
import { formatCompactCurrency, formatCurrency, formatPercent } from '@/lib/portfolioAnalytics';

function Section({ title, subtitle, action, className = '', children }) {
  return (
    <section className={`rounded-[28px] border border-white/10 bg-[#09131f]/92 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.24)] ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, note, tone = 'slate' }) {
  return (
    <div className={`rounded-[22px] border px-4 py-3 ${getToneClasses(tone)}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      {note ? <p className="mt-1 text-xs opacity-80">{note}</p> : null}
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TradingTerminal() {
  const [trackedSymbols, setTrackedSymbols] = useState(() => readTrackedSymbols());
  const [selectedSymbol, setSelectedSymbol] = useState(() => readTrackedSymbols()[0] || 'NIFTY');
  const [blotter, setBlotter] = useState(() => readTerminalBlotter());
  const [executionGuard, setExecutionGuard] = useState(() => readExecutionGuard());
  const [ticket, setTicket] = useState(() => createTicketDraft(readTrackedSymbols()[0] || 'NIFTY'));
  const [searchValue, setSearchValue] = useState('');
  const [armCode, setArmCode] = useState('');
  const [refreshPulse, setRefreshPulse] = useState(0);
  const [confirmLiveOpen, setConfirmLiveOpen] = useState(false);
  const [placingLive, setPlacingLive] = useState(false);

  useEffect(() => {
    writeTrackedSymbols(trackedSymbols);
  }, [trackedSymbols]);

  useEffect(() => {
    writeTerminalBlotter(blotter);
  }, [blotter]);

  useEffect(() => {
    writeExecutionGuard(executionGuard);
  }, [executionGuard]);

  useEffect(() => {
    setTicket((current) => ({ ...current, symbol: selectedSymbol }));
  }, [selectedSymbol]);

  const { data: zerodhaStatus, isFetching: statusFetching } = useQuery({
    queryKey: ['terminal-zerodha-status', refreshPulse],
    queryFn: getZerodhaStatus,
    refetchInterval: 30000,
  });

  const { data: boardQuotes = [], isFetching: boardFetching } = useQuery({
    queryKey: ['terminal-board-quotes', trackedSymbols, refreshPulse],
    queryFn: async () => Promise.all(
      trackedSymbols.map(async (symbol) => {
        const profile = getStockProfile(symbol);
        try {
          const live = await getLiveMarketQuote(symbol, { timeoutMs: 5000 });
          return {
            symbol,
            name: profile.name,
            price: Number(live.price || profile.current_price || 0),
            changePercent: Number(live.changePercent || 0),
            sector: profile.sector,
            source: live.source || 'broker',
          };
        } catch {
          return {
            symbol,
            name: profile.name,
            price: Number(profile.current_price || 0),
            changePercent: Number(profile.day_change_percent || 0),
            sector: profile.sector,
            source: 'fallback',
          };
        }
      }),
    ),
    staleTime: 15000,
  });

  const { data: optionOverview, isFetching: optionFetching, error: optionError } = useQuery({
    queryKey: ['terminal-option-overview', selectedSymbol, refreshPulse],
    queryFn: () => getOptionChain(selectedSymbol, 'NSE', '', 12),
    staleTime: 15000,
  });

  const { data: futuresBoard, isFetching: futuresFetching, error: futuresError } = useQuery({
    queryKey: ['terminal-futures-board', selectedSymbol, refreshPulse],
    queryFn: () => getFuturesBoard(selectedSymbol, 'NSE'),
    staleTime: 15000,
  });

  const { data: positionsPayload, error: positionsError } = useQuery({
    queryKey: ['terminal-positions', refreshPulse],
    queryFn: getZerodhaPositions,
    enabled: Boolean(zerodhaStatus?.connected),
    staleTime: 15000,
  });

  const { data: ordersPayload, error: ordersError } = useQuery({
    queryKey: ['terminal-orders', refreshPulse],
    queryFn: getZerodhaOrders,
    enabled: Boolean(zerodhaStatus?.connected),
    staleTime: 15000,
  });

  const { data: marginsPayload, error: marginsError } = useQuery({
    queryKey: ['terminal-margins', refreshPulse],
    queryFn: getZerodhaMargins,
    enabled: Boolean(zerodhaStatus?.connected),
    staleTime: 15000,
  });

  const selectedBoardRow = useMemo(
    () => boardQuotes.find((item) => item.symbol === selectedSymbol) || null,
    [boardQuotes, selectedSymbol],
  );
  const selectedProfile = getStockProfile(selectedSymbol);
  const stock = useMemo(() => ({
    id: `terminal-${selectedSymbol}`,
    symbol: selectedSymbol,
    name: selectedBoardRow?.name || selectedProfile.name,
    sector: selectedBoardRow?.sector || selectedProfile.sector,
    exchange: 'NSE',
    current_price: Number(selectedBoardRow?.price || selectedProfile.current_price || 0),
  }), [selectedBoardRow, selectedProfile, selectedSymbol]);

  const positions = useMemo(() => flattenBrokerPositions(positionsPayload || {}), [positionsPayload]);
  const orders = useMemo(() => flattenBrokerOrders(ordersPayload || []), [ordersPayload]);
  const margins = useMemo(() => summarizeMargins(marginsPayload || {}), [marginsPayload]);
  const terminalBias = useMemo(
    () => buildTerminalBias(optionOverview?.summary, futuresBoard?.rows || []),
    [optionOverview?.summary, futuresBoard?.rows],
  );
  const optionSummary = optionOverview?.summary || null;
  const activeExpiry = optionOverview?.expiry || futuresBoard?.rows?.[0]?.expiry || '--';
  const brokerConnected = Boolean(zerodhaStatus?.connected);
  const blotterCount = blotter.length;
  const netPnl = positions.reduce((sum, row) => sum + Number(row.pnl || 0), 0);
  const atmOptionRow = useMemo(
    () => (optionOverview?.rows || []).find((row) => row.atm) || optionOverview?.rows?.[0] || null,
    [optionOverview?.rows],
  );
  const liveModeArmed = executionGuard.liveMode && executionGuard.armed && armCode.trim().toUpperCase() === 'LIVE';
  const executionModeLabel = executionGuard.liveMode ? 'Live routing selected' : 'Paper routing selected';

  const primeTicketFromContract = (contract, side = ticket.side) => {
    const lots = Number(contract.lotSize || ticket.quantity || 1);
    const nextTicket = {
      ...ticket,
      symbol: contract.symbol || selectedSymbol,
      segment: contract.segment || ticket.segment,
      exchange: contract.exchange || 'NFO',
      side,
      contractSymbol: contract.contractSymbol || '',
      quantity: String(lots),
      price: contract.price ? String(contract.price) : '',
      note: contract.expiry ? `Expiry ${contract.expiry}` : ticket.note,
    };
    setTicket(nextTicket);
    return nextTicket;
  };

  const handleDeleteBlotterEntry = (entryId) => {
    setBlotter((current) => current.filter((row) => row.id !== entryId));
    toast.success('Blotter entry deleted.');
  };

  const handleTrackSymbol = (item) => {
    const symbol = String(item?.symbol || '').toUpperCase();
    if (!symbol) return;
    setSelectedSymbol(symbol);
    setSearchValue(symbol);
    setTrackedSymbols((current) => (current.includes(symbol) ? current : [symbol, ...current].slice(0, 10)));
  };

  const handleSaveTicket = () => {
    if (!ticket.contractSymbol || !ticket.quantity) {
      toast.error('Contract symbol and quantity are required for the blotter.');
      return;
    }

    const referencePrice = Number(
      optionOverview?.spotPrice
      || futuresBoard?.rows?.[0]?.lastPrice
      || stock.current_price
      || 0,
    );

    const entry = createBlotterEntry(ticket, {
      referencePrice,
      liveExecutionEnabled: brokerConnected,
      note: activeExpiry ? `Expiry ${activeExpiry}` : '',
    });
    setBlotter((current) => [entry, ...current].slice(0, 30));
    toast.success(`${formatTerminalOrder(entry)} added to terminal blotter.`);
    setTicket(createTicketDraft(ticket.symbol));
  };

  const handleQuickContract = (contractSymbol, nextSegment, referencePrice = '') => {
    if (!contractSymbol) return;
    setTicket((current) => ({
      ...current,
      segment: nextSegment || current.segment,
      contractSymbol,
      exchange: 'NFO',
      price: referencePrice ? String(referencePrice) : current.price,
    }));
  };

  const handleOptionChainAction = (contract) => {
    const nextTicket = primeTicketFromContract(contract, contract.action);
    if (!executionGuard.liveMode) {
      const entry = createBlotterEntry(nextTicket, {
        referencePrice: Number(contract.price || optionOverview?.spotPrice || stock.current_price || 0),
        liveExecutionEnabled: false,
        note: `${contract.optionType || contract.segment} quick route | ${contract.expiry || activeExpiry}`,
      });
      setBlotter((current) => [entry, ...current].slice(0, 30));
      toast.success(`${formatTerminalOrder(entry)} added to paper blotter.`);
      return;
    }

    if (!liveModeArmed) {
      toast.error('Live mode is selected, but the terminal is not armed. Ticket is prefilled and ready for review.');
      return;
    }

    setConfirmLiveOpen(true);
  };

  const handlePlaceLiveOrder = async () => {
    if (!liveModeArmed) {
      toast.error('Arm live mode with the LIVE code before sending a broker order.');
      return;
    }
    if (!brokerConnected) {
      toast.error('Connect Zerodha first.');
      return;
    }
    if (!ticket.contractSymbol || !ticket.quantity) {
      toast.error('Contract symbol and quantity are required.');
      return;
    }

    setPlacingLive(true);
    try {
      const response = await placeZerodhaOrder({
        tradingsymbol: ticket.contractSymbol,
        exchange: ticket.exchange || 'NFO',
        transaction_type: ticket.side,
        order_type: ticket.orderType,
        product: ticket.product,
        validity: ticket.validity || 'DAY',
        quantity: Number(ticket.quantity || 0),
        price: Number(ticket.price || 0),
        trigger_price: Number(ticket.triggerPrice || 0),
      });

      const entry = createBlotterEntry(ticket, {
        referencePrice: Number(ticket.price || optionOverview?.spotPrice || stock.current_price || 0),
        liveExecutionEnabled: true,
        note: `Live order ${response.order_id || 'submitted'}${ticket.note ? ` | ${ticket.note}` : ''}`,
      });
      entry.state = 'Live sent';
      setBlotter((current) => [entry, ...current].slice(0, 30));
      setConfirmLiveOpen(false);
      setArmCode('');
      setExecutionGuard((current) => ({ ...current, armed: false }));
      toast.success(`Live Zerodha order sent. Order id ${response.order_id || '--'}.`);
      handleRefresh();
    } catch (error) {
      toast.error(error.message || 'Live order failed.');
    } finally {
      setPlacingLive(false);
    }
  };

  const handleRefresh = () => {
    setRefreshPulse((current) => current + 1);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(56,189,248,0.18),rgba(15,23,42,0.96)_50%,rgba(245,158,11,0.14))] p-6 shadow-[0_32px_90px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">Options and futures dealing workspace</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Trading Terminal</h1>
            <p className="mt-3 text-base leading-7 text-slate-100/90">
              Architecture-led F&O terminal modeled after serious execution desks: broker ingress, futures ladder, option structure,
              order-ticket workspace, risk gate, and blotter review in one dense screen.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Badge className={`rounded-full px-4 py-2 text-sm ${brokerConnected ? 'bg-emerald-400/15 text-emerald-100' : 'bg-white/10 text-slate-200'}`}>
              {brokerConnected ? 'Zerodha connected' : zerodhaStatus?.configured ? 'Broker ready to connect' : 'Broker config pending'}
            </Badge>
            <Badge className={`rounded-full px-4 py-2 text-sm ${getToneClasses(terminalBias.tone)}`}>
              {terminalBias.label}
            </Badge>
            <Button onClick={handleRefresh} variant="outline" className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
              {(statusFetching || boardFetching || optionFetching || futuresFetching) ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh deck
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.86fr_1.55fr_0.95fr]">
        <Section
          title="Market board"
          subtitle="Track the underlyings you trade most often."
          action={(
            <div className="w-full max-w-sm">
              <StockAutocompleteInput
                value={searchValue}
                onChange={setSearchValue}
                onSelect={handleTrackSymbol}
                placeholder="Add symbol to board"
              />
            </div>
          )}
        >
          <div className="space-y-3">
            {boardQuotes.map((row) => {
              const positive = Number(row.changePercent || 0) >= 0;
              return (
                <button
                  key={row.symbol}
                  type="button"
                  onClick={() => setSelectedSymbol(row.symbol)}
                  className={`w-full rounded-[22px] border px-4 py-3 text-left transition ${selectedSymbol === row.symbol ? 'border-cyan-300/35 bg-cyan-300/10' : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{row.symbol}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{row.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">{formatCurrency(row.price)}</p>
                      <p className={`mt-1 text-xs font-medium ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {positive ? '+' : ''}{Number(row.changePercent || 0).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>{row.sector}</span>
                    <span>{row.source}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        <div className="space-y-6">
          <Section
            title={`${selectedSymbol} execution matrix`}
            subtitle={terminalBias.note}
            action={(
              <div className="flex flex-wrap gap-2">
                <Badge className="rounded-full bg-white/10 text-slate-100">{activeExpiry}</Badge>
                <Badge className="rounded-full bg-cyan-300/15 text-cyan-100">{stock.name}</Badge>
              </div>
            )}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Stat label="Spot" value={formatCurrency(optionOverview?.spotPrice || stock.current_price || 0)} note="Underlying reference" tone="cyan" />
              <Stat label="PCR" value={optionSummary ? optionSummary.pcr.toFixed(2) : '--'} note="Put / call OI ratio" tone="slate" />
              <Stat label="Support" value={optionSummary?.supportStrike ? optionSummary.supportStrike.toLocaleString('en-IN') : '--'} note="Put OI base" tone="emerald" />
              <Stat label="Resistance" value={optionSummary?.resistanceStrike ? optionSummary.resistanceStrike.toLocaleString('en-IN') : '--'} note="Call OI cap" tone="rose" />
            </div>

            {(optionError || futuresError) ? (
              <div className="mt-4 rounded-[22px] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                {optionError?.message || futuresError?.message}
              </div>
            ) : null}

            {futuresBoard?.rows?.length ? (
              <div className="mt-5 rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">Futures ladder</p>
                    <p className="mt-1 text-sm text-slate-400">Front expiries for fast basis and carry checks.</p>
                  </div>
                  <Badge className="rounded-full bg-amber-300/15 text-amber-100">
                    Lot {futuresBoard.lotSize || '--'}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {futuresBoard.rows.map((row) => (
                    <div key={row.tradingsymbol} className="rounded-[20px] border border-white/8 bg-[#101925] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{row.expiry}</p>
                      <p className="mt-2 text-base font-semibold text-white">{row.tradingsymbol}</p>
                      <p className="mt-2 text-sm text-slate-300">LTP <span className="font-semibold text-white">{formatCurrency(row.lastPrice)}</span></p>
                      <p className="mt-1 text-sm text-slate-300">Basis <span className={`font-semibold ${row.basisPercent >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatPercent(row.basisPercent)}</span></p>
                      <p className="mt-1 text-sm text-slate-300">OI <span className="font-semibold text-cyan-300">{formatCompactCurrency(row.oi)}</span></p>
                      <Button
                        variant="outline"
                        onClick={() => handleQuickContract(row.tradingsymbol, 'FUTURES', row.lastPrice)}
                        className="mt-3 h-8 rounded-xl border-white/10 bg-white/5 text-xs text-white hover:bg-white/10"
                      >
                        Use in ticket
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {atmOptionRow ? (
              <div className="mt-5 rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">ATM quick contracts</p>
                    <p className="mt-1 text-sm text-slate-400">Pull the active ATM call or put directly into the ticket.</p>
                  </div>
                  <Badge className="rounded-full bg-cyan-300/15 text-cyan-100">
                    ATM {atmOptionRow.strike?.toLocaleString('en-IN')}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleQuickContract(atmOptionRow.call?.tradingsymbol, 'OPTIONS', atmOptionRow.call?.ltp)}
                    className="rounded-[20px] border border-white/8 bg-[#101925] px-4 py-3 text-left hover:bg-[#132032]"
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">ATM Call</p>
                    <p className="mt-2 text-sm font-semibold text-white">{atmOptionRow.call?.tradingsymbol || '--'}</p>
                    <p className="mt-1 text-sm text-slate-300">LTP {formatCurrency(Number(atmOptionRow.call?.ltp || 0))}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickContract(atmOptionRow.put?.tradingsymbol, 'OPTIONS', atmOptionRow.put?.ltp)}
                    className="rounded-[20px] border border-white/8 bg-[#101925] px-4 py-3 text-left hover:bg-[#132032]"
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-rose-300">ATM Put</p>
                    <p className="mt-2 text-sm font-semibold text-white">{atmOptionRow.put?.tradingsymbol || '--'}</p>
                    <p className="mt-1 text-sm text-slate-300">LTP {formatCurrency(Number(atmOptionRow.put?.ltp || 0))}</p>
                  </button>
                </div>
              </div>
            ) : null}
          </Section>

          <OptionChainPanel stock={stock} onContractAction={handleOptionChainAction} />
        </div>

        <div className="space-y-6">
          <Section title="Order ticket" subtitle="Paper-first ticket modeled for F&O desk usage.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Segment</span>
                <Select value={ticket.segment} onValueChange={(value) => setTicket((current) => ({ ...current, segment: value }))}>
                  <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-white/5 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPTIONS">OPTIONS</SelectItem>
                    <SelectItem value="FUTURES">FUTURES</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Side</span>
                <Select value={ticket.side} onValueChange={(value) => setTicket((current) => ({ ...current, side: value }))}>
                  <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-white/5 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">BUY</SelectItem>
                    <SelectItem value="SELL">SELL</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Order type</span>
                <Select value={ticket.orderType} onValueChange={(value) => setTicket((current) => ({ ...current, orderType: value }))}>
                  <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-white/5 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKET">MARKET</SelectItem>
                    <SelectItem value="LIMIT">LIMIT</SelectItem>
                    <SelectItem value="SL">SL</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Product</span>
                <Select value={ticket.product} onValueChange={(value) => setTicket((current) => ({ ...current, product: value }))}>
                  <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-white/5 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NRML">NRML</SelectItem>
                    <SelectItem value="MIS">MIS</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Contract symbol</span>
                <Input
                  value={ticket.contractSymbol}
                  onChange={(event) => setTicket((current) => ({ ...current, contractSymbol: event.target.value.toUpperCase() }))}
                  className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                  placeholder="Example: NIFTY25APR24500CE"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Quantity</span>
                <Input
                  type="number"
                  value={ticket.quantity}
                  onChange={(event) => setTicket((current) => ({ ...current, quantity: event.target.value }))}
                  className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Trigger price</span>
                <Input
                  type="number"
                  value={ticket.triggerPrice}
                  onChange={(event) => setTicket((current) => ({ ...current, triggerPrice: event.target.value }))}
                  className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-slate-300">Limit price</span>
                <Input
                  type="number"
                  value={ticket.price}
                  onChange={(event) => setTicket((current) => ({ ...current, price: event.target.value }))}
                  className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                />
              </label>
            </div>

            <label className="mt-3 block space-y-2">
              <span className="text-sm text-slate-300">Operator note</span>
              <Input
                value={ticket.note}
                onChange={(event) => setTicket((current) => ({ ...current, note: event.target.value }))}
                className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                placeholder="Example: short gamma scalp or expiry hedge"
              />
            </label>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <Stat label="Route state" value={executionModeLabel} note={brokerConnected ? 'Live routing requires arming and confirmation.' : 'Broker disconnected, paper flow only.'} tone={executionGuard.liveMode ? 'amber' : 'slate'} />
              <Stat label="Blotter count" value={String(blotterCount)} note="Saved locally for operator review" tone="slate" />
              <Stat label="Live guard" value={liveModeArmed ? 'Armed' : 'Locked'} note="Type LIVE and arm before sending." tone={liveModeArmed ? 'rose' : 'cyan'} />
            </div>

            <div className="mt-4 rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Live execution safety gate</p>
                  <p className="mt-1 text-sm text-slate-400">Keep paper mode as default. Live routing requires an explicit operator arm.</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setExecutionGuard((current) => ({ ...current, liveMode: !current.liveMode, armed: false }))}
                  className={`rounded-2xl border-white/10 ${executionGuard.liveMode ? 'bg-rose-400/15 text-rose-100 hover:bg-rose-400/20' : 'bg-white/5 text-white hover:bg-white/10'}`}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {executionGuard.liveMode ? 'Live mode on' : 'Paper mode'}
                </Button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                <Input
                  value={armCode}
                  onChange={(event) => setArmCode(event.target.value)}
                  className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                  placeholder="Type LIVE to arm order routing"
                />
                <Button
                  variant="outline"
                  onClick={() => setExecutionGuard((current) => ({ ...current, armed: current.liveMode && armCode.trim().toUpperCase() === 'LIVE' }))}
                  disabled={!executionGuard.liveMode}
                  className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-50"
                >
                  {executionGuard.armed ? 'Armed' : 'Arm live'}
                </Button>
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <Button onClick={handleSaveTicket} className="rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200">
                <Layers3 className="h-4 w-4" />
                Add to blotter
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmLiveOpen(true)}
                disabled={!brokerConnected || !executionGuard.liveMode || !ticket.contractSymbol}
                className="rounded-2xl border-rose-400/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowUpRight className="h-4 w-4" />
                Place live order
              </Button>
              <Button
                variant="outline"
                onClick={() => setTicket(createTicketDraft(selectedSymbol))}
                className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                Reset
              </Button>
            </div>
          </Section>

          <Section title="Risk and funding" subtitle="Available cash, premium usage, exposure, and operator alerts.">
            <div className="space-y-3">
              <Stat label="Available" value={formatCurrency(margins.availableForTrade || 0)} note="Tradable cash after debits and premium" tone="emerald" />
              <Stat label="Collateral" value={formatCurrency(margins.collateral || 0)} note="Collateral available for margin" tone="cyan" />
              <Stat label="Exposure" value={formatCurrency(margins.exposure || 0)} note="Used exposure / M2M proxy" tone="amber" />
              <Stat label="Open P&L" value={`${netPnl >= 0 ? '+' : '-'}${formatCompactCurrency(Math.abs(netPnl))}`} note={`${positions.length} open broker positions`} tone={netPnl >= 0 ? 'emerald' : 'rose'} />
            </div>
            {(marginsError || positionsError || ordersError) ? (
              <div className="mt-4 rounded-[22px] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                {marginsError?.message || positionsError?.message || ordersError?.message}
              </div>
            ) : null}
          </Section>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Section title="Open broker positions" subtitle="Flattened net/day positions from Zerodha for fast scanning.">
          {positions.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Symbol</th>
                    <th className="px-3 py-3">Product</th>
                    <th className="px-3 py-3">Qty</th>
                    <th className="px-3 py-3">Avg</th>
                    <th className="px-3 py-3">LTP</th>
                    <th className="px-3 py-3">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.slice(0, 12).map((row) => (
                    <tr key={row.key} className="border-t border-white/6 text-slate-300">
                      <td className="px-3 py-3 font-medium text-white">{row.symbol}</td>
                      <td className="px-3 py-3">{row.product}</td>
                      <td className="px-3 py-3">{row.quantity}</td>
                      <td className="px-3 py-3">{formatCurrency(row.avgPrice)}</td>
                      <td className="px-3 py-3">{formatCurrency(row.ltp)}</td>
                      <td className={`px-3 py-3 font-medium ${row.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {row.pnl >= 0 ? '+' : '-'}{formatCompactCurrency(Math.abs(row.pnl))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
              {brokerConnected ? 'No open positions are currently visible from the broker.' : 'Connect Zerodha to load live open positions.'}
            </div>
          )}
        </Section>

        <Section title="Blotter and live order history" subtitle="Manual terminal intents plus the latest broker order book.">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-white">Terminal blotter</p>
              {blotter.length ? (
                <div className="space-y-2">
                  {blotter.slice(0, 6).map((row) => (
                    <div key={row.id} className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-white">{formatTerminalOrder(row)}</p>
                        <div className="flex items-center gap-2">
                          <Badge className={`rounded-full ${row.state === 'Live-ready' ? 'bg-emerald-400/15 text-emerald-100' : 'bg-white/10 text-slate-100'}`}>
                            {row.state}
                          </Badge>
                          <Button
                            variant="ghost"
                            onClick={() => handleDeleteBlotterEntry(row.id)}
                            className="h-8 rounded-xl px-2 text-slate-300 hover:bg-white/10 hover:text-white"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">{formatDateTime(row.createdAt)} | {row.note || 'No operator note'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                  No terminal intents saved yet.
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-white">Broker order book</p>
              {orders.length ? (
                <div className="space-y-2">
                  {orders.slice(0, 6).map((row) => (
                    <div key={row.id} className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-white">{row.symbol} {row.side}</p>
                        <Badge className="rounded-full bg-white/10 text-slate-100">{row.status}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        {row.orderType} | {row.product} | Qty {row.quantity} | {formatDateTime(row.updatedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                  {brokerConnected ? 'No recent broker orders returned yet.' : 'Connect Zerodha to load live order history.'}
                </div>
              )}
            </div>
          </div>
        </Section>
      </div>

      <Section title="Terminal architecture" subtitle="Research-led operating model adapted to the current Zerodha-backed app.">
        <div className="grid gap-4 xl:grid-cols-4">
          {TERMINAL_LAYOUTS.map((item, index) => (
            <div key={item.title} className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Layer {index + 1}</p>
              <h3 className="mt-2 text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{item.subtitle}</p>
              <div className="mt-4 space-y-2 text-sm text-slate-300">
                {item.points.map((point) => (
                  <p key={point}>- {point}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-sm text-slate-400">
          <a className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 hover:bg-white/[0.06] hover:text-white" href="https://kite.trade/docs/connect/v3/" target="_blank" rel="noreferrer">
            Zerodha Kite Connect docs
          </a>
          <a className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 hover:bg-white/[0.06] hover:text-white" href="https://aws.amazon.com/event-driven-architecture/" target="_blank" rel="noreferrer">
            Event-driven architecture reference
          </a>
        </div>
      </Section>

      <AlertDialog open={confirmLiveOpen} onOpenChange={setConfirmLiveOpen}>
        <AlertDialogContent className="border-white/10 bg-[#0c1422] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Send live Zerodha order?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will submit a real broker order for {ticket.contractSymbol || ticket.symbol}. Make sure quantity, product, and price are correct.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-300">
            <p>{ticket.side} {ticket.quantity} {ticket.contractSymbol || ticket.symbol}</p>
            <p className="mt-2">{ticket.orderType} | {ticket.product} | {ticket.exchange}</p>
            <p className="mt-2">Price {ticket.orderType === 'MARKET' ? 'MARKET' : formatCurrency(Number(ticket.price || 0))}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-white/5 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => {
              event.preventDefault();
              void handlePlaceLiveOrder();
            }} className="bg-rose-400 text-slate-950 hover:bg-rose-300">
              {placingLive ? 'Sending...' : 'Send live order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
