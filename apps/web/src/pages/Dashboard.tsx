import { useQuery } from '@tanstack/react-query';
import { useFiltersContext } from '@/context/FiltersContext';
import { fetchDashboard } from '@/lib/api';
import { formatINR } from '@/lib/calculations';
import FilteredKpiCard from '@/components/FilteredKpiCard';
import StatusBadge from '@/components/StatusBadge';
import OverdueBadge from '@/components/OverdueBadge';
import { Link } from 'react-router-dom';

const INDENT_STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-amber-100 text-amber-700',
  approved: 'bg-purple-100 text-purple-700',
  po_raised: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};
const INDENT_STATUS_LABELS: Record<string, string> = {
  submitted: 'Approval Pending',
  approved: 'Approved',
  po_raised: 'PO Raised',
  cancelled: 'Cancelled',
};

const PO_STATUS_COLORS: Record<string, string> = {
  pending_approval: 'bg-amber-100 text-amber-700',
  draft: 'bg-amber-100 text-amber-700',
  sent: 'bg-amber-100 text-amber-700',
  approved: 'bg-indigo-100 text-indigo-700',
  sent_to_vendor: 'bg-orange-100 text-orange-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};
const PO_STATUS_LABELS: Record<string, string> = {
  pending_approval: 'Approval Pending',
  draft: 'Approval Pending',
  sent: 'Approval Pending',
  approved: 'Approved',
  sent_to_vendor: 'Sent to Vendor',
  received: 'Received',
  cancelled: 'Cancelled',
};

function fmtRelative(ts: string | null): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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
        {/* Recent Indents */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Indents</h2>
            <Link to="/purchase/indents" className="text-xs text-blue-600 hover:underline">View all →</Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 text-left">Indent #</th>
                <th className="px-4 py-2 text-left">For</th>
                <th className="px-4 py-2 text-center">Status</th>
                <th className="px-4 py-2 text-right">Changed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(d?.recentIndents ?? []).length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No indents yet</td></tr>
              ) : (d?.recentIndents ?? []).map((r: any) => (
                <tr key={r.indent_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link to={`/purchase/indents/${r.indent_id}`} className="text-blue-600 hover:underline font-medium">
                      {r.indent_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-600 truncate max-w-[120px]">{r.indent_for ?? '—'}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${INDENT_STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {INDENT_STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-gray-400">
                    {fmtRelative(r.status_changed_at ?? r.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent Purchase Orders */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Purchase Orders</h2>
            <Link to="/purchase/orders" className="text-xs text-blue-600 hover:underline">View all →</Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 text-left">PO #</th>
                <th className="px-4 py-2 text-left">Supplier</th>
                <th className="px-4 py-2 text-center">Status</th>
                <th className="px-4 py-2 text-right">Changed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(d?.recentPOs ?? []).length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No purchase orders yet</td></tr>
              ) : (d?.recentPOs ?? []).map((r: any) => (
                <tr key={r.order_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link to={`/purchase/orders/${r.order_id}`} className="text-blue-600 hover:underline font-medium">
                      {r.po_number}
                    </Link>
                    {r.revision_number > 0 && (
                      <span className="ml-1 inline-flex px-1 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-800">R{r.revision_number}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-600 truncate max-w-[120px]">{r.supplier_name ?? '—'}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PO_STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {PO_STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-gray-400">
                    {fmtRelative(r.status_changed_at ?? r.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
