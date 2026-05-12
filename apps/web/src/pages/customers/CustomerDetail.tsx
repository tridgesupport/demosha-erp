import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCustomer, useCustomerOrders, useUpdateCustomer } from '@/hooks/useCustomers';
import { useFiltersContext } from '@/context/FiltersContext';
import { formatINR } from '@/lib/calculations';
import StatusBadge from '@/components/StatusBadge';
import OverdueBadge from '@/components/OverdueBadge';
import { Edit2, Save, X } from 'lucide-react';

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { filters } = useFiltersContext();
  const { data, isLoading } = useCustomer(id);
  const { data: orders = [] } = useCustomerOrders(id, filters);
  const updateCustomer = useUpdateCustomer(id!);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});

  if (isLoading) return <div className="animate-pulse h-64 bg-gray-200 rounded-lg" />;
  if (!data) return <div className="text-center py-16 text-gray-400">Customer not found</div>;

  const c = data as any;
  const outstanding = c.outstanding;

  const startEdit = () => {
    setForm({ ...c });
    setEditing(true);
  };

  const saveEdit = async () => {
    await updateCustomer.mutateAsync(form);
    setEditing(false);
  };

  const overdueColor = (days: number) =>
    days >= 90 ? 'bg-red-50 border-red-200' : days >= 60 ? 'bg-orange-50 border-orange-200' : days >= 30 ? 'bg-yellow-50 border-yellow-200' : 'bg-white';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/customers" className="text-gray-500 hover:text-gray-700 text-sm">← Customers</Link>
        <h1 className="text-2xl font-bold text-gray-900">{c.party_name}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: 60% */}
        <div className="lg:col-span-3 space-y-4">
          {/* Profile card */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800">Party Profile</h2>
              {!editing ? (
                <button onClick={startEdit} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={saveEdit} className="flex items-center gap-1 text-sm text-green-600 hover:underline">
                    <Save className="w-3 h-3" /> Save
                  </button>
                  <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-sm text-red-500 hover:underline">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              )}
            </div>
            {editing ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Bill To (Buyer)</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {(['party_name', 'gstin'] as const).map((field) => (
                      <div key={field}>
                        <label className="text-xs text-gray-400">{field === 'party_name' ? 'Buyer Name' : 'Buyer GSTIN'}</label>
                        <input className="w-full border border-gray-300 rounded px-2 py-1 mt-0.5 text-sm" value={form[field] ?? ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
                      </div>
                    ))}
                    <div>
                      <label className="text-xs text-gray-400">Payment Terms (Days)</label>
                      <input type="number" min={0} step={1} className="w-full border border-gray-300 rounded px-2 py-1 mt-0.5 text-sm" value={form.payment_terms_days ?? ''} onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value === '' ? null : parseInt(e.target.value, 10) })} />
                    </div>
                    {(['contact_phone', 'contact_email', 'tally_ref'] as const).map((field) => (
                      <div key={field}>
                        <label className="text-xs text-gray-400 capitalize">{field.replace(/_/g, ' ')}</label>
                        <input className="w-full border border-gray-300 rounded px-2 py-1 mt-0.5 text-sm" value={form[field] ?? ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
                      </div>
                    ))}
                    <div className="col-span-2">
                      <label className="text-xs text-gray-400">Buyer Address</label>
                      <textarea className="w-full border border-gray-300 rounded px-2 py-1 mt-0.5 text-sm" rows={2} value={form.primary_address ?? ''} onChange={(e) => setForm({ ...form, primary_address: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ship To (Consignee)</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-400">Consignee Name</label>
                      <input className="w-full border border-gray-300 rounded px-2 py-1 mt-0.5 text-sm" value={form.consignee_name ?? ''} onChange={(e) => setForm({ ...form, consignee_name: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Consignee GSTIN</label>
                      <input className="w-full border border-gray-300 rounded px-2 py-1 mt-0.5 text-sm" value={form.consignee_gstin ?? ''} onChange={(e) => setForm({ ...form, consignee_gstin: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-400">Consignee Address</label>
                      <textarea className="w-full border border-gray-300 rounded px-2 py-1 mt-0.5 text-sm" rows={2} value={form.consignee_address ?? ''} onChange={(e) => setForm({ ...form, consignee_address: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Notes</label>
                  <textarea className="w-full border border-gray-300 rounded px-2 py-1 mt-0.5 text-sm" rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Buyer</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['GSTIN', c.gstin],
                      ['State', c.state_name],
                      ['Phone', c.contact_phone],
                      ['Email', c.contact_email],
                      ['Tally Ref', c.tally_ref],
                      ['Payment Terms', c.payment_terms_days != null ? `${c.payment_terms_days} Days` : null],
                    ].map(([k, v]) => v ? (
                      <div key={k}><span className="text-gray-400">{k}: </span><span className="font-medium">{v}</span></div>
                    ) : null)}
                    {c.primary_address && <div className="col-span-2 text-gray-600 text-xs">{c.primary_address}</div>}
                  </div>
                </div>
                {(c.consignee_name || c.consignee_address) && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Consignee</p>
                    <div className="grid grid-cols-2 gap-2">
                      {c.consignee_name && <div className="col-span-2 font-medium">{c.consignee_name}</div>}
                      {c.consignee_gstin && <div><span className="text-gray-400">GSTIN: </span><span className="font-medium">{c.consignee_gstin}</span></div>}
                      {c.consignee_address && <div className="col-span-2 text-gray-600 text-xs">{c.consignee_address}</div>}
                    </div>
                  </div>
                )}
                {c.notes && <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">{c.notes}</div>}
              </div>
            )}
          </div>

          {/* Outstanding summary chips */}
          {outstanding && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Total Pending', value: formatINR(outstanding.total_pending), color: 'bg-blue-50 border-blue-200' },
                  { label: 'Max Overdue', value: `${outstanding.max_overdue_days}d`, color: overdueColor(outstanding.max_overdue_days) },
                  { label: '90+ Days', value: formatINR(outstanding.overdue_90_plus), color: 'bg-red-50 border-red-200' },
                  { label: '60-89 Days', value: formatINR(outstanding.overdue_60_89), color: 'bg-orange-50 border-orange-200' },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`border rounded-lg px-3 py-2 text-sm ${color}`}>
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="font-bold text-gray-800 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              {/* Outstanding ledger */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50">
                  <h3 className="font-semibold text-gray-700 text-sm">Outstanding Ledger</h3>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-gray-400 uppercase">
                      <th className="px-3 py-2 text-left">Ref #</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-right">Date</th>
                      <th className="px-3 py-2 text-right">Due</th>
                      <th className="px-3 py-2 text-right">Opening</th>
                      <th className="px-3 py-2 text-right">Pending</th>
                      <th className="px-3 py-2 text-center">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(c.ledger ?? []).length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400">No outstanding ledger entries</td></tr>
                    ) : (c.ledger as any[]).map((l: any, i: number) => (
                      <tr key={i} className={l.overdue_days >= 90 ? 'bg-red-50' : l.overdue_days >= 60 ? 'bg-orange-50' : l.overdue_days >= 30 ? 'bg-yellow-50' : ''}>
                        <td className="px-3 py-2 font-mono">{l.ref_number ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{l.transaction_type ?? '—'}</td>
                        <td className="px-3 py-2 text-right">{l.transaction_date ? String(l.transaction_date).slice(0, 10) : '—'}</td>
                        <td className="px-3 py-2 text-right">{l.due_date ? String(l.due_date).slice(0, 10) : '—'}</td>
                        <td className="px-3 py-2 text-right">{formatINR(l.opening_amount)}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatINR(l.pending_amount)}</td>
                        <td className="px-3 py-2 text-center"><OverdueBadge days={l.overdue_days} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Right: 40% */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Order History</h2>
            <Link
              to={`/orders/new?buyerId=${id}`}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
            >
              + New PI
            </Link>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-xs text-gray-400 uppercase">
                  <th className="px-3 py-2 text-left">PI #</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(orders as any[]).length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No orders</td></tr>
                ) : (
                  (orders as any[]).map((o) => (
                    <tr key={o.order_id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <Link to={`/orders/${o.order_id}`} className="text-blue-600 hover:underline font-medium">{o.pi_number}</Link>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{o.order_date}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatINR(o.total_amount)}</td>
                      <td className="px-3 py-2 text-center"><StatusBadge status={o.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
