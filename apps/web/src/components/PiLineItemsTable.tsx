import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, Sparkles } from 'lucide-react';
import { calcLineAmount, calcNumPackages, formatINR } from '@/lib/calculations';
import { fetchSkus, createSku } from '@/lib/api';

export interface LineItem {
  sku_id: string;
  legacy_code: string;
  item: string;
  grade: string;
  qty_per_pkg: number | null;
  pkg: string;
  full_description: string;
  qty_kg: number;
  rate_per_mt: number;
  num_packages?: number;
  line_amount?: number;
}

export function emptyLineItem(): LineItem {
  return { sku_id: '', legacy_code: '', item: '', grade: '', qty_per_pkg: null, pkg: '', full_description: '', qty_kg: 0, rate_per_mt: 0 };
}

function computeProForma(item: string, grade: string, qty: number | null, pkg: string): string {
  if (!item) return '';
  const q = qty ?? 0;
  return q > 0
    ? `${item} - ${grade} - ${q} Kg ${pkg}`.replace(/\s+$/, '')
    : `${item} ${grade}  ${pkg}`.replace(/\s+$/, '');
}

interface Props {
  lines: LineItem[];
  onChange: (lines: LineItem[]) => void;
  lineErrors?: Record<number, string>;
}

export default function PiLineItemsTable({ lines, onChange, lineErrors = {} }: Props) {
  const queryClient = useQueryClient();
  const { data: allSkus = [] } = useQuery<any[]>({
    queryKey: ['skus-all'],
    queryFn: () => fetchSkus(''),
  });

  // Row indices with a "Create new SKU" save in flight, so the button can
  // show a spinner state and can't be double-clicked.
  const [creatingRows, setCreatingRows] = useState<Set<number>>(new Set());

  // Latest lines, for use inside async handlers so a delayed response doesn't clobber
  // edits made elsewhere in the table while the request was in flight.
  const linesRef = useRef(lines);
  useEffect(() => { linesRef.current = lines; }, [lines]);

  // Distinct items from catalogue — used as <datalist> suggestions, not a
  // closed set: every item/grade/pkg field below is free text, so a value
  // that isn't in this list yet can still be typed in.
  const items = [...new Set(allSkus.map((s: any) => s.item as string).filter(Boolean))].sort();

  // Grades seen for a given item (suggestions only)
  const gradesFor = (item: string) =>
    [...new Set(allSkus.filter((s: any) => s.item === item).map((s: any) => (s.grade as string) || '').filter(Boolean))].sort();

  // Pkgs seen for an item+grade combo (suggestions only)
  const pkgsFor = (item: string, grade: string) =>
    [...new Set(allSkus.filter((s: any) => s.item === item && (s.grade || '') === grade).map((s: any) => (s.pkg as string) || '').filter(Boolean))].sort();

  // Find the unique SKU for a given combination
  const findSku = (item: string, grade: string, qty: number | null, pkg: string) =>
    allSkus.find((s: any) =>
      s.item === item &&
      (s.grade || '') === grade &&
      (s.qty || 0) === (qty || 0) &&
      (s.pkg || '') === pkg
    );

  const nextCode = () => allSkus.reduce((max: number, s: any) => Math.max(max, Number(s.legacy_code) || 0), 0) + 1;

  const applyLine = (idx: number, patch: Partial<LineItem>) => {
    onChange(linesRef.current.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      next.num_packages = calcNumPackages(next.qty_kg, next.qty_per_pkg);
      next.line_amount  = calcLineAmount(next.qty_kg, next.rate_per_mt);
      return next;
    }));
  };

  // Whenever item/grade/qty/pkg change: try to match an existing SKU and fill
  // sku_id/code/description from it; otherwise clear those and recompute the
  // description locally. Never auto-creates — creation is an explicit action
  // (see handleCreateSku) so the user sees and confirms it's happening.
  const matchSkuOrClear = (idx: number, patch: Partial<LineItem>) => {
    const line = lines[idx];
    const merged = { ...line, ...patch };
    const sku = findSku(merged.item, merged.grade, merged.qty_per_pkg, merged.pkg);
    if (sku) {
      merged.sku_id        = sku.sku_id;
      merged.legacy_code   = String(sku.legacy_code);
      merged.full_description = sku.pro_forma_product;
    } else {
      merged.sku_id      = '';
      merged.legacy_code = '';
      merged.full_description = computeProForma(merged.item, merged.grade, merged.qty_per_pkg, merged.pkg);
    }
    applyLine(idx, merged);
  };

  // Code lookup (on blur) — pick an existing code by typing/selecting it from
  // the datalist and the rest of the row fills in.
  const handleCodeBlur = (idx: number, code: string) => {
    const num = parseInt(code);
    if (!num) return;
    const sku = allSkus.find((s: any) => s.legacy_code === num);
    if (!sku) return;
    applyLine(idx, {
      sku_id:           sku.sku_id,
      legacy_code:      String(sku.legacy_code),
      item:             sku.item,
      grade:            sku.grade || '',
      qty_per_pkg:      sku.qty > 0 ? sku.qty : null,
      pkg:              sku.pkg || '',
      full_description: sku.pro_forma_product,
    });
  };

  // Item/grade/qty/pkg are all filled in but don't match any existing SKU —
  // offer to create one (rather than silently doing it), auto-numbered to
  // the next available code.
  const canCreateSku = (line: LineItem) =>
    !line.sku_id && !!line.item.trim() && !!line.grade.trim() && !!line.pkg.trim() && !!line.qty_per_pkg;

  const handleCreateSku = async (idx: number) => {
    const line = lines[idx];
    if (!canCreateSku(line)) return;
    setCreatingRows(prev => new Set(prev).add(idx));
    try {
      const created: any = await createSku({
        item: line.item.trim(),
        grade: line.grade.trim(),
        qty: line.qty_per_pkg,
        pkg: line.pkg.trim(),
      });
      // Available immediately for this row and for every other item/grade/pkg
      // picker and code lookup in the table — no refetch needed.
      queryClient.setQueryData<any[]>(['skus-all'], (old = []) => [...old, created]);
      applyLine(idx, {
        sku_id:           created.sku_id,
        legacy_code:      String(created.legacy_code),
        full_description: created.pro_forma_product,
      });
    } catch (err) {
      console.error('Failed to create SKU', err);
    } finally {
      setCreatingRows(prev => { const s = new Set(prev); s.delete(idx); return s; });
    }
  };

  const addLine    = () => onChange([...lines, emptyLineItem()]);
  const removeLine = (idx: number) => onChange(lines.filter((_, i) => i !== idx));

  return (
    <div>
      {/* Shared suggestion lists — free-text inputs below reference these by id,
          so users can pick an existing value or type a brand new one. */}
      <datalist id="sku-item-list">
        {items.map((it: string) => <option key={it} value={it} />)}
      </datalist>
      <datalist id="sku-code-list">
        {allSkus.map((s: any) => <option key={s.sku_id} value={s.legacy_code} />)}
      </datalist>

      <div className="overflow-x-auto">
        <table className="text-xs" style={{ minWidth: 1240 }}>
          <thead>
            <tr className="border-b text-gray-500 text-xs uppercase">
              <th className="py-2 text-left w-6 pr-1">#</th>
              <th className="py-2 text-left w-16 pr-1">Code</th>
              <th className="py-2 text-left w-44 pr-1">Item</th>
              <th className="py-2 text-left w-28 pr-1">Grade</th>
              <th className="py-2 text-right w-20 pr-1">Qty/pkg<br/><span className="normal-case font-normal text-gray-400">(kg)</span></th>
              <th className="py-2 text-left w-24 pr-1">Pkg</th>
              <th className="py-2 text-left w-52 pr-1">Pro Forma Product</th>
              <th className="py-2 text-right w-20 pr-1">Qty (kg)</th>
              <th className="py-2 text-right w-14 pr-1">Pkgs</th>
              <th className="py-2 text-right w-24 pr-1">Rate (₹/Kg)</th>
              <th className="py-2 text-right w-24">Amount (₹)</th>
              <th className="py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const grades = gradesFor(line.item);
              const pkgs   = pkgsFor(line.item, line.grade);
              const hasErr = !!lineErrors[idx];
              const offerCreate = canCreateSku(line);
              const isCreating = creatingRows.has(idx);
              return (
                <tr key={idx} className={`border-b hover:bg-gray-50 align-top ${hasErr ? 'bg-red-50' : ''}`}>
                  {/* # */}
                  <td className="py-2 pr-1 text-gray-400 pt-2.5">{idx + 1}</td>

                  {/* Code — pick an existing one from the dropdown, or leave blank for a new item */}
                  <td className="py-2 pr-1">
                    <input
                      type="text" inputMode="numeric" list="sku-code-list"
                      value={line.legacy_code || ''}
                      onChange={e => applyLine(idx, { legacy_code: e.target.value })}
                      onBlur={e => handleCodeBlur(idx, e.target.value)}
                      placeholder="#"
                      className="w-full border border-gray-300 rounded px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>

                  {/* Item — free text; pick a suggestion or type a new item name */}
                  <td className="py-2 pr-1">
                    <input
                      type="text" list="sku-item-list"
                      value={line.item}
                      onChange={e => matchSkuOrClear(idx, { item: e.target.value })}
                      placeholder="Type or select item…"
                      className={`w-full border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 ${hasErr ? 'border-red-400' : 'border-gray-300'}`}
                    />
                  </td>

                  {/* Grade — free text; suggestions scoped to the item typed above */}
                  <td className="py-2 pr-1">
                    <input
                      type="text" list={`sku-grade-list-${idx}`}
                      value={line.grade}
                      onChange={e => matchSkuOrClear(idx, { grade: e.target.value })}
                      disabled={!line.item}
                      placeholder="—"
                      className="w-full border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <datalist id={`sku-grade-list-${idx}`}>
                      {grades.map((g: string) => <option key={g} value={g} />)}
                    </datalist>
                  </td>

                  {/* Qty/pkg — plain number input; auto-set from code lookup, or typed manually */}
                  <td className="py-2 pr-1">
                    <input
                      type="number" min="0" step="any"
                      value={line.qty_per_pkg ?? ''}
                      onChange={e => matchSkuOrClear(idx, { qty_per_pkg: e.target.value ? Number(e.target.value) : null })}
                      placeholder="—"
                      className="w-full border border-gray-300 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>

                  {/* Pkg — free text; suggestions scoped to the item+grade above */}
                  <td className="py-2 pr-1">
                    <input
                      type="text" list={`sku-pkg-list-${idx}`}
                      value={line.pkg}
                      onChange={e => matchSkuOrClear(idx, { pkg: e.target.value })}
                      disabled={!line.grade}
                      placeholder="—"
                      className="w-full border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <datalist id={`sku-pkg-list-${idx}`}>
                      {pkgs.map((p: string) => <option key={p} value={p} />)}
                    </datalist>
                  </td>

                  {/* Pro Forma Product (auto-filled, editable) + explicit "create new SKU" offer */}
                  <td className="py-2 pr-1">
                    <input
                      type="text"
                      value={line.full_description}
                      onChange={e => applyLine(idx, { full_description: e.target.value })}
                      placeholder="auto-filled from above"
                      className="w-full border border-gray-300 rounded px-1.5 py-1 bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                    />
                    {offerCreate && (
                      <button
                        type="button"
                        onClick={() => handleCreateSku(idx)}
                        disabled={isCreating}
                        className="mt-1 w-full flex items-center justify-center gap-1 px-1.5 py-1 border border-dashed border-amber-400 text-amber-700 bg-amber-50 rounded hover:bg-amber-100 disabled:opacity-50"
                      >
                        <Sparkles className="w-3 h-3" />
                        {isCreating ? 'Saving…' : `New item — save as code #${nextCode()}`}
                      </button>
                    )}
                  </td>

                  {/* Qty (kg) */}
                  <td className="py-2 pr-1">
                    <input
                      type="number" min={0} step={0.001}
                      value={line.qty_kg || ''}
                      onChange={e => applyLine(idx, { qty_kg: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>

                  {/* Pkgs (computed) */}
                  <td className="py-2 pr-1 text-right text-gray-500 pt-2.5">
                    {calcNumPackages(line.qty_kg, line.qty_per_pkg)}
                  </td>

                  {/* Rate */}
                  <td className="py-2 pr-1">
                    <input
                      type="number" min={0} step={0.01}
                      value={line.rate_per_mt || ''}
                      onChange={e => applyLine(idx, { rate_per_mt: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>

                  {/* Amount */}
                  <td className="py-2 text-right font-medium pt-2.5">
                    {formatINR(calcLineAmount(line.qty_kg, line.rate_per_mt))}
                  </td>

                  {/* Delete */}
                  <td className="py-2 pl-2">
                    <div className="flex items-center gap-1 pt-1">
                      <button type="button" onClick={() => removeLine(idx)} className="text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {hasErr && <span className="text-red-500" title={lineErrors[idx]}>⚠</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
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
