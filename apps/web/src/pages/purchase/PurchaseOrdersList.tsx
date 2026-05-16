import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders';
import { Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchFinancialYears } from '@/lib/api';

const PO_STATUS_LABELS: Record<string, string> = {
  draft: 'Approval Pending',
  sent: 'Approval Pending',
  pending_approval: 'Approval Pending',
  approved: 'Approved',
  sent_to_vendor: 'Sent to Vendor',
  received: 'Received',
  cancelled: 'Cancelled',
};

const PO_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-700',
  sent: 'bg-amber-100 text-amber-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-indigo-100 text-indigo-700',
  sent_to_vendor: 'bg-orange-100 text-orange-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

type SortKey = 'po_number' | 'order_date' | 'supplier_name' | 'total_amount' | 'status';

export default function PurchaseOrdersList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('order_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: fyList = [] } = useQuery({ queryKey: ['financial-years'], queryFn: fetchFinancialYears });
  const currentFy: any = (fyList as any[]).find((f: any) => f.is_current) ?? (fyList as any[])[0];
  const [fyKey, setFyKey] = useState<number | null>(null);

  const { data, isLoading } = usePurchaseOrders({ fyKey: fyKey ?? currentFy?.fy_key, page });
  const rows: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  const displayed = [...rows]
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return r.po_number?.toLowerCase().includes(q) || r.supplier_name?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
        <button
          onClick={() => navigate('/purchase/orders/new')}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> New PO
        </button>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <input
          type="text"
          placeholder="Search PO # or supplier..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64"
        />
        <select
          value={fyKey ?? currentFy?.fy_key ?? ''}
          onChange={(e) => { setFyKey(Number(e.target.value)); setPage(1); }}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm"
        >
          {(fyList as any[]).map((fy: any) => (
            <option key={fy.fy_key} value={fy.fy_key}>{fy.fy_label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                {[
                  { key: 'po_number', label: 'PO #' },
                  { key: 'order_date', label: 'Date' },
                  { key: 'supplier_name', label: 'Supplier' },
                  { key: null, label: 'Indent #' },
                  { key: null, label: 'Dept' },
                  { key: null, label: 'Lines' },
                  { key: 'total_amount', label: 'Total' },
                  { key: 'status', label: 'Status' },
                ].map(({ key, label }) => (
                  <th
                    key={label}
                    onClick={() => key && toggleSort(key as SortKey)}
                    className={`px-4 py-3 text-left ${key ? 'cursor-pointer select-none hover:bg-gray-100' : ''}`}
                  >
                    {label} {key && <SortIcon col={key as SortKey} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No purchase orders found</td></tr>
              ) : displayed.map((row) => (
                <tr
                  key={row.order_id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/purchase/orders/${row.order_id}`)}
                >
                  <td className="px-4 py-3 font-medium text-blue-600">{row.po_number}</td>
                  <td className="px-4 py-3">{row.order_date ? String(row.order_date).slice(0, 10) : '—'}</td>
                  <td className="px-4 py-3">{row.supplier_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{row.indent_number ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{row.dept ?? '—'}</td>
                  <td className="px-4 py-3">{row.line_count ?? 0}</td>
                  <td className="px-4 py-3 font-medium">
                    {row.total_amount != null
                      ? `₹${Number(row.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PO_STATUS_COLORS[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {PO_STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 items-center text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
