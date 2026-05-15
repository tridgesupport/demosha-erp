import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchFinancialYears, fetchNextIndentNumber, fetchPurchaseItems, createPurchaseItem } from '@/lib/api';
import { useCreatePurchaseIndent } from '@/hooks/usePurchaseIndents';
import { format } from 'date-fns';
import { Plus, Trash2, Search } from 'lucide-react';

const UNITS = ['Nos.', 'MTON', 'Kgs', 'Ltrs', 'Set', 'Pair', 'Mtr', 'Box', 'Roll', 'Sheet', 'Bag', 'Drum', 'Can'];
const ACTION_BY_OPTIONS = ['Valsad', 'Mumbai', 'Both'];
const REPLACEMENT_OPTIONS = ['Replacement', 'New'];

interface LineItem {
  item_id: string | null;
  description: string;
  unit: string;
  quantity: string;
  stock_available: string;
  goods_required_for: string;
  preferred_brand: string;
  replacement_or_new: string;
  action_by: string;
  comments: string;
}

function emptyLine(): LineItem {
  return {
    item_id: null, description: '', unit: 'Nos.', quantity: '',
    stock_available: '', goods_required_for: '', preferred_brand: '',
    replacement_or_new: '', action_by: 'Valsad', comments: '',
  };
}

function ItemSearchCell({ line, idx, onChange }: {
  line: LineItem;
  idx: number;
  onChange: (idx: number, patch: Partial<LineItem>) => void;
}) {
  const [query, setQuery] = useState(line.description);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('Nos.');
  const ref = useRef<HTMLDivElement>(null);

  const { data: results = [], refetch } = useQuery({
    queryKey: ['purchase-items-search', query],
    queryFn: () => fetchPurchaseItems(query),
    enabled: open && query.length >= 1,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (item: any) => {
    onChange(idx, { item_id: item.item_id, description: item.item_name, unit: item.default_unit || line.unit });
    setQuery(item.item_name);
    setOpen(false);
  };

  const handleCreate = async () => {
    if (!newItemName.trim()) return;
    const created = await createPurchaseItem({ item_name: newItemName.trim(), default_unit: newItemUnit });
    select(created);
    setCreating(false);
    setNewItemName('');
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(idx, { description: e.target.value, item_id: null }); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search or type description..."
          className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
        />
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
      </div>
      {open && (
        <div className="absolute z-20 bg-white border border-gray-200 rounded shadow-lg mt-1 w-72 max-h-52 overflow-y-auto">
          {(results as any[]).map((item: any) => (
            <div
              key={item.item_id}
              onMouseDown={() => select(item)}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm"
            >
              <span className="font-medium">{item.item_name}</span>
              {item.default_unit && <span className="text-gray-400 ml-2 text-xs">({item.default_unit})</span>}
            </div>
          ))}
          <div
            onMouseDown={() => { setCreating(true); setOpen(false); }}
            className="px-3 py-2 hover:bg-green-50 cursor-pointer text-sm text-green-700 border-t border-gray-100 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Create new item "{query}"
          </div>
        </div>
      )}
      {creating && (
        <div className="absolute z-20 bg-white border border-gray-200 rounded shadow-lg mt-1 p-3 w-72 space-y-2">
          <p className="text-xs font-medium text-gray-700">New Item</p>
          <input
            autoFocus
            value={newItemName || query}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Item name"
            className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
          />
          <select
            value={newItemUnit}
            onChange={(e) => setNewItemUnit(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
          >
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Save</button>
            <button onClick={() => setCreating(false)} className="px-3 py-1 border text-xs rounded">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewIndent() {
  const navigate = useNavigate();
  const createIndent = useCreatePurchaseIndent();

  const { data: fyList = [] } = useQuery({ queryKey: ['financial-years'], queryFn: fetchFinancialYears });
  const currentFy: any = (fyList as any[]).find((f: any) => f.is_current) ?? (fyList as any[])[0];

  const [fyKey, setFyKey] = useState<number | null>(null);
  const [indentDate, setIndentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [indentFor, setIndentFor] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (currentFy) setFyKey(currentFy.fy_key); }, [currentFy]);

  const { data: numData } = useQuery({
    queryKey: ['indent-next-number', fyKey],
    queryFn: () => fetchNextIndentNumber(fyKey!),
    enabled: fyKey != null,
  });

  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const validate = () => {
    const errs: string[] = [];
    if (!fyKey) errs.push('Financial year is required');
    if (!indentDate) errs.push('Date is required');
    lines.forEach((l, i) => {
      if (!l.description.trim()) errs.push(`Line ${i + 1}: description is required`);
      if (!l.quantity || isNaN(Number(l.quantity)) || Number(l.quantity) <= 0) errs.push(`Line ${i + 1}: valid quantity is required`);
      if (!l.unit) errs.push(`Line ${i + 1}: unit is required`);
    });
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    setSaving(true);
    try {
      const result: any = await createIndent.mutateAsync({
        fy_key: fyKey,
        indent_date: indentDate,
        indent_for: indentFor || null,
        remarks: remarks || null,
        lines: lines.map((l) => ({
          item_id: l.item_id || null,
          description: l.description.trim(),
          unit: l.unit,
          quantity: Number(l.quantity),
          stock_available: l.stock_available ? Number(l.stock_available) : null,
          goods_required_for: l.goods_required_for || null,
          preferred_brand: l.preferred_brand || null,
          replacement_or_new: l.replacement_or_new || null,
          action_by: l.action_by || null,
          comments: l.comments || null,
        })),
      });
      navigate(`/purchase/indents/${result.indent_id}`);
    } catch (err: any) {
      setErrors([err.message ?? 'Failed to create indent']);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900">New Indent</h1>
        {numData?.indentNumber && (
          <span className="ml-auto text-sm text-gray-500 font-mono">{numData.indentNumber}</span>
        )}
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 space-y-1">
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Financial Year</label>
            <select
              value={fyKey ?? ''}
              onChange={(e) => setFyKey(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full"
            >
              {(fyList as any[]).map((fy: any) => (
                <option key={fy.fy_key} value={fy.fy_key}>{fy.fy_label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Indent Date</label>
            <input
              type="date"
              value={indentDate}
              onChange={(e) => setIndentDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Indent For (Department / Plant)</label>
            <input
              type="text"
              value={indentFor}
              onChange={(e) => setIndentFor(e.target.value)}
              placeholder="e.g. Power Plant, 2nd Plant"
              className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Overall remarks..."
              className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full"
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Line Items</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <th className="px-3 py-2 text-left min-w-56">Description</th>
                  <th className="px-3 py-2 text-left w-24">Unit</th>
                  <th className="px-3 py-2 text-left w-24">Qty</th>
                  <th className="px-3 py-2 text-left w-24">Stock</th>
                  <th className="px-3 py-2 text-left w-32">Required For</th>
                  <th className="px-3 py-2 text-left w-32">Pref. Brand</th>
                  <th className="px-3 py-2 text-left w-28">Repl./New</th>
                  <th className="px-3 py-2 text-left w-24">Action By</th>
                  <th className="px-3 py-2 text-left w-36">Comments</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line, idx) => (
                  <tr key={idx} className="align-top">
                    <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <ItemSearchCell line={line} idx={idx} onChange={updateLine} />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={line.unit}
                        onChange={(e) => updateLine(idx, { unit: e.target.value })}
                        className="border border-gray-300 rounded px-1 py-1 text-xs w-full"
                      >
                        {UNITS.map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                        className="border border-gray-300 rounded px-1 py-1 text-xs w-full"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.stock_available}
                        onChange={(e) => updateLine(idx, { stock_available: e.target.value })}
                        placeholder="0"
                        className="border border-gray-300 rounded px-1 py-1 text-xs w-full"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={line.goods_required_for}
                        onChange={(e) => updateLine(idx, { goods_required_for: e.target.value })}
                        className="border border-gray-300 rounded px-1 py-1 text-xs w-full"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={line.preferred_brand}
                        onChange={(e) => updateLine(idx, { preferred_brand: e.target.value })}
                        className="border border-gray-300 rounded px-1 py-1 text-xs w-full"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={line.replacement_or_new}
                        onChange={(e) => updateLine(idx, { replacement_or_new: e.target.value })}
                        className="border border-gray-300 rounded px-1 py-1 text-xs w-full"
                      >
                        <option value="">—</option>
                        {REPLACEMENT_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={line.action_by}
                        onChange={(e) => updateLine(idx, { action_by: e.target.value })}
                        className="border border-gray-300 rounded px-1 py-1 text-xs w-full"
                      >
                        {ACTION_BY_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={line.comments}
                        onChange={(e) => updateLine(idx, { comments: e.target.value })}
                        className="border border-gray-300 rounded px-1 py-1 text-xs w-full"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length === 1}
                        className="text-red-400 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-100">
            <button type="button" onClick={addLine} className="flex items-center gap-1 text-blue-600 text-sm hover:text-blue-800">
              <Plus className="w-4 h-4" /> Add Line
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate(-1)} className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Create Indent'}
          </button>
        </div>
      </form>
    </div>
  );
}
