import React from 'react';
import { Settings, Eye, EyeOff, Trash2, Plus } from 'lucide-react';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

export default function IndicatorSettings({ indicators, onUpdate }) {
  const toggleActive = (id) => {
    onUpdate({
      ...indicators,
      [id]: { ...indicators[id], active: !indicators[id].active }
    });
  };

  const updateParam = (id, field, value) => {
    onUpdate({
      ...indicators,
      [id]: { ...indicators[id], [field]: value }
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-lg bg-white/5 border-white/10 text-slate-300 hover:text-white">
          <Settings className="h-4 w-4 mr-2" />
          Indicators
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-[#0b1119] border-white/10 text-white p-4 rounded-xl shadow-2xl">
        <h3 className="text-sm font-semibold mb-4 border-b border-white/5 pb-2">Active Indicators</h3>
        
        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          {Object.entries(indicators).map(([id, config]) => (
            <div key={id} className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-200">{config.name}</span>
                <button 
                  onClick={() => toggleActive(id)}
                  className={`p-1 rounded transition ${config.active ? 'text-cyan-400 bg-cyan-400/10' : 'text-slate-500 bg-white/5'}`}
                >
                  {config.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
              </div>

              {config.active && (
                <div className="grid grid-cols-2 gap-3">
                  {/* Period Input */}
                  {config.period !== undefined && (
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 uppercase">Period</label>
                      <input 
                        type="number" 
                        value={config.period} 
                        onChange={(e) => updateParam(id, 'period', parseInt(e.target.value) || 1)}
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-amber-500/50"
                      />
                    </div>
                  )}
                  
                  {/* EMA/SMA specific fields */}
                  {config.fast !== undefined && (
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 uppercase">Fast</label>
                      <input 
                        type="number" 
                        value={config.fast} 
                        onChange={(e) => updateParam(id, 'fast', parseInt(e.target.value) || 1)}
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                      />
                    </div>
                  )}

                  {config.slow !== undefined && (
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 uppercase">Slow</label>
                      <input 
                        type="number" 
                        value={config.slow} 
                        onChange={(e) => updateParam(id, 'slow', parseInt(e.target.value) || 1)}
                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                      />
                    </div>
                  )}

                  {/* Color Picker */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase">Color</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="color" 
                        value={config.color.startsWith('rgba') ? '#ffffff' : config.color} 
                        onChange={(e) => updateParam(id, 'color', e.target.value)}
                        className="w-8 h-6 bg-transparent border-none outline-none cursor-pointer"
                      />
                      <span className="text-[10px] font-mono opacity-50">{config.color}</span>
                    </div>
                  </div>

                  {/* Thickness */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase">Width</label>
                    <select 
                      value={config.thickness}
                      onChange={(e) => updateParam(id, 'thickness', parseInt(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                    >
                      <option value={1}>1px</option>
                      <option value={2}>2px</option>
                      <option value={3}>3px</option>
                      <option value={4}>4px</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-white/5">
          <p className="text-[10px] text-slate-500 italic">Changes apply instantly to the live chart.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
