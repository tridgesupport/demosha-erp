import { useNavigate } from 'react-router-dom';
import { useFiltersContext } from '@/context/FiltersContext';
import { useOutstanding, useOutstandingSummary } from '@/hooks/useFinance';
import { formatINR } from '@/lib/calculations';
import OverdueBadge from '@/components/OverdueBadge';

export default function SundryDebtors() {
  const { filters } = useFiltersContext();
  const navigate = useNavigate();
  const { data: summary } = useOutstandingSummary('debtor');
  const { data: rows = [], isLoading } = useOutstanding('debtor', filters);
  const s = summary as any;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Sundry Debtors</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Pending', value: s?.total_pending ?? 0, color: 'bg-blue-50' },
          { label: '90+ Days', value: s?.bucket_90plus ?? 0, color: 'bg-red-50' },
          { label: '60–89 Days', value: s?.bucket_60_89 ?? 0, color: 'bg-orange-50' },
          { label: '30–59 Days', value: s?.bucket_30_59 ?? 0, color: 'bg-yellow-50' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-lg border border-gray-200 p-4 ${color}`}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className="text-xl font-bold mt-1">{formatINR(value)}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 text-left">Party Name</th>
                <th className="px-4 py-2 text-left">GSTIN</th>
                <th className="px-4 py-2 text-right">Bills</th>
                <th className="px-4 py-2 text-right">Total Pending</th>
                <th className="px-4 py-2 text-center">Max Overdue</th>
                <th className="px-4 py-2 text-right">90+ Days</th>
                <th className="px-4 py-2 text-right">60–89 Days</th>
                <th className="px-4 py-2 text-right">30–59 Days</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-4 py-3">
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  </td></tr>
                ))
              ) : (rows as any[]).length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No outstanding records</td></tr>
              ) : (
                (rows as any[]).map((r) => {
                  const rowBg = r.max_overdue_days >= 90 ? 'bg-red-50' : r.max_overdue_days >= 60 ? 'bg-orange-50' : r.max_overdue_days >= 30 ? 'bg-yellow-50' : '';
                  return (
                    <tr key={r.customer_id}
                      className={`hover:bg-blue-50 cursor-pointer ${rowBg}`}
                      onClick={() => navigate(`/customers/${r.customer_id}`)}>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{r.party_name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{r.gstin ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right">{r.bill_count}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatINR(r.total_pending)}</td>
                      <td className="px-4 py-2.5 text-center"><OverdueBadge days={r.max_overdue_days} /></td>
                      <td className="px-4 py-2.5 text-right text-red-600">{formatINR(r.overdue_90_plus)}</td>
                      <td className="px-4 py-2.5 text-right text-orange-600">{formatINR(r.overdue_60_89)}</td>
                      <td className="px-4 py-2.5 text-right text-yellow-600">{formatINR(r.overdue_30_59)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
