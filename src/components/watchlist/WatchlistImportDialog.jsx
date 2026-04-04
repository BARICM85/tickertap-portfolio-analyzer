import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { resolveStockInputAsync, searchStockSuggestionsAsync } from '@/lib/marketData';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function parseWatchlistRows(rows = []) {
  const entries = [];
  const unresolved = [];

  for (const [index, row] of rows.entries()) {
    const rawStock = String(row.Stock || row.Symbol || row.Name || '').trim();
    if (!rawStock) continue;

    const resolved = await resolveStockInputAsync(rawStock);
    if (!resolved) {
      unresolved.push({
        row: index + 2,
        input: rawStock,
        suggestions: await searchStockSuggestionsAsync(rawStock, 3),
      });
      continue;
    }

    entries.push({
      symbol: resolved.symbol,
      name: resolved.name,
      sector: resolved.sector,
      current_price: resolved.current_price,
      exchange: resolved.exchange,
      target_price: toNumber(row['Target Price'] ?? row.Target ?? row['Buy Below'], resolved.current_price),
      notes: String(row.Notes || row.Note || '').trim() || undefined,
    });
  }

  const deduped = new Map();
  entries.forEach((item) => {
    deduped.set(item.symbol, item);
  });

  return {
    items: [...deduped.values()],
    unresolved,
  };
}

export default function WatchlistImportDialog({ open, onOpenChange, onImportComplete }) {
  const fileRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [parsedItems, setParsedItems] = useState([]);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setResult(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: null });
      const parsed = await parseWatchlistRows(rows);

      setParsedItems(parsed.items);
      setPreview({
        fileName: file.name,
        rows: rows.length,
        ...parsed,
      });

      if (parsed.unresolved.length > 0) toast.error('Some stock names need review before watchlist import.');
      else toast.success(`Preview ready for ${parsed.items.length} watchlist names.`);
    } catch {
      setResult({ success: false, error: 'Workbook could not be read. Please use Excel format with Stock and optional Target Price columns.' });
      toast.error('Watchlist import failed.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const confirmImport = async () => {
    if (!parsedItems.length) {
      toast.error('No watchlist rows were detected.');
      return;
    }
    if (preview?.unresolved?.length) {
      toast.error('Resolve unmatched stock names before importing.');
      return;
    }

    setIsUploading(true);
    try {
      await base44.entities.Watchlist.bulkCreate(parsedItems);
      setResult({ success: true, count: parsedItems.length });
      setPreview(null);
      setParsedItems([]);
      onImportComplete?.();
      toast.success(`Imported ${parsedItems.length} watchlist rows.`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-white/10 bg-[#0c1422] text-white">
        <DialogHeader>
          <DialogTitle className="text-xl">Import Watchlist</DialogTitle>
          <DialogDescription className="text-slate-400">
            Upload a watchlist Excel file to preview matched stocks before importing them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-dashed border-white/12 bg-white/[0.03] p-6 text-center">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-amber-300" />
            <p className="mt-4 text-lg font-medium text-white">Upload watchlist workbook</p>
            <p className="mt-2 text-sm text-slate-400">
              Required column: Stock. Optional columns: Target Price, Notes. Stock can be ticker symbol or company name.
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
            <Button onClick={() => fileRef.current?.click()} disabled={isUploading} className="mt-5 rounded-2xl bg-amber-400 text-slate-950 hover:bg-amber-300">
              {isUploading ? <Loader2 className="animate-spin" /> : <Upload />}
              {isUploading ? 'Reading file...' : 'Select File'}
            </Button>
          </div>

          {preview ? (
            <div className="rounded-[24px] border border-white/10 bg-[#101826] p-4 text-sm text-slate-300">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-white">Import preview</p>
                  <p className="mt-1 text-slate-400">
                    {preview.fileName} | {preview.rows} row{preview.rows === 1 ? '' : 's'} | {preview.items.length} stock{preview.items.length === 1 ? '' : 's'} ready
                  </p>
                </div>
                <Button onClick={confirmImport} disabled={isUploading || preview.unresolved.length > 0} className="rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200">
                  {isUploading ? <Loader2 className="animate-spin" /> : <Upload />}
                  Import
                </Button>
              </div>

              {preview.items.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-[20px] border border-white/8">
                  <div className="grid grid-cols-[1.1fr_1.6fr_1fr_1fr] bg-white/[0.03] px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    <span>Symbol</span>
                    <span>Name</span>
                    <span className="text-right">Current</span>
                    <span className="text-right">Target</span>
                  </div>
                  {preview.items.slice(0, 6).map((item) => (
                    <div key={item.symbol} className="grid grid-cols-[1.1fr_1.6fr_1fr_1fr] border-t border-white/6 px-4 py-3">
                      <span className="font-medium text-white">{item.symbol}</span>
                      <span className="text-slate-300">{item.name}</span>
                      <span className="text-right text-slate-300">{item.current_price.toFixed(2)}</span>
                      <span className="text-right text-amber-200">{item.target_price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {preview.unresolved.length > 0 ? (
                <div className="mt-4 rounded-[20px] border border-rose-400/20 bg-rose-400/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-rose-200">Unmatched rows</p>
                  <div className="mt-3 space-y-3">
                    {preview.unresolved.map((item) => (
                      <div key={`${item.row}-${item.input}`} className="rounded-2xl border border-rose-300/15 bg-black/10 p-3">
                        <p className="font-medium text-white">Row {item.row}: {item.input}</p>
                        <p className="mt-1 text-xs text-slate-300">
                          {item.suggestions.length
                            ? `Suggestions: ${item.suggestions.map((suggestion) => `${suggestion.symbol} (${suggestion.name})`).join(', ')}`
                            : 'No close catalog or market search match found.'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {result ? (
            <div className={`flex items-center gap-3 rounded-[24px] border p-4 ${result.success ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-rose-400/20 bg-rose-400/10 text-rose-200'}`}>
              {result.success ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              <p>{result.success ? `Imported ${result.count} watchlist stocks successfully.` : result.error}</p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
