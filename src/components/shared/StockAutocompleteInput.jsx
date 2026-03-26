import React, { useMemo, useState } from 'react';
import { searchStockCatalog } from '@/lib/marketData';
import { cn } from '@/lib/utils';

export default function StockAutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder = 'Search symbol or company',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = useMemo(() => searchStockCatalog(value, 8), [value]);

  const commitSelection = (item) => {
    onSelect?.(item);
    setOpen(false);
    setActiveIndex(0);
  };

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value.toUpperCase());
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (!suggestions.length) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => (current + 1) % suggestions.length);
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
          }
          if (event.key === 'Enter' && open) {
            event.preventDefault();
            commitSelection(suggestions[activeIndex]);
          }
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        placeholder={placeholder}
        className={cn('h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-white placeholder:text-slate-500', className)}
      />

      {open && suggestions.length ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0f1827] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
          {suggestions.map((item, index) => (
            <button
              key={item.symbol}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commitSelection(item)}
              className={cn(
                'flex w-full items-center justify-between gap-3 border-b border-white/6 px-4 py-3 text-left transition last:border-b-0',
                index === activeIndex ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]',
              )}
            >
              <div>
                <p className="font-medium text-white">{item.symbol}</p>
                <p className="text-xs text-slate-400">{item.name}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.16em] text-amber-200">{item.exchange}</p>
                <p className="text-xs text-slate-500">{item.sector}</p>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
