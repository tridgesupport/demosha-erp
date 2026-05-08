import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFiltersContext } from '@/context/FiltersContext';
import { useOrders } from '@/hooks/useOrders';
import { formatINR } from '@/lib/calculations';
import StatusBadge from '@/components/StatusBadge';
import { Plus, Download, ChevronUp, ChevronDown } from 'lucide-react';

type SortKey = 'pi_number' | 'order_date' | 'buyer_name' | 'agent_name' | 'total_amount' | 'status';

export default function OrdersList() {
  const { filters } = useFiltersContext();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('order_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading } = useOrders(filters, page);
  const rows: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  const displayed = useMemo(() => {
    let r = rows;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((o) =>
        o.pi_number?.toLowerCase().includes(q) ||
        o.buyer_name?.toLowerCase().includes(q)
      );
    }
    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const exportCsv = () => {
    const headers = ['PI#', 'FY', 'Date', 'Buyer', 'Consignee', 'Agent', 'Total (INR)', 'Status', 'Lines'];
    const csvRows = [
      headers.join(','),
      ...displayed.map((o) =>
        [
          o.pi_number, o.fy_label, o.order_date, `"${o.buyer_name}"`, `"${o.consignee_name}"`,
          `"${o.agent_name}"`, o.total_amount, o.status, o.line_count,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'orders.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sales Orders</h1>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <Link to="/orders/new" className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Pro Forma
          </Link>
        </div>
      </div>

      <div>
        <input
          type="text"
          placeholder="Search by PI# or buyer name…"
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                {([
                  ['pi_number', 'PI #'],
                  ['order_date', 'Date'],
                  ['buyer_name', 'Buyer'],
                  ['consignee_name', 'Consignee'],
                  ['agent_name', 'Agent'],
                  ['total_amount', 'Total (INR)'],
                  ['status', 'Status'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    className="px-4 py-2 text-left cursor-pointer hover:text-gray-700 select-none"
                    onClick={() => toggleSort(key)}
                  >
                    {label} <SortIcon col={key} />
                  </th>
                ))}
                <th className="px-4 py-2 text-right">Lines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-3">
                      <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No orders found
                  </td>
                </tr>
              ) : (
                displayed.map((o) => (
                  <tr
                    key={o.order_id}
                    className="hover:bg-blue-50 cursor-pointer"
                    onClick={() => navigate(`/orders/${o.order_id}`)}
                  >
                    <td className="px-4 py-2.5 font-medium text-blue-600">{o.pi_number}</td>
                    <td className="px-4 py-2.5 text-gray-600">{o.order_date ? String(o.order_date).slice(0, 10) : '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{o.buyer_name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{o.consignee_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{o.agent_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatINR(o.total_amount)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{o.line_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between text-sm">
            <span className="text-gray-500">{total} total orders</span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-white"
              >
                ← Prev
              </button>
              <span className="px-3 py-1 text-gray-600">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-white"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
