import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFiltersContext } from '@/context/FiltersContext';
import { useCustomers } from '@/hooks/useCustomers';
import { formatINR } from '@/lib/calculations';
import OverdueBadge from '@/components/OverdueBadge';

export default function CustomersList() {
  const { filters } = useFiltersContext();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useCustomers(filters, undefined, page);
  const rows: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  const displayed = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (c) =>
        c.party_name?.toLowerCase().includes(q) ||
        c.gstin?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
      </div>

      <input
        type="text"
        placeholder="Search by name or GSTIN…"
        className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 text-left">Party Name</th>
                <th className="px-4 py-2 text-left">GSTIN</th>
                <th className="px-4 py-2 text-left">State</th>
                <th className="px-4 py-2 text-right">Total Pending</th>
                <th className="px-4 py-2 text-center">Overdue</th>
                <th className="px-4 py-2 text-right">Orders</th>
                <th className="px-4 py-2 text-left">Last Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse" /></td></tr>
                ))
              ) : displayed.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No customers found</td></tr>
              ) : (
                displayed.map((c) => (
                  <tr
                    key={c.customer_id}
                    className="hover:bg-blue-50 cursor-pointer"
                    onClick={() => navigate(`/customers/${c.customer_id}`)}
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-800">{c.party_name}</td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{c.gstin ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{c.state_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatINR(c.total_pending)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {c.max_overdue_days > 0 ? <OverdueBadge days={c.max_overdue_days} /> : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{c.total_orders}</td>
                    <td className="px-4 py-2.5 text-gray-500">{c.last_order_date ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between text-sm">
            <span className="text-gray-500">{total} customers</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-white">← Prev</button>
              <span className="px-3 py-1">Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-white">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
