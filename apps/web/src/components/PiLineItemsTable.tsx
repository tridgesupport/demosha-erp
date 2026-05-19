import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Trash2, Plus, Search, X } from 'lucide-react';
import { calcLineAmount, calcNumPackages, formatINR } from '@/lib/calculations';
import { fetchSkus, createSku } from '@/lib/api';

export interface LineItem {
  sku_id: string;
  full_description: string;
  qty_kg: number;
  rate_per_mt: number;
  qty_per_pkg?: number | null;
  num_packages?: number;
  line_amount?: number;
}

interface Props {
  lines: LineItem[];
  onChange: (lines: LineItem[]) => void;
  lineErrors?: Record<number, string>;
}

// ── SKU search cell (portal dropdown) ──────────────────────────────────────
function SkuSearchCell({ line, idx, onSelect, hasError }: {
  line: LineItem;
  idx: number;
  onSelect: (patch: Partial<LineItem>) => void;
  hasError?: boolean;
}) {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState(line.full_description);
  const [creating, setCreating] = useState(false);
  const [newItem, setNewItem]   = useState('');
  const [newGrade, setNewGrade] = useState('');
  const [newQty, setNewQty]     = useState('');
  const [newPkg, setNewPkg]     = useState('');
  const [dropPos, setDropPos]   = useState({ top: 0, left: 0, width: 520 });

  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const { data: results = [] } = useQuery<any[]>({
    queryKey: ['skus-search', query],
    queryFn: () => fetchSkus(query),
    enabled: open,
  });

  const openDropdown = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropH = 440;
      const top = spaceBelow >= dropH
        ? rect.bottom + window.scrollY + 4
        : rect.top + window.scrollY - dropH - 4;
      setDropPos({ top, left: rect.left + window.scrollX, width: Math.max(520, rect.width) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open && !creating) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false);
      setCreating(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, creating]);

  const select = (sku: any) => {
    onSelect({
      sku_id: sku.sku_id,
      full_description: sku.pro_forma_product,
      qty_per_pkg: sku.qty > 0 ? sku.qty : null,
    });
    setQuery(sku.pro_forma_product);
    setOpen(false);
    setCreating(false);
  };

  const handleCreate = async () => {
    if (!newItem.trim()) return;
    const created = await createSku({ item: newItem.trim(), grade: newGrade || null, qty: Number(newQty) || 0, pkg: newPkg || null });
    select(created);
    setNewItem(''); setNewGrade(''); setNewQty(''); setNewPkg('');
  };

  const dropdown = createPortal(
    <div
      ref={dropRef}
      style={{ position: 'absolute', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999, display: (open || creating) ? 'block' : 'none' }}
      className="bg-white border border-gray-300 rounded-xl shadow-2xl"
    >
      {creating ? (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-800">New SKU</p>
            <button onMouseDown={() => setCreating(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Item Name</label>
              <input autoFocus value={newItem} onChange={e => setNewItem(e.target.value)}
                placeholder="e.g. Sodium Hydrosulphite"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Grade</label>
              <input value={newGrade} onChange={e => setNewGrade(e.target.value)}
                placeholder="e.g. Grade A1"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Qty per pkg (kg)</label>
              <input type="number" min="0" value={newQty} onChange={e => setNewQty(e.target.value)}
                placeholder="e.g. 100"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Packaging</label>
              <input value={newPkg} onChange={e => setNewPkg(e.target.value)}
                placeholder="e.g. (Drum)"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full" />
            </div>
          </div>
          {(newItem || newGrade || newQty || newPkg) && (
            <p className="text-xs text-gray-500 italic bg-gray-50 px-3 py-1.5 rounded">
              Preview: {newQty && Number(newQty) > 0
                ? `${newItem} - ${newGrade} - ${newQty} Kg ${newPkg}`
                : `${newItem} ${newGrade}  ${newPkg}`}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button onMouseDown={handleCreate} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Save SKU</button>
            <button onMouseDown={() => setCreating(false)} className="px-4 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-3 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name or code…"
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {results.length > 0 && (
            <div className="px-3 py-1 text-xs text-gray-400 border-b border-gray-100">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </div>
          )}

          <div className="overflow-y-auto" style={{ maxHeight: 300 }}>
            {results.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">No SKUs found</p>
            ) : (
              results.map((sku: any) => (
                <div key={sku.sku_id} onMouseDown={() => select(sku)}
                  className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800 leading-tight">{sku.pro_forma_product}</div>
                  </div>
                  <div className="text-right shrink-0 mt-0.5">
                    <div className="text-xs font-mono text-gray-400">#{sku.legacy_code}</div>
                    {sku.qty > 0 && <div className="text-xs text-gray-400">{sku.qty} kg/pkg</div>}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-gray-100 px-3 py-2.5">
            <button onMouseDown={() => { setCreating(true); setNewItem(query); }}
              className="flex items-center gap-1.5 text-sm text-green-700 hover:text-green-800">
              <Plus className="w-3.5 h-3.5" /> Create new SKU
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={openDropdown}
        className={`w-full text-left border rounded px-2 py-1.5 text-sm truncate bg-white hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${hasError ? 'border-red-400' : 'border-gray-300'}`}
      >
        {line.full_description
          ? <span className="text-gray-800">{line.full_description}</span>
          : <span className="text-gray-400">Select SKU…</span>
        }
      </button>
      {dropdown}
    </div>
  );
}

// ── Main table ──────────────────────────────────────────────────────────────
export default function PiLineItemsTable({ lines, onChange, lineErrors = {} }: Props) {
  const addLine = () => {
    onChange([...lines, { sku_id: '', full_description: '', qty_kg: 0, rate_per_mt: 0 }]);
  };

  const removeLine = (idx: number) => onChange(lines.filter((_, i) => i !== idx));

  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    const updated = lines.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      next.num_packages = calcNumPackages(next.qty_kg, next.qty_per_pkg);
      next.line_amount = calcLineAmount(next.num_packages, next.rate_per_mt);
      return next;
    });
    onChange(updated);
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-gray-500 text-xs uppercase">
              <th className="py-2 text-left w-6">#</th>
              <th className="py-2 text-left">SKU / Description</th>
              <th className="py-2 text-right w-24">Qty (kg)</th>
              <th className="py-2 text-right w-20">Pkgs</th>
              <th className="py-2 text-right w-28">Rate (₹/Pkg)</th>
              <th className="py-2 text-right w-28">Amount (₹)</th>
              <th className="py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className={`border-b hover:bg-gray-50 ${lineErrors[idx] ? 'bg-red-50' : ''}`}>
                <td className="py-2 pr-2 text-gray-400">{idx + 1}</td>
                <td className="py-2 pr-2">
                  <SkuSearchCell
                    line={line}
                    idx={idx}
                    onSelect={(patch) => updateLine(idx, patch)}
                    hasError={!!lineErrors[idx]}
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number" min={0} step={0.001}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={line.qty_kg || ''}
                    onChange={(e) => updateLine(idx, { qty_kg: parseFloat(e.target.value) || 0 })}
                  />
                </td>
                <td className="py-2 pr-2 text-right text-gray-500">
                  {calcNumPackages(line.qty_kg, line.qty_per_pkg)}
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number" min={0} step={0.01}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={line.rate_per_mt || ''}
                    onChange={(e) => updateLine(idx, { rate_per_mt: parseFloat(e.target.value) || 0 })}
                  />
                </td>
                <td className="py-2 pr-2 text-right font-medium">
                  {formatINR(calcLineAmount(calcNumPackages(line.qty_kg, line.qty_per_pkg), line.rate_per_mt))}
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => removeLine(idx)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {lineErrors[idx] && <span className="text-red-500 text-xs" title={lineErrors[idx]}>⚠</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addLine}
        className="mt-3 flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium">
        <Plus className="w-4 h-4" /> Add line item
      </button>
    </div>
  );
}
