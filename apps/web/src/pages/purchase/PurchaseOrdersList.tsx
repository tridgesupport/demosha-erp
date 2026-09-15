import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePurchaseOrders, usePurchaseOrder } from '@/hooks/usePurchaseOrders';
import { Plus, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchFinancialYears } from '@/lib/api';
import { useCanWrite } from '@/context/AuthContext';

const PO_STATUSES = ['draft', 'sent', 'approved', 'sent_to_vendor', 'dispatched_by_supplier', 'received', 'cancelled'];

const PO_STATUS_LABELS: Record<string, string> = {
  draft: 'Approval Pending',
  sent: 'Approval Pending',
  pending_approval: 'Approval Pending',
  approved: 'Approved',
  sent_to_vendor: 'Sent to Vendor',
  dispatched_by_supplier: 'Dispatched by Supplier',
  received: 'Received',
  cancelled: 'Cancelled',
};

const PO_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-700',
  sent: 'bg-amber-100 text-amber-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-indigo-100 text-indigo-700',
  sent_to_vendor: 'bg-orange-100 text-orange-700',
  dispatched_by_supplier: 'bg-cyan-100 text-cyan-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

type SortKey = 'po_number' | 'order_date' | 'supplier_name' | 'total_qty' | 'total_amount' | 'status';

// Expanded-row detail: fetched on demand (only while this row is expanded)
// rather than upfront for every row in the list.
function PoLinesExpansion({ orderId }: { orderId: string }) {
  const { data: order, isLoading } = usePurchaseOrder(orderId);
  const lines: any[] = order?.lines ?? [];
  return (
    <tr>
      <td colSpan={20} className="px-0 py-0 bg-gray-50/70">
        {isLoading ? (
          <div className="px-8 py-3 text-xs text-gray-400">Loading line items…</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-gray-400">
              <tr>
                <th className="px-8 py-1.5 text-left font-medium">Item</th>
                <th className="px-4 py-1.5 text-right font-medium w-28">Qty</th>
                <th className="px-4 py-1.5 text-right font-medium w-32">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.length === 0 ? (
                <tr><td colSpan={3} className="px-8 py-2 text-gray-400">No line items</td></tr>
              ) : lines.map((l: any) => (
                <tr key={l.line_id}>
                  <td className="px-8 py-1.5 whitespace-pre-wrap">{l.description}</td>
                  <td className="px-4 py-1.5 text-right">{Number(l.quantity).toLocaleString('en-IN')} {l.unit}</td>
                  <td className="px-4 py-1.5 text-right font-medium">
                    ₹{Number(l.line_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}

export default function PurchaseOrdersList() {
  const navigate = useNavigate();
  const canWrite = useCanWrite('purchase', '/purchase/orders');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('order_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: fyList = [] } = useQuery({ queryKey: ['financial-years'], queryFn: fetchFinancialYears });
  const currentFy: any = (fyList as any[]).find((f: any) => f.is_current) ?? (fyList as any[])[0];
  const [fyKey, setFyKey] = useState<number | null>(null);
  // Default to the current financial year as soon as it's known, rather
  // than relying on a fallback at query time — that left a brief window on
  // first load where the list query went out with no FY filter at all.
  useEffect(() => { if (currentFy && fyKey === null) setFyKey(currentFy.fy_key); }, [currentFy]);

  const { data, isLoading } = usePurchaseOrders({ fyKey: fyKey ?? currentFy?.fy_key, page });
  const rows: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  const displayed = [...rows]
    .filter((r) => {
      if (status && r.status !== status) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return r.po_number?.toLowerCase().includes(q) || r.supplier_name?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let av: string | number = a[sortKey] ?? '';
      let bv: string | number = b[sortKey] ?? '';
      if (sortKey === 'total_qty' || sortKey === 'total_amount') {
        av = Number(av) || 0;
        bv = Number(bv) || 0;
      }
      const cmp = typeof av === 'number'
        ? (av as number) - (bv as number)
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
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
        {canWrite && (
          <button
            onClick={() => navigate('/purchase/orders/new')}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> New PO
          </button>
        )}
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
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {PO_STATUSES.map((s) => <option key={s} value={s}>{PO_STATUS_LABELS[s] ?? s}</option>)}
        </select>
        {status && (
          <button onClick={() => setStatus('')} className="text-xs text-gray-500 hover:text-red-600 underline">
            Clear status
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-2 py-3 w-6"></th>
                {[
                  { key: 'po_number', label: 'PO # / Rev' },
                  { key: 'order_date', label: 'Date' },
                  { key: 'supplier_name', label: 'Supplier' },
                  { key: null, label: 'Indent #' },
                  { key: null, label: 'Dept' },
                  { key: null, label: 'Lines' },
                  { key: 'total_qty', label: 'Total Qty' },
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
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No purchase orders found</td></tr>
              ) : displayed.map((row) => {
                const isOpen = expandedId === row.order_id;
                return (
                  <Fragment key={row.order_id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/purchase/orders/${row.order_id}`)}
                    >
                      <td className="px-2 py-3" onClick={(e) => { e.stopPropagation(); setExpandedId(isOpen ? null : row.order_id); }}>
                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      </td>
                      <td className="px-4 py-3 font-medium text-blue-600">
                        {row.po_number}
                        {row.revision_number > 0 && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-800">R{row.revision_number}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{row.order_date ? String(row.order_date).slice(0, 10) : '—'}</td>
                      <td className="px-4 py-3">{row.supplier_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{row.indent_number ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{row.dept ?? '—'}</td>
                      <td className="px-4 py-3">{row.line_count ?? 0}</td>
                      <td className="px-4 py-3 text-right">{Number(row.total_qty ?? 0).toLocaleString('en-IN')}</td>
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
                    {isOpen && <PoLinesExpansion orderId={row.order_id} />}
                  </Fragment>
                );
              })}
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
