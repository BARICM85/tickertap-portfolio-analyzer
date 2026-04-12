import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Bot,
  BookOpen,
  CheckCircle2,
  Gauge,
  Layers3,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
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
  buildDeltaAssistant,
  flattenBrokerOrders,
  flattenBrokerPositions,
  formatTerminalOrder,
  getToneClasses,
  readAutomationSettings,
  readExecutionGuard,
  readTerminalBlotter,
  readTrackedSymbols,
  SEMI_AUTO_BUILD_STEPS,
  summarizeMargins,
  TERMINAL_README_SECTIONS,
  writeAutomationSettings,
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

function getStepBadgeClasses(status = 'planned') {
  return {
    active: 'bg-emerald-400/15 text-emerald-100 border-emerald-400/20',
    planned: 'bg-cyan-300/12 text-cyan-100 border-cyan-300/20',
    later: 'bg-white/8 text-slate-300 border-white/10',
  }[status] || 'bg-white/8 text-slate-300 border-white/10';
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function TradingTerminal() {
  const [trackedSymbols, setTrackedSymbols] = useState(() => readTrackedSymbols());
  const [selectedSymbol, setSelectedSymbol] = useState(() => readTrackedSymbols()[0] || 'NIFTY');
  const [blotter, setBlotter] = useState(() => readTerminalBlotter());
  const [executionGuard, setExecutionGuard] = useState(() => readExecutionGuard());
  const [automationSettings, setAutomationSettings] = useState(() => readAutomationSettings());
  const [ticket, setTicket] = useState(() => createTicketDraft(readTrackedSymbols()[0] || 'NIFTY'));
  const [searchValue, setSearchValue] = useState('');
  const [armCode, setArmCode] = useState('');
  const [refreshPulse, setRefreshPulse] = useState(0);
  const [confirmLiveOpen, setConfirmLiveOpen] = useState(false);
  const [placingLive, setPlacingLive] = useState(false);
  const [ticketPosition, setTicketPosition] = useState({ x: 0, y: 24 });
  const [ticketInitialized, setTicketInitialized] = useState(false);
  const [ticketDragging, setTicketDragging] = useState(false);
  const terminalCanvasRef = useRef(null);
  const ticketPanelRef = useRef(null);
  const dragStateRef = useRef(null);

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
    writeAutomationSettings(automationSettings);
  }, [automationSettings]);

  useEffect(() => {
    setTicket((current) => ({ ...current, symbol: selectedSymbol }));
  }, [selectedSymbol]);

  useEffect(() => {
    const syncFloatingTicket = () => {
      const canvas = terminalCanvasRef.current;
      const panel = ticketPanelRef.current;
      if (!canvas || !panel || typeof window === 'undefined') return;
      if (window.innerWidth < 1280) return;

      const canvasWidth = canvas.clientWidth;
      const panelWidth = panel.offsetWidth || 336;
      const panelHeight = panel.offsetHeight || 0;
      const maxX = Math.max(16, canvasWidth - panelWidth - 16);
      const maxY = Math.max(24, canvas.scrollHeight - panelHeight - 16);

      setTicketPosition((current) => {
        if (!ticketInitialized) {
          return { x: maxX, y: 24 };
        }

        return {
          x: clamp(current.x, 16, maxX),
          y: clamp(current.y, 24, maxY),
        };
      });

      if (!ticketInitialized) {
        setTicketInitialized(true);
      }
    };

    syncFloatingTicket();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', syncFloatingTicket);
      return () => window.removeEventListener('resize', syncFloatingTicket);
    }
    return undefined;
  }, [ticketInitialized, optionOverview?.rows?.length, futuresBoard?.rows?.length, positions.length]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      const canvas = terminalCanvasRef.current;
      const panel = ticketPanelRef.current;
      if (!dragState || !canvas || !panel) return;

      const nextX = event.clientX - dragState.offsetX;
      const nextY = event.clientY - dragState.offsetY;
      const maxX = Math.max(16, canvas.clientWidth - panel.offsetWidth - 16);
      const maxY = Math.max(24, canvas.scrollHeight - panel.offsetHeight - 16);

      setTicketPosition({
        x: clamp(nextX, 16, maxX),
        y: clamp(nextY, 24, maxY),
      });
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      setTicketDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

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
  const deltaAssistant = useMemo(() => buildDeltaAssistant({
    selectedSymbol,
    spotPrice: Number(optionOverview?.spotPrice || stock.current_price || 0),
    positions,
    optionRows: optionOverview?.rows || [],
    futuresRows: futuresBoard?.rows || [],
    optionLotSize: Number(optionOverview?.lotSize || futuresBoard?.lotSize || 1),
    thresholds: automationSettings,
  }), [
    automationSettings,
    futuresBoard?.lotSize,
    futuresBoard?.rows,
    optionOverview?.lotSize,
    optionOverview?.rows,
    optionOverview?.spotPrice,
    positions,
    selectedSymbol,
    stock.current_price,
  ]);
  const triggerReady = deltaAssistant.monitoringState === 'threshold-breach' && Boolean(deltaAssistant.hedgeSuggestion);
  const cooldownActive = useMemo(() => {
    if (!automationSettings.lastTriggeredAt) return false;
    const elapsedMs = Date.now() - new Date(automationSettings.lastTriggeredAt).getTime();
    return elapsedMs < Number(automationSettings.triggerCooldownMinutes || 15) * 60 * 1000;
  }, [automationSettings.lastTriggeredAt, automationSettings.triggerCooldownMinutes]);

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

  const handleStartTicketDrag = (event) => {
    if (typeof window === 'undefined' || window.innerWidth < 1280) return;
    const panel = ticketPanelRef.current;
    if (!panel) return;

    const panelRect = panel.getBoundingClientRect();
    dragStateRef.current = {
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
    };
    setTicketDragging(true);
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

  const handlePrepareHedge = (suggestion = deltaAssistant.hedgeSuggestion, options = {}) => {
    if (!suggestion?.contract?.contractSymbol) {
      toast.error('No hedge contract is ready yet.');
      return;
    }

    const preparedTicket = {
      ...ticket,
      symbol: suggestion.contract.symbol || selectedSymbol,
      segment: suggestion.contract.segment || 'OPTIONS',
      exchange: suggestion.contract.exchange || 'NFO',
      side: suggestion.contract.action || 'BUY',
      contractSymbol: suggestion.contract.contractSymbol,
      quantity: String(suggestion.contract.quantity || suggestion.contract.lotSize || 1),
      price: suggestion.contract.price ? String(suggestion.contract.price) : '',
      note: options.note || `Prepared hedge | ${suggestion.summary}`,
    };

    setTicket(preparedTicket);

    if (options.queuePaper && !executionGuard.liveMode) {
      const entry = createBlotterEntry(preparedTicket, {
        referencePrice: Number(suggestion.contract.price || 0),
        liveExecutionEnabled: false,
        note: options.note || `Semi-auto trigger | ${suggestion.summary}`,
      });
      entry.state = 'Trigger-prepared';
      setBlotter((current) => [entry, ...current].slice(0, 30));
      toast.success(`${formatTerminalOrder(entry)} queued from hedge trigger.`);
      return;
    }

    toast.success('Suggested hedge loaded into the order ticket.');
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

  useEffect(() => {
    if (!automationSettings.autoMonitoring || !automationSettings.semiAutoTrigger) return;
    if (!triggerReady || cooldownActive) return;
    if (!deltaAssistant.hedgeSuggestion?.key) return;
    if (automationSettings.lastTriggeredSignature === deltaAssistant.hedgeSuggestion.key) return;

    const nextStamp = new Date().toISOString();
    setAutomationSettings((current) => ({
      ...current,
      lastTriggeredAt: nextStamp,
      lastTriggeredSignature: deltaAssistant.hedgeSuggestion.key,
    }));

    if (!executionGuard.liveMode && automationSettings.autoPreparePaperTrades) {
      handlePrepareHedge(deltaAssistant.hedgeSuggestion, {
        queuePaper: true,
        note: `Auto-monitor breach | ${deltaAssistant.breachReasons[0] || 'Threshold exceeded'}`,
      });
      return;
    }

    handlePrepareHedge(deltaAssistant.hedgeSuggestion, {
      note: `Review trigger | ${deltaAssistant.breachReasons[0] || 'Threshold exceeded'}`,
    });
    toast.warning('Semi-auto trigger prepared the next hedge in the ticket. Review before routing.');
  }, [
    automationSettings.autoMonitoring,
    automationSettings.autoPreparePaperTrades,
    automationSettings.lastTriggeredSignature,
    automationSettings.semiAutoTrigger,
    cooldownActive,
    deltaAssistant.breachReasons,
    deltaAssistant.hedgeSuggestion,
    executionGuard.liveMode,
    triggerReady,
  ]);

  const renderOrderTicket = (floating = false) => (
    <Section
      title="Order ticket"
      subtitle="Paper-first ticket modeled for F&O desk usage."
      className={floating ? 'h-full' : ''}
      action={floating ? (
        <button
          type="button"
          onPointerDown={handleStartTicketDrag}
          className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${ticketDragging ? 'border-cyan-300/40 bg-cyan-300/12 text-cyan-100' : 'border-white/10 bg-white/[0.04] text-slate-300'}`}
        >
          Drag ticket
        </button>
      ) : null}
    >
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

      <div className="mt-4 flex flex-wrap gap-3">
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
  );

  return (
    <div className="space-y-6 rounded-[40px] border border-[#1a2633] bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.08),transparent_18%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.08),transparent_22%),linear-gradient(180deg,#07111a_0%,#091520_52%,#0b1822_100%)] p-4 text-white shadow-[0_32px_90px_rgba(0,0,0,0.18)] md:p-6">
      <section className="rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(56,189,248,0.18),rgba(15,23,42,0.96)_50%,rgba(245,158,11,0.14))] p-6 shadow-[0_32px_90px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">Semi-automatic delta desk</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Trading Terminal</h1>
            <p className="mt-3 text-base leading-7 text-slate-100/90">
              One terminal only: broker-backed F&O structure, paper-first execution, and a learning path toward a proper semi-automatic delta-hedging desk without duplicating tools elsewhere in the app.
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Stat label="Phase" value="Semi-auto" note="Human confirms every live hedge" tone="cyan" />
        <Stat label="Broker" value={brokerConnected ? 'Connected' : 'Standby'} note="Paid Zerodha backend route" tone={brokerConnected ? 'emerald' : 'slate'} />
        <Stat label="Chain" value={optionOverview?.rows?.length ? 'Live structure' : 'Pending'} note={optionError?.message || 'Option chain readiness'} tone={optionOverview?.rows?.length ? 'emerald' : 'amber'} />
        <Stat label="Positions" value={positions.length ? `${positions.length} open` : 'No live positions'} note="Needed later for net greek monitor" tone="slate" />
        <Stat label="Execution" value={executionGuard.liveMode ? 'Live mode selected' : 'Paper mode'} note="Chain Buy / Sell follows this mode" tone={executionGuard.liveMode ? 'amber' : 'slate'} />
      </div>

      <div ref={terminalCanvasRef} className="grid gap-6 xl:grid-cols-[0.86fr_2.14fr]">
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

        <div className="space-y-6 xl:relative xl:pr-[22rem]">
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
          <div className="xl:hidden">
            {renderOrderTicket(false)}
          </div>
          <div
            ref={ticketPanelRef}
            className="hidden xl:block xl:absolute xl:z-30"
            style={{ left: `${ticketPosition.x}px`, top: `${ticketPosition.y}px`, width: '20.5rem' }}
          >
            {renderOrderTicket(true)}
          </div>
        </div>

        <div className="space-y-6">
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
        <Section
          title="Delta hedge assistant"
          subtitle="Phase 2: net delta, hedge suggestions, one-click preparation, and threshold-aware review."
          action={(
            <Badge className={`rounded-full ${triggerReady ? 'bg-rose-400/15 text-rose-100' : 'bg-emerald-400/15 text-emerald-100'}`}>
              <Gauge className="mr-2 inline h-4 w-4" />
              {triggerReady ? 'Threshold breach' : 'Within range'}
            </Badge>
          )}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Stat label="Net delta" value={deltaAssistant.netDelta.toFixed(0)} note={`Lot equivalent ${deltaAssistant.lotEquivalent.toFixed(2)}`} tone={Math.abs(deltaAssistant.netDelta) > Number(automationSettings.maxNetDelta || 0) ? 'rose' : 'emerald'} />
            <Stat label="Net gamma" value={deltaAssistant.netGamma.toFixed(2)} note={`Limit ${Number(automationSettings.maxAbsGamma || 0).toFixed(2)}`} tone={Math.abs(deltaAssistant.netGamma) > Number(automationSettings.maxAbsGamma || 0) ? 'rose' : 'slate'} />
            <Stat label="Net theta" value={deltaAssistant.netTheta.toFixed(2)} note="Time-decay contribution" tone="amber" />
            <Stat label="Net vega" value={deltaAssistant.netVega.toFixed(2)} note="Volatility sensitivity" tone="cyan" />
          </div>

          {deltaAssistant.breachReasons.length ? (
            <div className="mt-4 rounded-[22px] border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
              <p className="font-medium text-white">Active risk breaches</p>
              <div className="mt-3 space-y-2">
                {deltaAssistant.breachReasons.map((reason) => (
                  <p key={reason}>- {reason}</p>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-[22px] border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
              Net exposure is inside the current phase-2 thresholds.
            </div>
          )}

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Hedge suggestion</p>
                  <p className="mt-1 text-sm text-slate-400">Semi-auto recommendation based on current net delta.</p>
                </div>
                <Sparkles className="h-5 w-5 text-cyan-300" />
              </div>

              {deltaAssistant.hedgeSuggestion ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-[18px] border border-white/8 bg-[#101925] p-4">
                    <p className="text-sm font-medium text-white">{deltaAssistant.hedgeSuggestion.summary}</p>
                    <p className="mt-2 text-sm text-slate-300">{deltaAssistant.hedgeSuggestion.rationale}</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <p className="text-sm text-slate-300">Before <span className="font-semibold text-rose-200">{deltaAssistant.hedgeSuggestion.beforeDelta.toFixed(0)}</span></p>
                      <p className="text-sm text-slate-300">After <span className="font-semibold text-emerald-200">{deltaAssistant.hedgeSuggestion.estimatedAfterDelta.toFixed(0)}</span></p>
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">Suggested contract</p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {deltaAssistant.hedgeSuggestion.contract.action} {deltaAssistant.hedgeSuggestion.contract.quantity} {deltaAssistant.hedgeSuggestion.contract.contractSymbol}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => handlePrepareHedge(deltaAssistant.hedgeSuggestion)}
                      className="rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                    >
                      <Target className="h-4 w-4" />
                      Prepare hedge
                    </Button>
                    {!executionGuard.liveMode ? (
                      <Button
                        variant="outline"
                        onClick={() => handlePrepareHedge(deltaAssistant.hedgeSuggestion, { queuePaper: true })}
                        className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10"
                      >
                        <Layers3 className="h-4 w-4" />
                        Queue paper hedge
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                  No hedge suggestion yet. Connect broker positions and live structure for the selected underlying.
                </div>
              )}
            </div>

            <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Position intelligence</p>
                  <p className="mt-1 text-sm text-slate-400">Approximate delta contributions from the current broker structure.</p>
                </div>
                <Radar className="h-5 w-5 text-amber-300" />
              </div>

              {deltaAssistant.positions.length ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Contract</th>
                        <th className="px-3 py-3">Qty</th>
                        <th className="px-3 py-3">Delta</th>
                        <th className="px-3 py-3">Gamma</th>
                        <th className="px-3 py-3">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deltaAssistant.positions.slice(0, 8).map((row) => (
                        <tr key={row.key} className="border-t border-white/6 text-slate-300">
                          <td className="px-3 py-3 font-medium text-white">{row.symbol}</td>
                          <td className="px-3 py-3">{row.quantity}</td>
                          <td className={`px-3 py-3 font-medium ${Number(row.delta || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{Number(row.delta || 0).toFixed(0)}</td>
                          <td className="px-3 py-3 text-cyan-300">{Number(row.gamma || 0).toFixed(2)}</td>
                          <td className="px-3 py-3 text-xs uppercase tracking-[0.16em] text-slate-500">{row.pricingSource}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                  Broker positions for this underlying have not been matched yet.
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section
          title="Controlled automation"
          subtitle="Phase 3: auto-monitoring, semi-auto hedge triggers, and paper-first automation gates."
          action={(
            <Badge className={`rounded-full ${automationSettings.autoMonitoring ? 'bg-cyan-300/15 text-cyan-100' : 'bg-white/10 text-slate-100'}`}>
              <Bot className="mr-2 inline h-4 w-4" />
              {automationSettings.autoMonitoring ? 'Monitoring on' : 'Monitoring off'}
            </Badge>
          )}
        >
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Max net delta</span>
                  <Input
                    type="number"
                    value={automationSettings.maxNetDelta}
                    onChange={(event) => setAutomationSettings((current) => ({ ...current, maxNetDelta: Number(event.target.value || 0) }))}
                    className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Max abs gamma</span>
                  <Input
                    type="number"
                    step="0.1"
                    value={automationSettings.maxAbsGamma}
                    onChange={(event) => setAutomationSettings((current) => ({ ...current, maxAbsGamma: Number(event.target.value || 0) }))}
                    className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Max open loss</span>
                  <Input
                    type="number"
                    value={automationSettings.maxOpenLoss}
                    onChange={(event) => setAutomationSettings((current) => ({ ...current, maxOpenLoss: Number(event.target.value || 0) }))}
                    className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Trigger cooldown (min)</span>
                  <Input
                    type="number"
                    value={automationSettings.triggerCooldownMinutes}
                    onChange={(event) => setAutomationSettings((current) => ({ ...current, triggerCooldownMinutes: Number(event.target.value || 1) }))}
                    className="h-11 rounded-2xl border-white/10 bg-white/5 text-white"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Button
                  variant="outline"
                  onClick={() => setAutomationSettings((current) => ({ ...current, autoMonitoring: !current.autoMonitoring }))}
                  className={`rounded-2xl border-white/10 ${automationSettings.autoMonitoring ? 'bg-cyan-300/15 text-cyan-100 hover:bg-cyan-300/20' : 'bg-white/5 text-white hover:bg-white/10'}`}
                >
                  {automationSettings.autoMonitoring ? 'Auto-monitoring on' : 'Auto-monitoring off'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setAutomationSettings((current) => ({ ...current, semiAutoTrigger: !current.semiAutoTrigger }))}
                  className={`rounded-2xl border-white/10 ${automationSettings.semiAutoTrigger ? 'bg-amber-300/15 text-amber-100 hover:bg-amber-300/20' : 'bg-white/5 text-white hover:bg-white/10'}`}
                >
                  {automationSettings.semiAutoTrigger ? 'Triggers armed' : 'Triggers paused'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setAutomationSettings((current) => ({ ...current, autoPreparePaperTrades: !current.autoPreparePaperTrades }))}
                  className={`rounded-2xl border-white/10 ${automationSettings.autoPreparePaperTrades ? 'bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/20' : 'bg-white/5 text-white hover:bg-white/10'}`}
                >
                  {automationSettings.autoPreparePaperTrades ? 'Paper prep on' : 'Paper prep off'}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-[22px] border border-white/8 bg-[#101925] p-4">
                <p className="text-sm font-semibold text-white">Automation state</p>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  <p>- Monitoring: {automationSettings.autoMonitoring ? 'watching thresholds continuously' : 'manual checks only'}</p>
                  <p>- Trigger action: {automationSettings.semiAutoTrigger ? 'prepare next hedge when breached' : 'alert only'}</p>
                  <p>- Live behavior: never auto-send; operator still confirms every live order.</p>
                  <p>- Last trigger: {automationSettings.lastTriggeredAt ? formatDateTime(automationSettings.lastTriggeredAt) : '--'}</p>
                </div>
              </div>

              <div className={`rounded-[22px] border p-4 ${triggerReady ? 'border-amber-300/20 bg-amber-300/10 text-amber-100' : 'border-white/8 bg-white/[0.03] text-slate-300'}`}>
                <p className="text-sm font-semibold text-white">Semi-auto trigger status</p>
                <p className="mt-2 text-sm">
                  {triggerReady
                    ? cooldownActive
                      ? 'A threshold breach is active, but the trigger is in cooldown to avoid duplicate staging.'
                      : 'Threshold breach detected. The desk is ready to prepare the next hedge.'
                    : 'No threshold breach is active right now.'}
                </p>
                {triggerReady ? (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      onClick={() => handlePrepareHedge(deltaAssistant.hedgeSuggestion, {
                        queuePaper: !executionGuard.liveMode,
                        note: `Manual trigger | ${deltaAssistant.breachReasons[0] || 'Threshold exceeded'}`,
                      })}
                      className="rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200"
                    >
                      <Target className="h-4 w-4" />
                      Run trigger now
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setAutomationSettings((current) => ({ ...current, lastTriggeredAt: null, lastTriggeredSignature: '' }))}
                      className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10"
                    >
                      Reset cooldown
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </Section>
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

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Section
          title="Semi-auto Build Steps"
          subtitle="Recommended build order from scope lock through controlled automation."
          action={(
            <Badge className="rounded-full bg-white/10 text-slate-100">
              11 steps
            </Badge>
          )}
        >
          <div className="grid gap-4 xl:grid-cols-2">
            {SEMI_AUTO_BUILD_STEPS.map((item) => (
              <div key={item.step} className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Step {item.step}</p>
                    <h3 className="mt-2 text-base font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm text-slate-400">{item.subtitle}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] ${getStepBadgeClasses(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                <div className="mt-4 space-y-2 text-sm text-slate-300">
                  {item.points.map((point) => (
                    <p key={point}>- {point}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Terminal README"
          subtitle="Learning notes inside the terminal while we build the semi-automatic hedge desk."
          action={(
            <div className="rounded-full bg-amber-300/15 px-3 py-2 text-xs text-amber-100">
              <BookOpen className="mr-2 inline h-4 w-4" />
              Learn here
            </div>
          )}
        >
          <div className="space-y-3">
            {TERMINAL_README_SECTIONS.map((section) => (
              <div key={section.title} className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-cyan-300" />
                  <div>
                    <p className="text-sm font-semibold text-white">{section.title}</p>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{section.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[22px] border border-white/8 bg-[#101925] p-4 text-sm text-slate-300">
            Current operator workflow:
            <div className="mt-3 space-y-2">
              <p>1. Track the underlying on the market board and refresh structure.</p>
              <p>2. Use futures ladder or option chain Buy / Sell to load the ticket.</p>
              <p>3. Paper mode sends directly to blotter; live mode requires arming and final confirmation.</p>
              <p>4. Review positions, blotter, and order book before the next hedge or adjustment.</p>
            </div>
          </div>
        </Section>
      </div>

      <Section title="Reference Links" subtitle="Docs and references that guide the terminal build direction.">
        <div className="grid gap-4 xl:grid-cols-3">
          {[
            {
              title: 'Zerodha Kite Connect',
              text: 'Broker auth, orders, positions, quotes, instruments, and WebSocket base for the desk.',
              href: 'https://kite.trade/docs/connect/v3/',
            },
            {
              title: 'Greeksoft API Page',
              text: 'Reference point for the execution and strategy workflow we are approximating.',
              href: 'https://greeksoft.co.in/api_document.html',
            },
            {
              title: 'Executive Summary',
              text: 'Project direction: semi-auto delta desk first, then greeks engine, then hedge suggestions.',
              href: null,
            },
          ].map((item) => (
            <div key={item.title} className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-base font-semibold text-white">{item.title}</p>
              <p className="mt-2 text-sm leading-7 text-slate-400">{item.text}</p>
              {item.href ? (
                <a className="mt-4 inline-flex rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white" href={item.href} target="_blank" rel="noreferrer">
                  Open reference
                </a>
              ) : null}
            </div>
          ))}
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
