import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSkus, createSku } from '@/lib/api';
import { Plus, X } from 'lucide-react';

export default function Products() {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();

  const { data: skus = [], isLoading } = useQuery<any[]>({
    queryKey: ['skus', search],
    queryFn: () => fetchSkus(search || undefined),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Product Catalogue (SKUs)</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add SKU
        </button>
      </div>

      <input
        type="text"
        placeholder="Search SKUs…"
        className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {showAdd && <AddSkuModal onClose={() => setShowAdd(false)} />}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th className="px-4 py-2 text-left w-16">Code</th>
              <th className="px-4 py-2 text-left">Pro Forma Product</th>
              <th className="px-4 py-2 text-left">Item</th>
              <th className="px-4 py-2 text-left">Grade</th>
              <th className="px-4 py-2 text-right w-24">Qty (kg/pkg)</th>
              <th className="px-4 py-2 text-left w-28">Packaging</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse" /></td></tr>
              ))
            ) : (skus as any[]).map((s: any) => (
              <tr key={s.sku_id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{s.legacy_code}</td>
                <td className="px-4 py-2.5 font-medium text-gray-800">{s.pro_forma_product}</td>
                <td className="px-4 py-2.5 text-gray-600">{s.item}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{s.grade ?? '—'}</td>
                <td className="px-4 py-2.5 text-right text-gray-500">{s.qty > 0 ? s.qty : '—'}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{s.pkg ?? '—'}</td>
              </tr>
            ))}
            {!isLoading && skus.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No SKUs found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddSkuModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ item: '', grade: '', qty: '', pkg: '' });
  const [saving, setSaving] = useState(false);

  const preview = form.item
    ? (Number(form.qty) > 0
        ? `${form.item} - ${form.grade} - ${form.qty} Kg ${form.pkg}`
        : `${form.item} ${form.grade}  ${form.pkg}`)
    : '';

  const submit = async () => {
    if (!form.item.trim()) return;
    setSaving(true);
    try {
      await createSku({ item: form.item.trim(), grade: form.grade || null, qty: Number(form.qty) || 0, pkg: form.pkg || null });
      await qc.invalidateQueries({ queryKey: ['skus'] });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 w-full max-w-md space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Add New SKU</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Item Name *</label>
            <input className="input w-full" value={form.item} onChange={e => setForm({ ...form, item: e.target.value })} placeholder="e.g. Sodium Hydrosulphite" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Grade</label>
              <input className="input w-full" value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} placeholder="e.g. Grade A1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Qty per pkg (kg)</label>
              <input type="number" min="0" className="input w-full" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="e.g. 100" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Packaging</label>
            <input className="input w-full" value={form.pkg} onChange={e => setForm({ ...form, pkg: e.target.value })} placeholder="e.g. (Drum)" />
          </div>
          {preview && (
            <p className="text-xs text-gray-500 italic bg-gray-50 px-3 py-2 rounded">
              Pro Forma: {preview}
            </p>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-1.5 border border-gray-300 rounded text-sm">Cancel</button>
          <button onClick={submit} disabled={saving || !form.item.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save SKU'}
          </button>
        </div>
      </div>
    </div>
  );
}
