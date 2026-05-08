import { useQuery } from '@tanstack/react-query';
import { useFiltersContext } from '@/context/FiltersContext';
import { fetchDashboard } from '@/lib/api';
import { formatINR } from '@/lib/calculations';
import FilteredKpiCard from '@/components/FilteredKpiCard';
import StatusBadge from '@/components/StatusBadge';
import OverdueBadge from '@/components/OverdueBadge';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { filters, activeCount } = useFiltersContext();
  const isFiltered = activeCount > 0;

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', filters],
    queryFn: () => fetchDashboard(filters),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const d = data as any;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <FilteredKpiCard
          label="Orders"
          value={d?.ordersCount ?? 0}
          subLabel={isFiltered ? `of ${d?.ordersCountAll ?? 0} total` : undefined}
          filtered={isFiltered}
        />
        <FilteredKpiCard
          label="Revenue"
          value={formatINR(d?.ordersTotal ?? 0)}
          subLabel={isFiltered ? `of ${formatINR(d?.ordersTotalAll ?? 0)} total` : undefined}
          filtered={isFiltered}
        />
        <FilteredKpiCard
          label="Avg Order Value"
          value={formatINR(d?.avgOrderValue ?? 0)}
          filtered={isFiltered}
        />
        <FilteredKpiCard
          label="Outstanding"
          value={formatINR(d?.outstandingTotal ?? 0)}
          filtered={isFiltered}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue alerts */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Overdue Alerts</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {(d?.overdueAlerts ?? []).length === 0 ? (
              <p className="px-4 py-8 text-center text-gray-400 text-sm">No overdue accounts</p>
            ) : (
              (d?.overdueAlerts ?? []).map((alert: any) => (
                <div key={alert.customer_id} className={`px-4 py-3 flex items-center justify-between ${
                  alert.max_overdue_days >= 90 ? 'bg-red-50' :
                  alert.max_overdue_days >= 60 ? 'bg-orange-50' :
                  'bg-yellow-50'
                }`}>
                  <div>
                    <Link
                      to={`/customers/${alert.customer_id}`}
                      className="font-medium text-gray-900 hover:underline text-sm"
                    >
                      {alert.party_name}
                    </Link>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatINR(alert.total_pending)} pending
                    </div>
                  </div>
                  <OverdueBadge days={alert.max_overdue_days} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent orders */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Orders</h2>
            <Link to="/orders" className="text-xs text-blue-600 hover:underline">View all →</Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 text-left">PI #</th>
                <th className="px-4 py-2 text-left">Buyer</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(d?.recentOrders ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    No orders found
                  </td>
                </tr>
              ) : (
                (d?.recentOrders ?? []).map((o: any) => (
                  <tr key={o.order_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <Link to={`/orders/${o.order_id}`} className="text-blue-600 hover:underline font-medium">
                        {o.pi_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-700 truncate max-w-[140px]">{o.buyer_name}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatINR(o.total_amount)}</td>
                    <td className="px-4 py-2 text-center">
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
