import React, { useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StockAutocompleteInput from '@/components/shared/StockAutocompleteInput';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const SECTORS = [
  'Technology',
  'Finance',
  'Healthcare',
  'Energy',
  'Industrials',
  'Consumer Staples',
  'Consumer Discretionary',
  'Utilities',
  'Materials',
  'Communication Services',
  'Real Estate',
];

const INITIAL_FORM = {
  symbol: '',
  name: '',
  sector: '',
  quantity: '',
  buy_price: '',
  current_price: '',
  buy_date: '',
  notes: '',
};

export default function AddStockDialog({ open, onOpenChange, onStockAdded }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

  const updateForm = (patch) => setForm((current) => ({ ...current, ...patch }));

  const handleLookup = async () => {
    if (!form.symbol.trim()) return;
    setIsSearching(true);
    try {
      const liveResponse = await fetch(`${apiBaseUrl}/api/market/quote?symbol=${encodeURIComponent(form.symbol.toUpperCase())}`);
      if (!liveResponse.ok) throw new Error('Live lookup failed');
      const liveQuote = await liveResponse.json();
      const fallbackProfile = await base44.integrations.Core.InvokeLLM({
        prompt: `Give me info about the Indian stock with ticker symbol "${form.symbol.toUpperCase()}" listed on NSE/BSE. I need: company name, sector, current stock price in INR (Indian Rupees), beta, PE ratio, market cap, and dividend yield.`,
        response_json_schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            sector: { type: 'string' },
            current_price: { type: 'number' },
          },
        },
      });

      updateForm({
        symbol: form.symbol.toUpperCase(),
        name: liveQuote.shortName || fallbackProfile.name || form.name,
        sector: fallbackProfile.sector || form.sector,
        buy_price: form.buy_price || String(liveQuote.price || fallbackProfile.current_price || ''),
        current_price: String(liveQuote.price || fallbackProfile.current_price || form.current_price || ''),
      });
      toast.success(`Live quote loaded for ${form.symbol.toUpperCase()}.`);
    } catch {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Give me info about the Indian stock with ticker symbol "${form.symbol.toUpperCase()}" listed on NSE/BSE. I need: company name, sector, current stock price in INR (Indian Rupees), beta, PE ratio, market cap, and dividend yield.`,
        response_json_schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            sector: { type: 'string' },
            current_price: { type: 'number' },
          },
        },
      });

      updateForm({
        symbol: form.symbol.toUpperCase(),
        name: result.name || form.name,
        sector: result.sector || form.sector,
        buy_price: form.buy_price || String(result.current_price || ''),
        current_price: String(result.current_price || form.current_price || ''),
      });
      toast.success(`Local market profile loaded for ${form.symbol.toUpperCase()}.`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSave = async () => {
    if (!form.symbol || !form.name || !form.quantity || !form.buy_price) {
      toast.error('Symbol, company, quantity, and buy price are required.');
      return;
    }

    setIsSaving(true);
    await base44.entities.Stock.create({
      symbol: form.symbol.toUpperCase(),
      name: form.name,
      sector: form.sector,
      quantity: Number(form.quantity),
      buy_price: Number(form.buy_price),
      current_price: Number(form.current_price || form.buy_price),
      buy_date: form.buy_date || undefined,
      notes: form.notes || undefined,
      currency: 'INR',
    });
    setIsSaving(false);
    setForm(INITIAL_FORM);
    onOpenChange(false);
    onStockAdded();
    toast.success(`${form.symbol.toUpperCase()} was added to the portfolio.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-white/10 bg-[#0c1422] text-white">
        <DialogHeader>
          <DialogTitle className="text-xl">Add Holding</DialogTitle>
          <DialogDescription className="text-slate-400">
            Add a stock to your portfolio with symbol, pricing, and optional notes.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label className="text-xs uppercase tracking-[0.18em] text-slate-400">Ticker Symbol</Label>
            <div className="mt-1 flex gap-2">
              <StockAutocompleteInput
                value={form.symbol}
                onChange={(nextValue) => updateForm({ symbol: nextValue })}
                onSelect={(item) => updateForm({ symbol: item.symbol, name: item.name, sector: item.sector, current_price: String(item.current_price), buy_price: form.buy_price || String(item.current_price) })}
                placeholder="RELIANCE, TCS, INFY"
                className="border-white/10 bg-white/5 text-white"
              />
              <Button variant="outline" onClick={handleLookup} disabled={isSearching} className="border-white/10 bg-white/5">
                {isSearching ? <Loader2 className="animate-spin" /> : <Search />}
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-400">Use lookup to fetch a live price first, then adjust quantity or buy price before saving.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-400">Company Name</Label>
              <Input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} className="mt-1 border-white/10 bg-white/5 text-white" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-400">Sector</Label>
              <Select value={form.sector} onValueChange={(value) => updateForm({ sector: value })}>
                <SelectTrigger className="mt-1 border-white/10 bg-white/5 text-white">
                  <SelectValue placeholder="Select sector" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#111a2a] text-white">
                  {SECTORS.map((sector) => (
                    <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-400">Quantity</Label>
              <Input type="number" value={form.quantity} onChange={(event) => updateForm({ quantity: event.target.value })} className="mt-1 border-white/10 bg-white/5 text-white" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-400">Buy Price</Label>
              <Input type="number" step="0.01" value={form.buy_price} onChange={(event) => updateForm({ buy_price: event.target.value })} className="mt-1 border-white/10 bg-white/5 text-white" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-400">Current Price</Label>
              <Input type="number" step="0.01" value={form.current_price} onChange={(event) => updateForm({ current_price: event.target.value })} className="mt-1 border-white/10 bg-white/5 text-white" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-400">Buy Date</Label>
              <Input type="date" value={form.buy_date} onChange={(event) => updateForm({ buy_date: event.target.value })} className="mt-1 border-white/10 bg-white/5 text-white" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-400">Notes</Label>
              <Input value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} placeholder="Why this belongs in the portfolio" className="mt-1 border-white/10 bg-white/5 text-white" />
            </div>
          </div>

          <Button onClick={handleSave} disabled={isSaving} className="mt-2 h-11 rounded-2xl bg-amber-400 text-slate-950 hover:bg-amber-300">
            {isSaving ? <Loader2 className="animate-spin" /> : <Plus />}
            Add Holding
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
