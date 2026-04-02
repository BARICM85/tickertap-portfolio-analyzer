import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Loader2, Plus, Search, Target, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import StockAutocompleteInput from '@/components/shared/StockAutocompleteInput';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { derivePortfolioAnalytics, deriveWatchlistAnalytics, formatCurrency, formatPercent } from '@/lib/portfolioAnalytics';

const INITIAL_FORM = { symbol: '', name: '', target_price: '', notes: '' };

export default function WatchlistPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [addOpen, setAddOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [renameName, setRenameName] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const queryClient = useQueryClient();

  const { data: watchlist = [] } = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => base44.entities.Watchlist.list('-created_date'),
  });
  const { data: stocks = [] } = useQuery({
    queryKey: ['stocks'],
    queryFn: () => base44.entities.Stock.list('-created_date'),
  });
  const { data: collections = [] } = useQuery({
    queryKey: ['watchlist-collections'],
    queryFn: () => base44.entities.WatchlistCollection.list('-created_date'),
  });

  useEffect(() => {
    if (!collections.length) return;
    const exists = collections.some((item) => item.id === selectedListId);
    if (!selectedListId || !exists) setSelectedListId(collections[0].id);
  }, [collections, selectedListId]);

  const currentCollection = collections.find((item) => item.id === selectedListId) || null;
  const scopedWatchlist = useMemo(
    () => watchlist.filter((item) => item.list_id === selectedListId),
    [selectedListId, watchlist],
  );

  const holdings = derivePortfolioAnalytics(stocks);
  const items = deriveWatchlistAnalytics(scopedWatchlist, holdings.holdings);

  const lookup = async () => {
    if (!form.symbol.trim()) return;
    setIsSearching(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `What is the company name and current stock price in INR for Indian stock ticker "${form.symbol.toUpperCase()}" listed on NSE/BSE?`,
      response_json_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          price: { type: 'number' },
        },
      },
    });
    setForm((current) => ({
      ...current,
      symbol: current.symbol.toUpperCase(),
      name: result.name || current.name,
      target_price: current.target_price || String(result.price || ''),
    }));
    setIsSearching(false);
  };

  const save = async () => {
    if (!form.symbol || !form.name || !selectedListId) {
      toast.error('Symbol and company name are required.');
      return;
    }
    setIsSaving(true);
    await base44.entities.Watchlist.create({
      symbol: form.symbol.toUpperCase(),
      name: form.name,
      target_price: Number(form.target_price || 0),
      notes: form.notes || undefined,
      list_id: selectedListId,
    });
    setIsSaving(false);
    setForm(INITIAL_FORM);
    setAddOpen(false);
    await queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    toast.success('Added to watchlist.');
  };

  const createCollection = async () => {
    const name = collectionName.trim();
    if (!name) {
      toast.error('Watchlist name is required.');
      return;
    }

    const created = await base44.entities.WatchlistCollection.create({ name });
    await queryClient.invalidateQueries({ queryKey: ['watchlist-collections'] });
    setSelectedListId(created.id);
    setCollectionName('');
    setCollectionOpen(false);
    toast.success('New watchlist created.');
  };

  const renameCollection = async () => {
    if (!currentCollection) return;
    const name = renameName.trim();
    if (!name) {
      toast.error('Watchlist name is required.');
      return;
    }
    await base44.entities.WatchlistCollection.update(currentCollection.id, { name });
    await queryClient.invalidateQueries({ queryKey: ['watchlist-collections'] });
    setRenameOpen(false);
    toast.success('Watchlist renamed.');
  };

  const remove = async (id) => {
    await base44.entities.Watchlist.delete(id);
    await queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    toast.success('Removed from watchlist.');
  };

  const moveToPortfolio = async (item) => {
    await base44.entities.Stock.create({
      symbol: item.symbol,
      name: item.name,
      sector: item.sector,
      quantity: 1,
      buy_price: item.current_price,
      current_price: item.current_price,
      currency: 'INR',
      notes: item.notes,
    });
    await base44.entities.Watchlist.delete(item.id);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['stocks'] }),
      queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
    ]);
    toast.success(`${item.symbol} moved into the portfolio.`);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[36px] border border-white/10 bg-[#0b1624]/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Opportunity pipeline</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Track future buys before they become holdings</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-300">
              Monitor target prices, compare them with the local market snapshot, and promote names into the portfolio when they hit your zone.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setCollectionOpen(true)} className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
              <Plus />
              Add Watchlist
            </Button>
            <Button variant="outline" onClick={() => { setRenameName(currentCollection?.name || ''); setRenameOpen(true); }} disabled={!currentCollection} className="rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10">
              <Edit3 />
              Rename
            </Button>
            <Button onClick={() => setAddOpen(true)} className="rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200">
              <Plus />
              Add Watchlist Item
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[#0b1624]/90 p-4">
        <div className="flex flex-wrap gap-3">
          {collections.map((collection) => {
            const count = watchlist.filter((item) => item.list_id === collection.id).length;
            const active = collection.id === selectedListId;
            return (
              <button
                key={collection.id}
                type="button"
                onClick={() => setSelectedListId(collection.id)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${active ? 'border-amber-300/40 bg-amber-300/15 text-white' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'}`}
              >
                <p className="text-sm font-semibold">{collection.name}</p>
                <p className="mt-1 text-xs text-slate-400">{count} tracked name{count === 1 ? '' : 's'}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Tracked Names', value: `${items.length}`, note: `${items.filter((item) => item.status === 'Buy zone').length} in buy zone` },
          { label: 'Near Target', value: `${items.filter((item) => item.status === 'Near target').length}`, note: currentCollection ? `${currentCollection.name} focus list` : 'Within a small distance of target' },
          { label: 'Already Owned', value: `${items.filter((item) => item.alreadyOwned).length}`, note: 'Watchlist names that are also in the portfolio' },
        ].map((card) => (
          <div key={card.label} className="rounded-[28px] border border-white/10 bg-[#0b1624]/90 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{card.value}</p>
            <p className="mt-2 text-sm text-slate-400">{card.note}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-[30px] border border-white/10 bg-[#0b1624]/90 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
            <div className="flex items-start justify-between">
              <div>
                <div className="inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
                  {item.symbol}
                </div>
                <p className="mt-4 text-lg font-semibold text-white">{item.name}</p>
                <p className="mt-1 text-sm text-slate-400">{item.sector}</p>
              </div>
              <button onClick={() => remove(item.id)} className="rounded-2xl border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:bg-white/10 hover:text-rose-300">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Current</p>
                <p className="mt-3 text-xl font-semibold text-white">{formatCurrency(item.current_price)}</p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Target</p>
                <p className="mt-3 text-xl font-semibold text-amber-200">{formatCurrency(item.target_price)}</p>
              </div>
            </div>

            <div className="mt-4 rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-300">Distance to target</p>
                <p className={`text-sm font-semibold ${item.upside >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatPercent(item.upside)}</p>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <Target className="h-4 w-4 text-amber-300" />
                <span>{item.status}</span>
                {item.alreadyOwned ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-300">Already owned</span> : null}
              </div>
              {item.notes ? <p className="mt-4 text-sm leading-7 text-slate-400">{item.notes}</p> : null}
            </div>

            <Button onClick={() => moveToPortfolio(item)} className="mt-5 w-full rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200">
              Move To Portfolio
            </Button>
          </div>
        ))}
      </section>

      <Dialog open={collectionOpen} onOpenChange={setCollectionOpen}>
        <DialogContent className="max-w-md border-white/10 bg-[#0c1422] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl">Create Watchlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-400">Watchlist Name</Label>
              <Input value={collectionName} onChange={(event) => setCollectionName(event.target.value)} className="mt-1 border-white/10 bg-white/5 text-white" placeholder="Swing Ideas" />
            </div>
            <Button onClick={createCollection} className="w-full rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200">
              <Plus />
              Create Watchlist
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-md border-white/10 bg-[#0c1422] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl">Rename Watchlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-400">Watchlist Name</Label>
              <Input value={renameName} onChange={(event) => setRenameName(event.target.value)} className="mt-1 border-white/10 bg-white/5 text-white" />
            </div>
            <Button onClick={renameCollection} className="w-full rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200">
              <Edit3 />
              Save Name
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg border-white/10 bg-[#0c1422] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl">Add To {currentCollection?.name || 'Watchlist'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-400">Ticker Symbol</Label>
              <div className="mt-1 flex gap-2">
                <StockAutocompleteInput
                  value={form.symbol}
                  onChange={(nextValue) => setForm((current) => ({ ...current, symbol: nextValue }))}
                  onSelect={(item) => setForm((current) => ({ ...current, symbol: item.symbol, name: item.name, target_price: current.target_price || String(item.current_price) }))}
                  className="border-white/10 bg-white/5 text-white"
                />
                <Button variant="outline" onClick={lookup} disabled={isSearching} className="border-white/10 bg-white/5">
                  {isSearching ? <Loader2 className="animate-spin" /> : <Search />}
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-400">Company Name</Label>
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-1 border-white/10 bg-white/5 text-white" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-400">Target Price</Label>
              <Input type="number" step="0.01" value={form.target_price} onChange={(event) => setForm((current) => ({ ...current, target_price: event.target.value }))} className="mt-1 border-white/10 bg-white/5 text-white" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-400">Notes</Label>
              <Input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 border-white/10 bg-white/5 text-white" placeholder="What would make this a buy?" />
            </div>
            <Button onClick={save} disabled={isSaving} className="w-full rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200">
              {isSaving ? <Loader2 className="animate-spin" /> : <Plus />}
              Add Watchlist Item
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
