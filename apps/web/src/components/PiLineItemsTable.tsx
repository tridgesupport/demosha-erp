import { Trash2, Plus } from 'lucide-react';
import { calcLineAmount, calcNumPackages, formatINR } from '@/lib/calculations';

export interface LineItem {
  variant_id: string;
  full_description: string;
  qty_kg: number;
  rate_per_mt: number;
  qty_per_pkg?: number | null;
  num_packages?: number;
  line_amount?: number;
}

interface Variant {
  variant_id: string;
  full_description: string;
  grade?: string;
  hs_code?: string;
  pkg_name?: string;
  qty_per_pkg?: number | null;
}

interface Props {
  lines: LineItem[];
  variants: Variant[];
  onChange: (lines: LineItem[]) => void;
}

export default function PiLineItemsTable({ lines, variants, onChange }: Props) {
  const addLine = () => {
    onChange([
      ...lines,
      { variant_id: '', full_description: '', qty_kg: 0, rate_per_mt: 0 },
    ]);
  };

  const removeLine = (idx: number) => {
    onChange(lines.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    const updated = lines.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, [field]: value };
      if (field === 'variant_id') {
        const v = variants.find((vr) => vr.variant_id === value);
        if (v) {
          next.full_description = v.full_description;
          next.qty_per_pkg = v.qty_per_pkg;
        }
      }
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
              <tr key={idx} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-2 text-gray-400">{idx + 1}</td>
                <td className="py-2 pr-2">
                  <select
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={line.variant_id}
                    onChange={(e) => updateLine(idx, 'variant_id', e.target.value)}
                  >
                    <option value="">Select SKU…</option>
                    {variants.map((v) => (
                      <option key={v.variant_id} value={v.variant_id}>
                        {v.full_description}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={line.qty_kg || ''}
                    onChange={(e) => updateLine(idx, 'qty_kg', parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td className="py-2 pr-2 text-right text-gray-500">
                  {calcNumPackages(line.qty_kg, line.qty_per_pkg)}
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={line.rate_per_mt || ''}
                    onChange={(e) => updateLine(idx, 'rate_per_mt', parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td className="py-2 pr-2 text-right font-medium">
                  {formatINR(calcLineAmount(calcNumPackages(line.qty_kg, line.qty_per_pkg), line.rate_per_mt))}
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addLine}
        className="mt-3 flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
      >
        <Plus className="w-4 h-4" /> Add line item
      </button>
    </div>
  );
}
