import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchVendors, createVendor, updateVendor } from '@/lib/api';
import { X, Pencil, Plus } from 'lucide-react';

interface Vendor {
  vendor_id: string;
  vendor_name: string;
  addr1?: string;
  addr2?: string;
  city?: string;
  pincode?: string;
  state?: string;
  country?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  attn?: string;
  gstin?: string;
  notes?: string;
  is_active: boolean;
}

const EMPTY_FORM = {
  vendor_name: '', addr1: '', addr2: '', city: '', pincode: '',
  state: 'Maharashtra', country: 'India', phone: '', mobile: '',
  email: '', attn: '', gstin: '', notes: '',
};

function VendorModal({
  vendor,
  onClose,
  onSaved,
}: {
  vendor?: Vendor | null;
  onClose: () => void;
  onSaved: (v: Vendor) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(vendor ? {
    vendor_name: vendor.vendor_name ?? '',
    addr1: vendor.addr1 ?? '', addr2: vendor.addr2 ?? '',
    city: vendor.city ?? '', pincode: vendor.pincode ?? '',
    state: vendor.state ?? 'Maharashtra', country: vendor.country ?? 'India',
    phone: vendor.phone ?? '', mobile: vendor.mobile ?? '',
    email: vendor.email ?? '', attn: vendor.attn ?? '',
    gstin: vendor.gstin ?? '', notes: vendor.notes ?? '',
  } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vendor_name.trim()) { setErr('Vendor name is required'); return; }
    setSaving(true); setErr('');
    try {
      let result: Vendor;
      if (vendor) {
        result = await updateVendor(vendor.vendor_id, form) as Vendor;
      } else {
        result = await createVendor(form) as Vendor;
      }
      qc.invalidateQueries({ queryKey: ['vendors'] });
      onSaved(result);
    } catch (e: any) {
      setErr(e.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: string, opts?: { full?: boolean; type?: string }) => (
    <div className={opts?.full ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={opts?.type ?? 'text'}
        value={(form as any)[key]}
        onChange={e => set(key, e.target.value)}
        className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{vendor ? 'Edit Vendor' : 'Add New Vendor'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={save} className="px-6 py-5 space-y-4">
          {err && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{err}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Vendor / Party Name *</label>
              <input
                type="text"
                value={form.vendor_name}
                onChange={e => set('vendor_name', e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
            {field('Address Line 1', 'addr1', { full: true })}
            {field('Address Line 2', 'addr2', { full: true })}
            {field('City', 'city')}
            {field('Pincode', 'pincode')}
            {field('State', 'state')}
            {field('Country', 'country')}
            {field('Phone', 'phone')}
            {field('Mobile', 'mobile')}
            {field('Email', 'email')}
            {field('Attn. (Contact Person)', 'attn')}
            {field('GSTIN', 'gstin')}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={2}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : vendor ? 'Save Changes' : 'Add Vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function VendorsList() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; vendor?: Vendor | null }>({ open: false });

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', debouncedSearch, page],
    queryFn: () => fetchVendors(debouncedSearch || undefined, page),
  });

  const rows: Vendor[] = (data as any)?.data ?? [];
  const total: number  = (data as any)?.total ?? 0;
  const totalPages = Math.ceil(total / 200);

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout((window as any).__vendorSearchTimer);
    (window as any).__vendorSearchTimer = setTimeout(() => { setDebouncedSearch(v); setPage(1); }, 300);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Vendors / Suppliers</h1>
        <button
          onClick={() => setModal({ open: true, vendor: null })}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add Vendor
        </button>
      </div>

      {modal.open && (
        <VendorModal
          vendor={modal.vendor}
          onClose={() => setModal({ open: false })}
          onSaved={() => setModal({ open: false })}
        />
      )}

      <input
        type="text"
        placeholder="Search by name, city, or GSTIN…"
        className="border border-gray-300 rounded px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-1 focus:ring-blue-500"
        value={search}
        onChange={e => handleSearch(e.target.value)}
      />

      <div className="text-xs text-gray-400">{total} vendors</div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 text-left">Vendor Name</th>
                <th className="px-4 py-2 text-left">City / State</th>
                <th className="px-4 py-2 text-left">GSTIN</th>
                <th className="px-4 py-2 text-left">Phone / Mobile</th>
                <th className="px-4 py-2 text-left">Attn.</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-3">
                    <div className="h-4 bg-gray-100 rounded animate-pulse" />
                  </td></tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No vendors found</td></tr>
              ) : (
                rows.map(v => (
                  <tr key={v.vendor_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{v.vendor_name}</td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {[v.city, v.state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{v.gstin || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {[v.phone, v.mobile].filter(s => s && s.trim()).join(' / ') || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{v.attn || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{v.email || '—'}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setModal({ open: true, vendor: v })}
                        className="text-gray-400 hover:text-blue-600 p-1"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 border rounded disabled:opacity-40">Prev</button>
          <span className="text-gray-500">Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
