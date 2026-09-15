import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFiltersContext } from '@/context/FiltersContext';
import { useCanWrite } from '@/context/AuthContext';
import { useOrders } from '@/hooks/useOrders';
import { fetchOrders, updateOrderStatus } from '@/lib/api';
import { formatINR } from '@/lib/calculations';
import { STATUSES, STATUS_LABELS } from '@/components/FilterBar';
import StatusBadge from '@/components/StatusBadge';
import CustomerCombobox from '@/components/CustomerCombobox';
import { Plus, Download, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';

// Server page-size cap (see GET /api/orders) — used to page through every
// matching row when exporting "all", not just what's on screen.
const EXPORT_PAGE_SIZE = 200;

type SortKey = 'pi_number' | 'order_date' | 'buyer_name' | 'agent_name' | 'total_amount' | 'status' | 'submitted_at';

// Bulk actions available from the list — each is the same PATCH
// /:id/status transition the Orders Detail page's own buttons trigger,
// applied to every selected row that's currently sitting in one of `from`.
// Rows in any other status are silently skipped (surfaced in the result
// summary) rather than blocking the whole batch.
// `id` disambiguates the two 'approved' actions (plain vs. self-approve) —
// `status` is what's actually sent to the API.
const BULK_ACTIONS: { id: string; status: string; label: string; from: string[]; selfApprove?: boolean; confirm?: string }[] = [
  { id: 'sent', status: 'sent', label: 'Send for Approval', from: ['draft'] },
  { id: 'approved', status: 'approved', label: 'Mark Approved', from: ['sent'] },
  { id: 'self_approved', status: 'approved', label: 'Self-Approve', from: ['sent'], selfApprove: true },
  { id: 'sent_to_factory', status: 'sent_to_factory', label: 'Send to Factory', from: ['approved'] },
  { id: 'dispatched', status: 'dispatched', label: 'Mark Dispatched', from: ['sent_to_factory', 'invoiced'] },
  { id: 'cancelled', status: 'cancelled', label: 'Cancel PI', from: ['draft', 'sent', 'approved', 'sent_to_factory'], confirm: 'Cancel the selected PI(s)?' },
];

export default function OrdersList() {
  const { filters, setFilter } = useFiltersContext();
  const canWrite = useCanWrite('sales', '/orders');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState<string | null>(null);
  const [selfApprovePrompt, setSelfApprovePrompt] = useState(false);
  const [bulkComment, setBulkComment] = useState('');
  // Local echo of filters.piNumber, debounced into the actual (URL-backed)
  // filter so every keystroke doesn't trigger its own request.
  const [piSearch, setPiSearch] = useState(filters.piNumber ?? '');
  const [sortKey, setSortKey] = useState<SortKey>('order_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const t = setTimeout(() => {
      if (piSearch !== (filters.piNumber ?? '')) setFilter('piNumber', piSearch || null);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piSearch]);

  // A filter change can easily leave the current page past the end of the
  // new (smaller) result set — reset to page 1 whenever any filter changes.
  useEffect(() => { setPage(1); }, [filters.piNumber, filters.customerId, filters.status, filters.dateFrom, filters.dateTo, filters.fyKey, filters.agentId, filters.piFrom, filters.piTo]);

  // Selection is scoped to whatever page/filters are on screen — carrying it
  // across a page turn or a filter change would silently apply bulk actions
  // to rows the user can no longer see.
  useEffect(() => { setSelectedIds(new Set()); }, [page, filters.piNumber, filters.customerId, filters.status, filters.dateFrom, filters.dateTo, filters.fyKey, filters.agentId, filters.piFrom, filters.piTo]);

  const { data, isLoading } = useOrders(filters, page);
  const rows: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportMenuOpen]);

  // PI#/Buyer/Status are all applied server-side now (see useOrders/filters)
  // — this just sorts whatever row set we're given, shared by the on-screen
  // table and both export paths so "current page" and "all" stay consistent.
  const sortRows = useCallback((r: any[]) => {
    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [sortKey, sortDir]);

  const displayed = useMemo(() => sortRows(rows), [rows, sortRows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleRow = (orderId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      return next;
    });
  };

  const allOnPageSelected = displayed.length > 0 && displayed.every((o) => selectedIds.has(o.order_id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        displayed.forEach((o) => next.delete(o.order_id));
        return next;
      }
      const next = new Set(prev);
      displayed.forEach((o) => next.add(o.order_id));
      return next;
    });
  };

  const selectedRows = useMemo(() => displayed.filter((o) => selectedIds.has(o.order_id)), [displayed, selectedIds]);

  // Applies one bulk transition to every selected row that's actually in a
  // status it can leave for `action.key` — mismatched rows (e.g. an already-
  // approved order sitting in a "Send for Approval" selection) are skipped
  // rather than failing the whole batch.
  const runBulkAction = async (action: typeof BULK_ACTIONS[number], comment?: string) => {
    const targets = selectedRows.filter((o) => action.from.includes(o.status));
    if (targets.length === 0) return;
    if (action.confirm && !confirm(`${action.confirm} (${targets.length} order${targets.length !== 1 ? 's' : ''})`)) return;
    setBulkRunning(action.id);
    try {
      const results = await Promise.allSettled(
        targets.map((o) => updateOrderStatus(o.order_id, action.status, comment))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSelectedIds(new Set());
      setSelfApprovePrompt(false);
      setBulkComment('');
      const skipped = selectedRows.length - targets.length;
      const parts = [`${targets.length - failed} order${targets.length - failed !== 1 ? 's' : ''} updated to "${STATUS_LABELS[action.status] ?? action.status}"`];
      if (failed > 0) parts.push(`${failed} failed`);
      if (skipped > 0) parts.push(`${skipped} skipped (wrong status)`);
      alert(parts.join(', ') + '.');
    } finally {
      setBulkRunning(null);
    }
  };

  const downloadCsv = (list: any[], filename: string) => {
    const headers = ['PI#', 'FY', 'Date', 'Buyer', 'Consignee', 'Agent', 'Total (INR)', 'Status', 'Updated', 'Lines'];
    const csvRows = [
      headers.join(','),
      ...list.map((o) =>
        [
          o.part_suffix ? `${o.pi_number}-${o.part_suffix}` : o.pi_number, o.fy_label, o.order_date, `"${o.buyer_name}"`, `"${o.consignee_name}"`,
          `"${o.agent_name}"`, o.total_amount, o.status,
          o.status_changed_at ? new Date(o.status_changed_at).toLocaleString() : '',
          o.line_count,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCurrentPage = () => {
    downloadCsv(displayed, 'orders_current_page.csv');
    setExportMenuOpen(false);
  };

  // Pages through every row matching the active filters (ignoring the
  // on-screen page), not just the ≤50 rows currently rendered.
  const exportAllMatching = async () => {
    setExportMenuOpen(false);
    setExporting({ done: 0, total: 0 });
    try {
      const first = await fetchOrders(filters, 1, EXPORT_PAGE_SIZE) as { data: any[]; total: number };
      let all = first.data ?? [];
      const grandTotal = first.total ?? all.length;
      setExporting({ done: all.length, total: grandTotal });
      const totalServerPages = Math.ceil(grandTotal / EXPORT_PAGE_SIZE);
      for (let p = 2; p <= totalServerPages; p++) {
        const res = await fetchOrders(filters, p, EXPORT_PAGE_SIZE) as { data: any[] };
        all = all.concat(res.data ?? []);
        setExporting({ done: all.length, total: grandTotal });
      }
      downloadCsv(sortRows(all), 'orders_all.csv');
    } finally {
      setExporting(null);
    }
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
          <div ref={exportMenuRef} className="relative">
            <button
              onClick={() => setExportMenuOpen((o) => !o)}
              disabled={!!exporting}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {exporting ? `Exporting… ${exporting.done}/${exporting.total || '?'}` : 'Export CSV'}
              {!exporting && <ChevronDown className="w-3 h-3" />}
            </button>
            {exportMenuOpen && (
              <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                <button
                  onClick={exportCurrentPage}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-800">Current page</span>
                  <span className="block text-xs text-gray-400">{displayed.length} row{displayed.length !== 1 ? 's' : ''} shown on screen</span>
                </button>
                <button
                  onClick={exportAllMatching}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-t border-gray-100"
                >
                  <span className="font-medium text-gray-800">All matching filters</span>
                  <span className="block text-xs text-gray-400">{total} row{total !== 1 ? 's' : ''} across every page</span>
                </button>
              </div>
            )}
          </div>
          {canWrite && (
            <Link to="/orders/new" className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              <Plus className="w-4 h-4" /> New Pro Forma
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">PI #</label>
          <input
            type="text"
            placeholder="Search PI #…"
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={piSearch}
            onChange={(e) => setPiSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Buyer</label>
          <CustomerCombobox
            className="w-56"
            value={filters.customerId ?? null}
            onChange={(c) => setFilter('customerId', c?.customer_id ?? null)}
            placeholder="All buyers"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Status</label>
          <select
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={filters.status?.[0] ?? ''}
            onChange={(e) => setFilter('status', e.target.value ? [e.target.value] : null)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
            ))}
          </select>
        </div>
        {(filters.piNumber || filters.customerId || filters.status?.length) ? (
          <button
            onClick={() => { setPiSearch(''); setFilter('piNumber', null); setFilter('customerId', null); setFilter('status', null); }}
            className="text-xs text-gray-500 hover:text-red-600 underline pb-2"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {canWrite && selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-blue-900">{selectedIds.size} selected</span>
          <div className="flex flex-wrap items-center gap-2">
            {BULK_ACTIONS.map((action) => {
              const applicable = selectedRows.filter((o) => action.from.includes(o.status)).length;
              const disabled = applicable === 0 || bulkRunning !== null;
              const danger = action.id === 'cancelled';
              return (
                <button
                  key={action.id}
                  onClick={() => (action.selfApprove ? setSelfApprovePrompt(true) : runBulkAction(action))}
                  disabled={disabled}
                  title={applicable === 0 ? `None of the selected orders are eligible for "${action.label}"` : `${action.label} (${applicable} eligible)`}
                  className={`px-3 py-1.5 border rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed ${
                    danger ? 'border-red-300 bg-white text-red-700 hover:bg-red-50' : 'border-blue-300 bg-white text-blue-800 hover:bg-blue-100'
                  }`}
                >
                  {bulkRunning === action.id ? 'Applying…' : `${action.label}${applicable > 0 ? ` (${applicable})` : ''}`}
                </button>
              );
            })}
          </div>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-blue-700 hover:underline ml-auto">
            Clear selection
          </button>

          {selfApprovePrompt && (() => {
            const selfApproveAction = BULK_ACTIONS.find((a) => a.id === 'self_approved')!;
            const eligible = selectedRows.filter((o) => selfApproveAction.from.includes(o.status)).length;
            return (
            <div className="w-full flex items-start gap-2 bg-white border border-amber-200 rounded p-3 mt-1">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-1 shrink-0" />
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Self-approve {eligible} order(s) — comment (optional)
                </label>
                <textarea
                  value={bulkComment}
                  onChange={(e) => setBulkComment(e.target.value)}
                  placeholder="Why are you self-approving these PIs? (optional)"
                  rows={2}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => runBulkAction(selfApproveAction, bulkComment.trim() || undefined)}
                    disabled={bulkRunning !== null}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 disabled:opacity-50"
                  >
                    {bulkRunning === 'self_approved' ? 'Applying…' : 'Confirm Self-Approval'}
                  </button>
                  <button
                    onClick={() => { setSelfApprovePrompt(false); setBulkComment(''); }}
                    disabled={bulkRunning !== null}
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
            );
          })()}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAll}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Select all on page"
                  />
                </th>
                {([
                  ['pi_number', 'PI #'],
                  ['order_date', 'Date'],
                  ['buyer_name', 'Buyer'],
                  ['consignee_name', 'Consignee'],
                  ['agent_name', 'Agent'],
                  ['total_amount', 'Total (INR)'],
                  ['status', 'Status'],
                  ['submitted_at', 'Status Date'],
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
                    <td colSpan={10} className="px-4 py-3">
                      <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                    No orders found
                  </td>
                </tr>
              ) : (
                displayed.map((o) => (
                  <tr
                    key={o.order_id}
                    className={`hover:bg-blue-50 cursor-pointer ${selectedIds.has(o.order_id) ? 'bg-blue-50/60' : ''}`}
                    onClick={() => navigate(`/orders/${o.order_id}`)}
                  >
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(o.order_id)}
                        onChange={() => toggleRow(o.order_id)}
                        aria-label={`Select ${o.pi_number}`}
                      />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-blue-600">
                      {o.pi_number}{o.part_suffix && <span className="text-purple-600">-{o.part_suffix}</span>}
                      {o.is_test && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 align-middle">TEST</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{o.order_date ? String(o.order_date).slice(0, 10) : '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{o.buyer_name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{o.consignee_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{o.agent_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatINR(o.total_amount)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">
                      {(() => {
                        // status_changed_at/by are recorded on every transition
                        // (added after older per-stage columns like
                        // submitted_at/approved_at) — prefer them since they
                        // cover every status including Sent to Factory,
                        // Dispatched and Cancelled; fall back to the older
                        // per-stage fields for rows updated before that.
                        const ts = o.status_changed_at ?? (
                          o.status === 'sent'            ? o.submitted_at  :
                          o.status === 'approved'        ? o.approved_at   :
                          o.status === 'sent_to_factory' ? o.approved_at   :
                          o.status === 'invoiced'        ? o.invoiced_at   :
                          o.status === 'dispatched'      ? o.dispatched_at :
                          o.submitted_at
                        );
                        const by = o.status_changed_by ?? (
                          o.status === 'sent'     ? o.submitted_by :
                          o.status === 'approved' || o.status === 'sent_to_factory' ? o.approved_by :
                          null
                        );
                        return ts ? (
                          <>
                            {new Date(ts).toLocaleString()}
                            {by && <span className="block text-gray-400">{by.split('@')[0]}</span>}
                          </>
                        ) : '—';
                      })()}
                    </td>
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
