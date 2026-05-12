import { useState } from 'react';
import { X } from 'lucide-react';
import { createCustomer } from '@/lib/api';
import { useStates } from '@/hooks/useCatalog';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  onClose: () => void;
  onCreated: (customer: any) => void;
}

const EMPTY = {
  party_name: '',
  gstin: '',
  primary_state_code: '' as number | '',
  primary_address: '',
  consignee_name: '',
  consignee_gstin: '',
  consignee_state_code: '' as number | '',
  consignee_address: '',
  payment_terms_days: '' as number | '',
};

export default function CustomerFormModal({ onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const { data: states = [] } = useStates();
  const [form, setForm] = useState({ ...EMPTY });
  const [sameAsbuyer, setSameAsbuyer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof EMPTY, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.party_name.trim()) { setError('Buyer name is required'); return; }
    setSaving(true); setError('');
    try {
      const body = {
        ...form,
        primary_state_code: form.primary_state_code !== '' ? Number(form.primary_state_code) : null,
        payment_terms_days: form.payment_terms_days !== '' ? Number(form.payment_terms_days) : null,
        consignee_name: sameAsbuyer ? form.party_name : (form.consignee_name || null),
        consignee_address: sameAsbuyer ? form.primary_address : (form.consignee_address || null),
        consignee_gstin: sameAsbuyer ? form.gstin : (form.consignee_gstin || null),
        consignee_state_code: sameAsbuyer
          ? (form.primary_state_code !== '' ? Number(form.primary_state_code) : null)
          : (form.consignee_state_code !== '' ? Number(form.consignee_state_code) : null),
      };
      const created = await createCustomer(body);
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers-filter'] });
      onCreated(created);
    } catch (err: any) {
      setError(err.message ?? 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-gray-900">Add New Customer</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Buyer section */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bill To (Buyer)</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Buyer Name *</label>
                <input className="input w-full" required value={form.party_name} onChange={(e) => set('party_name', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Buyer GSTIN</label>
                <input className="input w-full" value={form.gstin} onChange={(e) => set('gstin', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Buyer State</label>
                <select className="input w-full" value={form.primary_state_code} onChange={(e) => set('primary_state_code', e.target.value === '' ? '' : parseInt(e.target.value, 10))}>
                  <option value="">Select state…</option>
                  {(states as any[]).map((s: any) => <option key={s.state_code} value={s.state_code}>{s.state_name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Buyer Address</label>
                <textarea className="input w-full" rows={2} value={form.primary_address} onChange={(e) => set('primary_address', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Payment Terms (Days)</label>
                <input type="number" min={0} step={1} className="input w-full" placeholder="e.g. 30" value={form.payment_terms_days} onChange={(e) => set('payment_terms_days', e.target.value === '' ? '' : parseInt(e.target.value, 10))} />
              </div>
            </div>
          </fieldset>

          <hr />

          {/* Consignee section */}
          <fieldset className="space-y-3">
            <div className="flex items-center justify-between">
              <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ship To (Consignee)</legend>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={sameAsbuyer} onChange={(e) => setSameAsbuyer(e.target.checked)} />
                Same as buyer
              </label>
            </div>
            {!sameAsbuyer && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Consignee Name</label>
                  <input className="input w-full" value={form.consignee_name} onChange={(e) => set('consignee_name', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Consignee GSTIN</label>
                  <input className="input w-full" value={form.consignee_gstin} onChange={(e) => set('consignee_gstin', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Consignee State</label>
                  <select className="input w-full" value={form.consignee_state_code} onChange={(e) => set('consignee_state_code', e.target.value === '' ? '' : parseInt(e.target.value, 10))}>
                    <option value="">Select state…</option>
                    {(states as any[]).map((s: any) => <option key={s.state_code} value={s.state_code}>{s.state_name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Consignee Address</label>
                  <textarea className="input w-full" rows={2} value={form.consignee_address} onChange={(e) => set('consignee_address', e.target.value)} />
                </div>
              </div>
            )}
          </fieldset>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Add Customer'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
