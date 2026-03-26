import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ImportDialog({ open, onOpenChange, onImportComplete }) {
  const fileRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setResult(null);

    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({ file_url });
    const rawStocks = extracted.output?.stocks || [];

    if (extracted.status === 'success' && rawStocks.length > 0) {
      await base44.entities.Stock.bulkCreate(rawStocks);
      setResult({ success: true, count: rawStocks.length });
      onImportComplete();
      toast.success(`Imported ${rawStocks.length} holdings.`);
    } else {
      setResult({ success: false, error: extracted.details || 'No stock rows were detected.' });
      toast.error('Import failed.');
    }

    setIsUploading(false);
    event.target.value = '';
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
            <p className="mt-4 text-lg font-medium text-white">Upload CSV or JSON</p>
            <p className="mt-2 text-sm text-slate-400">
              Expected columns: symbol, name, sector, quantity, buy_price, current_price, buy_date, notes
            </p>
            <input ref={fileRef} type="file" accept=".csv,.json" className="hidden" onChange={handleFileSelect} />
            <Button onClick={() => fileRef.current?.click()} disabled={isUploading} className="mt-5 rounded-2xl bg-amber-400 text-slate-950 hover:bg-amber-300">
              {isUploading ? <Loader2 className="animate-spin" /> : <Upload />}
              {isUploading ? 'Importing...' : 'Select File'}
            </Button>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-[#101826] p-4 text-sm text-slate-300">
            <p className="font-medium text-white">Tip</p>
            <p className="mt-2">Export spreadsheets as CSV before importing. This standalone build keeps everything in browser storage.</p>
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
