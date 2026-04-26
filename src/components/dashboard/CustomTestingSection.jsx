import React, { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Download, Loader2, Play, RotateCcw, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { runCustomTesting } from '@/lib/brokerClient';
import { formatCurrency, formatPercent } from '@/lib/portfolioAnalytics';

const DEFAULT_RULES = {
  period1: 10,
  operator1: '>',
  period2: 20,
  operator2: '>',
  period3: 50,
};

const MAX_CUSTOM_SYMBOLS = 165;

function normalizeSymbolValue(value = '') {
  return String(value || '').trim().toUpperCase();
}

function extractSymbolFromRow(row = {}) {
  const candidates = [
    row.Symbol,
    row.SYMBOL,
    row.Stock,
    row.STOCK,
    row.Ticker,
    row.TICKER,
    row.Tradingsymbol,
    row.TRADINGSYMBOL,
    row['Trading Symbol'],
    row['Stock Symbol'],
    row['Symbol Name'],
    row.symbol,
    row.ticker,
  ];

  for (const candidate of candidates) {
    const value = normalizeSymbolValue(candidate);
    if (value) return value;
  }

  const values = Object.values(row)
    .map((value) => normalizeSymbolValue(value))
    .filter(Boolean);

  if (values.length === 1) {
    return values[0];
  }

  return '';
}

function extractExchangeFromRow(row = {}) {
  const candidates = [
    row.Exchange,
    row.EXCHANGE,
    row.Exch,
    row.EXCH,
    row.Market,
    row.market,
    row.exchange,
  ];

  for (const candidate of candidates) {
    const value = normalizeSymbolValue(candidate);
    if (value) return value;
  }

  return 'NSE';
}

function extractNameFromRow(row = {}, fallback = '') {
  const candidates = [
    row.Name,
    row.NAME,
    row.Company,
    row.COMPANY,
    row['Company Name'],
    row['Security Name'],
    row.name,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }

  return fallback;
}

function dedupeSymbols(rows = []) {
  const indexed = new Map();

  rows.forEach((row) => {
    const symbol = extractSymbolFromRow(row);
    if (!symbol) return;

    const exchange = extractExchangeFromRow(row);
    const key = `${exchange}:${symbol}`;
    if (!indexed.has(key)) {
      indexed.set(key, {
        symbol,
        exchange,
        name: extractNameFromRow(row, symbol),
      });
    }
  });

  return [...indexed.values()];
}

function buildCustomTestWorkbook(data, activeSymbols = [], uploadedFileName = '', settings = {}) {
  const summary = data?.summary || {};
  const rules = data?.rules || {};
  const items = Array.isArray(data?.items) ? data.items : [];
  const successfulItems = items.filter((item) => !item.error);
  const failedItems = items.filter((item) => item.error);

  const summaryRows = [
    { field: 'Strategy', value: data?.strategy || 'sma' },
    { field: 'Range', value: settings.range || data?.range || '--' },
    { field: 'Rule', value: rules.expression || '--' },
    { field: 'Symbols loaded', value: activeSymbols.length },
    { field: 'Source file', value: uploadedFileName || 'Portfolio holdings' },
    { field: 'Tested symbols', value: items.length },
    { field: 'Successful symbols', value: successfulItems.length },
    { field: 'Failed symbols', value: failedItems.length },
    { field: 'Pass count', value: summary.passCount ?? '--' },
    { field: 'Fail count', value: summary.failCount ?? '--' },
    { field: 'Pass rate %', value: Number(summary.passRatePercent || 0).toFixed(2) },
    { field: 'Best symbol', value: summary.bestSymbol || '--' },
    { field: 'Worst symbol', value: summary.worstSymbol || '--' },
    { field: 'Generated at', value: new Date().toISOString() },
  ];

  const resultRows = items.map((item) => ({
    Symbol: item.symbol || '',
    Name: item.name || '',
    Exchange: item.exchange || 'NSE',
    Passed: item.error ? '' : Boolean(item.passed),
    Reason: item.error || item.reason || '',
    'Latest Date': item.latestDate || '',
    'Latest Close': item.latestClose ?? '',
    'History Points': item.historyPoints ?? '',
    'SMA 1': item.smaValues?.[0]?.value ?? '',
    'SMA 2': item.smaValues?.[1]?.value ?? '',
    'SMA 3': item.smaValues?.[2]?.value ?? '',
    Error: item.error || '',
  }));

  const failedRows = failedItems.map((item) => ({
    Symbol: item.symbol || '',
    Name: item.name || '',
    Exchange: item.exchange || 'NSE',
    Error: item.error || '',
    'History Points': item.historyPoints ?? '',
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(resultRows), 'Results');

  if (failedRows.length) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(failedRows), 'Failed');
  }

  return workbook;
}

function RuleSummary({ periods = [], operators = [] }) {
  const [first = 10, second = 20, third = 50] = periods;
  const [op1 = '>', op2 = '>'] = operators;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Rule</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">
        SMA {first} {op1} SMA {second} {op2} SMA {third}
      </p>
    </div>
  );
}

