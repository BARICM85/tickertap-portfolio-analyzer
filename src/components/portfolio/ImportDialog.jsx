import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { getStockProfile, resolveStockInput } from '@/lib/marketData';

function excelSerialToIso(value) {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const utcDays = Math.floor(value - 25569);
    const utcValue = utcDays * 86400;
    return new Date(utcValue * 1000).toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function aggregateWorkbookRows(rows = []) {
  const grouped = new Map();

  rows.forEach((row) => {
    const stockValue = String(row.Symbol || row.Stock || row.Name || '').trim();
    const resolved = resolveStockInput(stockValue);
    const symbol = resolved?.symbol || stockValue.toUpperCase();
    if (!symbol) return;

    const broker = String(row.BROKER || '').trim().toUpperCase() || undefined;
    const quantity = toNumber(row.Qty, 0);
    const buyPrice = toNumber(row['Buy Price'], 0);
    const buyValue = toNumber(row['Buy Value'], quantity * buyPrice);
    const buyDate = excelSerialToIso(row['Buy Date']);
    if (!quantity || !buyPrice) return;

    const profile = getStockProfile(symbol);
    const existing = grouped.get(symbol) || {
      symbol,
      name: resolved?.name || profile.name,
      sector: profile.sector,
      exchange: profile.exchange,
      current_price: profile.current_price,
      beta: profile.beta,
      pe_ratio: profile.pe_ratio,
      market_cap: profile.market_cap,
      dividend_yield: profile.dividend_yield,
      broker,
      quantity: 0,
      investedTotal: 0,
      purchase_history: [],
    };

    existing.quantity += quantity;
    existing.investedTotal += buyValue;
    existing.purchase_history.push({
      broker,
      quantity,
      buy_price: buyPrice,
      buy_value: buyValue,
      buy_date: buyDate,
    });
    grouped.set(symbol, existing);
  });

  return [...grouped.values()].map((item) => {
    const averageBuyPrice = item.quantity > 0 ? item.investedTotal / item.quantity : 0;
    const sortedHistory = item.purchase_history
      .filter((lot) => lot.buy_date)
      .sort((left, right) => left.buy_date.localeCompare(right.buy_date));

    return {
      symbol: item.symbol,
      name: item.name,
      sector: item.sector,
      exchange: item.exchange,
      broker: item.broker,
      quantity: item.quantity,
      buy_price: Number(averageBuyPrice.toFixed(2)),
      current_price: item.current_price,
      buy_date: sortedHistory[0]?.buy_date,
      buy_value: Number(item.investedTotal.toFixed(2)),
      currency: 'INR',
      beta: item.beta,
      pe_ratio: item.pe_ratio,
      market_cap: item.market_cap,
      dividend_yield: item.dividend_yield,
      notes: `Imported from workbook with ${item.purchase_history.length} lot${item.purchase_history.length === 1 ? '' : 's'}.`,
      purchase_history: item.purchase_history,
    };
  });
}

export default function ImportDialog({ open, onOpenChange, onImportComplete }) {
  const fileRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setResult(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: null });
      const rawStocks = aggregateWorkbookRows(rows);

      if (rawStocks.length > 0) {
        await base44.entities.Stock.replace(rawStocks);
        setResult({ success: true, count: rawStocks.length });
        onImportComplete();
        toast.success(`Imported ${rawStocks.length} portfolio holdings from Excel.`);
      } else {
        setResult({ success: false, error: 'No portfolio rows matched the sample workbook format.' });
        toast.error('Import failed.');
      }
    } catch {
      setResult({ success: false, error: 'Workbook could not be read. Please use the provided Excel format.' });
      toast.error('Import failed.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-white/10 bg-[#0c1422] text-white">
        <DialogHeader>
          <DialogTitle className="text-xl">Import Portfolio</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-dashed border-white/12 bg-white/[0.03] p-6 text-center">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-amber-300" />
            <p className="mt-4 text-lg font-medium text-white">Upload Excel workbook</p>
            <p className="mt-2 text-sm text-slate-400">
              Required columns: BROKER, Stock, Buy Date, Buy Price, Qty, Buy Value. The Stock column can be symbol or company name.
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
            <Button onClick={() => fileRef.current?.click()} disabled={isUploading} className="mt-5 rounded-2xl bg-amber-400 text-slate-950 hover:bg-amber-300">
              {isUploading ? <Loader2 className="animate-spin" /> : <Upload />}
              {isUploading ? 'Importing...' : 'Select File'}
            </Button>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-[#101826] p-4 text-sm text-slate-300">
            <p className="font-medium text-white">Workbook format</p>
            <p className="mt-2">This importer follows your Excel structure and now resolves stocks from either ticker symbols or stock names.</p>
          </div>

          {result ? (
            <div className={`flex items-center gap-3 rounded-[24px] border p-4 ${result.success ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-rose-400/20 bg-rose-400/10 text-rose-200'}`}>
              {result.success ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              <p>{result.success ? `Imported ${result.count} holdings successfully.` : result.error}</p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
