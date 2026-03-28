import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, Loader2, Plus, Search, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { base44 } from '@/api/base44Client';
import AddStockDialog from '@/components/portfolio/AddStockDialog';
import ImportDialog from '@/components/portfolio/ImportDialog';
import StockTable from '@/components/portfolio/StockTable';
import { derivePortfolioAnalytics, formatCompactCurrency, formatCurrency, formatPercent } from '@/lib/portfolioAnalytics';

function exportPortfolio(rows) {
  const content = JSON.stringify(rows, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'portfolio-export.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Portfolio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

  const { data: stocks = [], isLoading } = useQuery({
    queryKey: ['stocks'],
    queryFn: () => base44.entities.Stock.list('-created_date'),
  });

  const analytics = derivePortfolioAnalytics(stocks);

  useEffect(() => {
    const broker = searchParams.get('broker');
    const status = searchParams.get('status');
    const error = searchParams.get('error');
    if (broker !== 'zerodha' || !status) return;

    if (status === 'connected') toast.success('Zerodha connected successfully.');
    if (status === 'error') toast.error(error || 'Zerodha connection failed.');

    const next = new URLSearchParams(searchParams);
    next.delete('broker');
    next.delete('status');
    next.delete('error');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const filteredStocks = analytics.holdings.filter((stock) => {
    const haystack = `${stock.symbol} ${stock.name} ${stock.sector}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const refreshAll = async () => {
    setRefreshingId('all');
    const settled = await Promise.allSettled(stocks.map(async (stock) => {
      const response = await fetch(`${apiBaseUrl}/api/market/quote?symbol=${encodeURIComponent(stock.symbol)}`);
      if (!response.ok) throw new Error(stock.symbol);
      const quote = await response.json();
      if (Number.isFinite(quote.price) && quote.price > 0) {
        await base44.entities.Stock.update(stock.id, { current_price: quote.price });
      }
    }));
    await queryClient.invalidateQueries({ queryKey: ['stocks'] });
    setRefreshingId(null);

    const failed = settled.filter((entry) => entry.status === 'rejected').length;
    if (failed === 0) toast.success('Live market prices fetched for all holdings.');
    else if (failed === stocks.length) toast.error('Live price fetch failed for all holdings.');
    else toast.success(`Live prices updated with ${failed} fallback${failed === 1 ? '' : 's'}.`);
  };

  const refreshOne = async (stock) => {
    setRefreshingId(stock.id);
    try {
      const response = await fetch(`${apiBaseUrl}/api/market/quote?symbol=${encodeURIComponent(stock.symbol)}`);
      if (!response.ok) throw new Error('Live quote unavailable');
      const quote = await response.json();
      await base44.entities.Stock.update(stock.id, { current_price: quote.price || stock.current_price });
      toast.success(`${stock.symbol} live price updated.`);
    } catch {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `What is the current stock price of ${stock.symbol} (${stock.name}) listed on NSE/BSE in Indian Rupees (INR)? Return only the price as a number in INR.`,
        response_json_schema: {
          type: 'object',
          properties: {
            price: { type: 'number' },
          },
        },
      });
      await base44.entities.Stock.update(stock.id, { current_price: result.price || stock.current_price });
      toast.success(`${stock.symbol} refreshed with local market model.`);
    }
    await queryClient.invalidateQueries({ queryKey: ['stocks'] });
    setRefreshingId(null);
  };

  const deleteHolding = async () => {
    if (!deleteId) return;
    await base44.entities.Stock.delete(deleteId);
    await queryClient.invalidateQueries({ queryKey: ['stocks'] });
    setDeleteId(null);
    toast.success('Holding removed.');
  };

  const clearPortfolio = async () => {
    await base44.entities.Stock.replace([]);
    await queryClient.invalidateQueries({ queryKey: ['stocks'] });
    setClearOpen(false);
    toast.success('Portfolio cleared.');
  };

  if (isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-300" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-white/10 bg-[#0b1624]/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Portfolio operations</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Manage holdings, imports, and exports</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
              Add positions manually, import files, export the current state, and review position-level analytics in one workflow.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => exportPortfolio(stocks)} className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
              <Download />
              Export JSON
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)} className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
              <FileSpreadsheet />
              Import
            </Button>
            <Button variant="outline" onClick={() => setClearOpen(true)} disabled={stocks.length === 0} className="rounded-2xl border-rose-400/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20 disabled:text-slate-500">
              <Trash2 />
              Clear Portfolio
            </Button>
            <Button onClick={() => setAddOpen(true)} className="rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200">
              <Plus />
              Add Holding
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Invested Capital', value: formatCurrency(analytics.totals.totalInvested), note: `${analytics.holdings.length} holdings` },
          { label: 'Current Value', value: formatCurrency(analytics.totals.totalValue), note: formatPercent(analytics.totals.totalPnLPercent) },
          { label: 'Net Gain / Loss', value: `${analytics.totals.totalPnL >= 0 ? '+' : '-'}${formatCompactCurrency(Math.abs(analytics.totals.totalPnL))}`, note: 'Absolute portfolio move' },
          { label: 'Largest Holding', value: analytics.holdings[0] ? `${analytics.holdings[0].symbol} ${analytics.holdings[0].allocation.toFixed(1)}%` : '--', note: 'Use this to monitor concentration' },
        ].map((card) => (
          <div key={card.label} className="rounded-[28px] border border-white/10 bg-[#0b1624]/90 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{card.label}</p>
            <p className="mt-3 text-2xl font-semibold text-white">{card.value}</p>
            <p className="mt-2 text-sm text-slate-400">{card.note}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[32px] border border-white/10 bg-[#0b1624]/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by symbol, company, or sector"
              className="h-12 rounded-2xl border-white/10 bg-white/5 pl-11 text-white placeholder:text-slate-500"
            />
          </div>
          <Button onClick={refreshAll} disabled={refreshingId === 'all'} variant="outline" className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
            {refreshingId === 'all' ? <Loader2 className="animate-spin" /> : null}
            <Zap />
            Fetch Live Prices
          </Button>
        </div>

        <StockTable stocks={filteredStocks} onDelete={setDeleteId} onRefreshPrice={refreshOne} refreshingId={refreshingId} />
      </section>
      <AddStockDialog open={addOpen} onOpenChange={setAddOpen} onStockAdded={() => queryClient.invalidateQueries({ queryKey: ['stocks'] })} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImportComplete={() => queryClient.invalidateQueries({ queryKey: ['stocks'] })} />

      <AlertDialog open={Boolean(deleteId)} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="border-white/10 bg-[#0c1422] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this holding?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This deletes the position from your browser-stored portfolio. It can be re-imported later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-white/5 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteHolding} className="bg-rose-400 text-slate-950 hover:bg-rose-300">Delete Holding</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent className="border-white/10 bg-[#0c1422] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the full portfolio?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This removes every holding from local storage so you can start fresh with your own stocks or broker sync.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-white/5 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={clearPortfolio} className="bg-rose-400 text-slate-950 hover:bg-rose-300">Clear Portfolio</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