function ResultRow({ item }) {
  const passed = Boolean(item.passed);
  const smaValues = Array.isArray(item.smaValues) ? item.smaValues : [];

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-lg font-semibold text-slate-900">{item.symbol}</p>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-500">
              {item.exchange || 'NSE'}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {passed ? 'Pass' : 'Fail'}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">{item.name || 'Unnamed symbol'}</p>
          <p className="mt-3 text-sm text-slate-600">{item.reason || 'No evaluation result available.'}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[420px] xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Latest close</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(item.latestClose || 0)}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">History</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{item.historyPoints || 0}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Rule date</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{item.latestDate || '--'}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Match</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{passed ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {smaValues.map((entry) => (
          <div key={`${item.symbol}-${entry.period}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">SMA {entry.period}</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{formatCurrency(entry.value || 0)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CustomTestingSection({ stocks = [] }) {
  const fileRef = useRef(null);
  const [uploadedSymbols, setUploadedSymbols] = useState([]);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [range, setRange] = useState('6mo');
  const [period1, setPeriod1] = useState(DEFAULT_RULES.period1);
  const [operator1, setOperator1] = useState(DEFAULT_RULES.operator1);
  const [period2, setPeriod2] = useState(DEFAULT_RULES.period2);
  const [operator2, setOperator2] = useState(DEFAULT_RULES.operator2);
  const [period3, setPeriod3] = useState(DEFAULT_RULES.period3);

  const portfolioSymbols = stocks
    .map((stock) => ({
      symbol: normalizeSymbolValue(stock?.symbol),
      name: String(stock?.name || stock?.symbol || '').trim(),
      exchange: normalizeSymbolValue(stock?.exchange || 'NSE') || 'NSE',
    }))
    .filter((stock) => stock.symbol);

  const activeSymbols = (uploadedSymbols.length ? uploadedSymbols : portfolioSymbols).slice(0, MAX_CUSTOM_SYMBOLS);

  const customTestMutation = useMutation({
    mutationFn: () => runCustomTesting({
      strategy: 'sma',
      symbols: activeSymbols,
      range,
      period1,
      operator1,
      period2,
      operator2,
      period3,
    }),
  });

  const data = customTestMutation.data;
  const items = data?.items || [];
  const successfulItems = items.filter((item) => !item.error);
  const failedItems = items.filter((item) => item.error);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: null });
      const parsedSymbols = dedupeSymbols(rows);

      if (!parsedSymbols.length) {
        toast.error('No symbols found in the workbook.');
        return;
      }

      setUploadedSymbols(parsedSymbols);
      setUploadedFileName(file.name);
      toast.success(`Loaded ${parsedSymbols.length} symbol${parsedSymbols.length === 1 ? '' : 's'} from Excel.`);
    } catch {
      toast.error('Could not read the workbook. Please upload a valid Excel file.');
    } finally {
      event.target.value = '';
    }
  };

  const runTest = async () => {
    if (!activeSymbols.length) {
      toast.error('Add symbols first by importing Excel or using portfolio holdings.');
      return;
    }

    if (period1 < 10 || period1 > 200 || period2 < 10 || period2 > 200 || period3 < 10 || period3 > 200) {
      toast.error('SMA periods must stay between 10 and 200.');
      return;
    }

    if (customTestMutation.isPending) return;
    try {
      await customTestMutation.mutateAsync();
      toast.success('Custom SMA test completed.');
    } catch (error) {
      toast.error(error?.message || 'Custom SMA test failed.');
    }
  };

  const exportResults = () => {
    if (!data?.items?.length) {
      toast.error('Run a custom test before exporting.');
      return;
    }

    try {
      const workbook = buildCustomTestWorkbook(data, activeSymbols, uploadedFileName, { range });
      const filename = `custom-testing-${(data?.strategy || 'sma').toLowerCase()}-${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
      XLSX.writeFile(workbook, filename);
      toast.success('Custom testing export downloaded.');
    } catch {
      toast.error('Could not create the Excel export.');
    }
  };

  const resetImportedSymbols = () => {
    setUploadedSymbols([]);
    setUploadedFileName('');
    toast('Using current portfolio holdings.');
  };

  return (
    <section className="app-panel rounded-[32px] p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-900 p-2 text-white">
              <Play className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Custom Testing</h2>
              <p className="mt-1 text-sm text-slate-500">
                Import symbols from Excel or use current holdings, then test three SMA settings with {'<'}, {'>'}, or {'='} between them.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <Upload />
            Import Excel
          </Button>
          <Button
            variant="outline"
            onClick={resetImportedSymbols}
            className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw />
            Use Portfolio
          </Button>
          <Button
            onClick={runTest}
            disabled={customTestMutation.isPending || !activeSymbols.length}
            className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800"
          >
            {customTestMutation.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            {customTestMutation.isPending ? 'Testing' : 'Run test'}
          </Button>
          <Button
            variant="outline"
            onClick={exportResults}
            disabled={!data?.items?.length}
            className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <Download />
            Export XLSX
          </Button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />

      <div className="mt-6 grid gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Symbols</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{activeSymbols.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Source</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{uploadedFileName ? 'Excel import' : 'Portfolio holdings'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Range</p>
          <select
            value={range}
            onChange={(event) => setRange(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
          >
            <option value="3mo">3 months</option>
            <option value="6mo">6 months</option>
            <option value="1y">1 year</option>
            <option value="2y">2 years</option>
          </select>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Import</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{uploadedFileName || 'No Excel file loaded'}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 xl:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">SMA 1</p>
          <input
            type="number"
            min={10}
            max={200}
            value={period1}
            onChange={(event) => setPeriod1(Number(event.target.value))}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
          />
        </div>
        <div className="flex items-end justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <select
            value={operator1}
            onChange={(event) => setOperator1(event.target.value)}
            className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
          >
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value="=">=</option>
          </select>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">SMA 2</p>
          <input
            type="number"
            min={10}
            max={200}
            value={period2}
            onChange={(event) => setPeriod2(Number(event.target.value))}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
          />
        </div>
        <div className="flex items-end justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <select
            value={operator2}
            onChange={(event) => setOperator2(event.target.value)}
            className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
          >
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value="=">=</option>
          </select>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">SMA 3</p>
          <input
            type="number"
            min={10}
            max={200}
            value={period3}
            onChange={(event) => setPeriod3(Number(event.target.value))}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
          />
        </div>
      </div>

      <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Loaded symbols</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeSymbols.slice(0, 8).map((item) => (
                <span
                  key={`${item.exchange}:${item.symbol}`}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                >
                  {item.symbol}
                </span>
              ))}
              {activeSymbols.length > 8 ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                  +{activeSymbols.length - 8} more
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-white bg-white px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Pass rate</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {formatPercent(data?.summary?.passRatePercent || 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-white bg-white px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Passed</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{data?.summary?.passCount || 0}</p>
            </div>
            <div className="rounded-2xl border border-white bg-white px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Failed</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{data?.summary?.failCount || 0}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Best match</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{data?.summary?.bestSymbol || '--'}</p>
          </div>
          <RuleSummary periods={data?.rules?.periods || [period1, period2, period3]} operators={data?.rules?.operators || [operator1, operator2]} />
        </div>

        <div className="mt-4 rounded-[22px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
          This section is ready for a future RSI mode after the SMA workflow is validated.
        </div>
      </div>

      {customTestMutation.isError ? (
        <div className="mt-4 rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
          Custom testing is unavailable right now. Check the history feed or backend route and try again.
        </div>
      ) : null}

      {customTestMutation.isPending ? (
        <div className="mt-6 flex items-center gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-5 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-slate-900" />
          Running the SMA scan across imported symbols...
        </div>
      ) : null}

      {!customTestMutation.isPending && data ? (
        <div className="mt-6 space-y-3">
          {successfulItems.map((item) => (
            <ResultRow key={`${item.symbol}-${item.exchange || 'NSE'}`} item={item} />
          ))}
          {failedItems.length ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
              {failedItems.length} symbol{failedItems.length === 1 ? '' : 's'} could not be tested because the history feed was unavailable.
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
