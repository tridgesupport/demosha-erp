import { useQuery } from '@tanstack/react-query';
import { Trash2, Plus } from 'lucide-react';
import { calcLineAmount, calcNumPackages, formatINR } from '@/lib/calculations';
import { fetchSkus } from '@/lib/api';

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
  const { data: allSkus = [] } = useQuery<any[]>({
    queryKey: ['skus-all'],
    queryFn: () => fetchSkus(''),
  });

  // Distinct items from catalogue
  const items = [...new Set(allSkus.map((s: any) => s.item as string))].sort();

  // Grades available for a given item
  const gradesFor = (item: string) =>
    [...new Set(allSkus.filter((s: any) => s.item === item).map((s: any) => (s.grade as string) || '').filter(Boolean))].sort();

  // Pkgs available for item+grade combo
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

  const applyLine = (idx: number, patch: Partial<LineItem>) => {
    onChange(lines.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      next.num_packages = calcNumPackages(next.qty_kg, next.qty_per_pkg);
      next.line_amount  = calcLineAmount(next.num_packages, next.rate_per_mt);
      return next;
    }));
  };

  // When any catalogue field changes: recompute description and try to match a SKU
  const handleCatalogueField = (idx: number, patch: Partial<LineItem>) => {
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

  // Code lookup (on blur)
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

  const addLine    = () => onChange([...lines, emptyLineItem()]);
  const removeLine = (idx: number) => onChange(lines.filter((_, i) => i !== idx));

  return (
    <div>
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
              <th className="py-2 text-right w-24 pr-1">Rate (₹/Pkg)</th>
              <th className="py-2 text-right w-24">Amount (₹)</th>
              <th className="py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const grades = gradesFor(line.item);
              const pkgs   = pkgsFor(line.item, line.grade);
              const hasErr = !!lineErrors[idx];
              return (
                <tr key={idx} className={`border-b hover:bg-gray-50 align-top ${hasErr ? 'bg-red-50' : ''}`}>
                  {/* # */}
                  <td className="py-2 pr-1 text-gray-400 pt-2.5">{idx + 1}</td>

                  {/* Code */}
                  <td className="py-2 pr-1">
                    <input
                      type="number" min="1"
                      value={line.legacy_code || ''}
                      onChange={e => applyLine(idx, { legacy_code: e.target.value })}
                      onBlur={e => handleCodeBlur(idx, e.target.value)}
                      placeholder="#"
                      className="w-full border border-gray-300 rounded px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>

                  {/* Item */}
                  <td className="py-2 pr-1">
                    <select
                      value={line.item}
                      onChange={e => handleCatalogueField(idx, { item: e.target.value, grade: '', qty_per_pkg: null, pkg: '' })}
                      className={`w-full border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 ${hasErr ? 'border-red-400' : 'border-gray-300'}`}
                    >
                      <option value="">— select item —</option>
                      {items.map((it: string) => <option key={it} value={it}>{it}</option>)}
                    </select>
                  </td>

                  {/* Grade */}
                  <td className="py-2 pr-1">
                    <select
                      value={line.grade}
                      onChange={e => handleCatalogueField(idx, { grade: e.target.value, qty_per_pkg: null, pkg: '' })}
                      disabled={!line.item}
                      className="w-full border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="">—</option>
                      {grades.map((g: string) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </td>

                  {/* Qty/pkg — plain number input; auto-set from code lookup, or typed manually */}
                  <td className="py-2 pr-1">
                    <input
                      type="number" min="0" step="any"
                      value={line.qty_per_pkg ?? ''}
                      onChange={e => handleCatalogueField(idx, { qty_per_pkg: e.target.value ? Number(e.target.value) : null })}
                      placeholder="—"
                      className="w-full border border-gray-300 rounded px-1.5 py-1 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>

                  {/* Pkg */}
                  <td className="py-2 pr-1">
                    <select
                      value={line.pkg}
                      onChange={e => handleCatalogueField(idx, { pkg: e.target.value })}
                      disabled={!line.grade}
                      className="w-full border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="">—</option>
                      {pkgs.map((p: string) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>

                  {/* Pro Forma Product (auto-filled, editable) */}
                  <td className="py-2 pr-1">
                    <input
                      type="text"
                      value={line.full_description}
                      onChange={e => applyLine(idx, { full_description: e.target.value })}
                      placeholder="auto-filled from above"
                      className="w-full border border-gray-300 rounded px-1.5 py-1 bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                    />
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
                    {formatINR(calcLineAmount(calcNumPackages(line.qty_kg, line.qty_per_pkg), line.rate_per_mt))}
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
