import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePurchaseIndents } from '@/hooks/usePurchaseIndents';
import { updatePurchaseIndentStatus, reviseIndent } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchFinancialYears } from '@/lib/api';
import { useCanWrite } from '@/context/AuthContext';

const INDENT_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Approval Pending',
  approved: 'Approved',
  po_raised: 'PO Raised',
  cancelled: 'Cancelled',
};

type SortKey = 'indent_number' | 'indent_date' | 'indent_for' | 'status';

// Bulk actions available from the list. 'send'/'approve'/'raise_po'/'cancel'
// are the same PATCH /:id/status transition the Indent Detail page's own
// buttons trigger; 'revise' instead calls POST /:id/revise (creates a new
// revision rather than changing the selected row's own status). Rows not in
// `from` are silently skipped, surfaced in the result summary.
const BULK_ACTIONS: { id: string; label: string; from: string[]; confirm?: string }[] = [
  { id: 'send', label: 'Send for Approval', from: ['draft'] },
  { id: 'approve', label: 'Approve', from: ['submitted'] },
  { id: 'raise_po', label: 'Raise PO', from: ['approved'] },
  { id: 'revise', label: 'Revise', from: ['draft', 'submitted', 'approved', 'po_raised'] },
  { id: 'cancel', label: 'Cancel', from: ['draft', 'submitted'], confirm: 'Cancel the selected indent(s)?' },
];

const ACTION_STATUS: Record<string, string> = {
  send: 'submitted',
  approve: 'approved',
  raise_po: 'po_raised',
  cancel: 'cancelled',
};

export default function IndentsList() {
  const navigate = useNavigate();
  const canWrite = useCanWrite('purchase', '/purchase/indents');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('indent_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState<string | null>(null);

  const { data: fyList = [] } = useQuery({ queryKey: ['financial-years'], queryFn: fetchFinancialYears });
  const currentFy: any = (fyList as any[]).find((f: any) => f.is_current) ?? (fyList as any[])[0];
  const [fyKey, setFyKey] = useState<number | null>(null);

  const { data, isLoading } = usePurchaseIndents({ fyKey: fyKey ?? currentFy?.fy_key, page });
  const rows: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  // Selection is scoped to whatever page/filters are on screen — carrying it
  // across a page turn or a filter change would silently apply bulk actions
  // to rows the user can no longer see.
  useEffect(() => { setSelectedIds(new Set()); }, [page, fyKey, search]);

  const displayed = useMemo(() => [...rows]
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return r.indent_number?.toLowerCase().includes(q) || r.indent_for?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    }), [rows, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />
      : null;

  const toggleRow = (indentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(indentId)) next.delete(indentId); else next.add(indentId);
      return next;
    });
  };

  const allOnPageSelected = displayed.length > 0 && displayed.every((r) => selectedIds.has(r.indent_id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        displayed.forEach((r) => next.delete(r.indent_id));
        return next;
      }
      const next = new Set(prev);
      displayed.forEach((r) => next.add(r.indent_id));
      return next;
    });
  };

  const selectedRows = useMemo(() => displayed.filter((r) => selectedIds.has(r.indent_id)), [displayed, selectedIds]);

  const runBulkAction = async (action: typeof BULK_ACTIONS[number]) => {
    const targets = selectedRows.filter((r) => action.from.includes(r.status));
    if (targets.length === 0) return;
    if (action.confirm && !confirm(`${action.confirm} (${targets.length} indent${targets.length !== 1 ? 's' : ''})`)) return;
    setBulkRunning(action.id);
    try {
      const results = await Promise.allSettled(
        targets.map((r) => action.id === 'revise'
          ? reviseIndent(r.indent_id)
          : updatePurchaseIndentStatus(r.indent_id, ACTION_STATUS[action.id]))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      queryClient.invalidateQueries({ queryKey: ['purchase-indents'] });
      setSelectedIds(new Set());
      const skipped = selectedRows.length - targets.length;
      const parts = [`${targets.length - failed} indent${targets.length - failed !== 1 ? 's' : ''} ${action.id === 'revise' ? 'revised' : `updated to "${INDENT_STATUS_LABELS[ACTION_STATUS[action.id]] ?? action.label}"`}`];
      if (failed > 0) parts.push(`${failed} failed`);
      if (skipped > 0) parts.push(`${skipped} skipped (wrong status)`);
      alert(parts.join(', ') + '.');
    } finally {
      setBulkRunning(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Indents</h1>
        {canWrite && (
          <button
            onClick={() => navigate('/purchase/indents/new')}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> New Indent
          </button>
        )}
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <input
          type="text"
          placeholder="Search indent # or department..."
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

      {canWrite && selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-blue-900">{selectedIds.size} selected</span>
          <div className="flex flex-wrap items-center gap-2">
            {BULK_ACTIONS.map((action) => {
              const applicable = selectedRows.filter((r) => action.from.includes(r.status)).length;
              const disabled = applicable === 0 || bulkRunning !== null;
              const danger = action.id === 'cancel';
              return (
                <button
                  key={action.id}
                  onClick={() => runBulkAction(action)}
                  disabled={disabled}
                  title={applicable === 0 ? `None of the selected indents are eligible for "${action.label}"` : `${action.label} (${applicable} eligible)`}
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
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAll}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Select all on page"
                  />
                </th>
                {[
                  { key: 'indent_number', label: 'Indent #' },
                  { key: 'indent_date', label: 'Date' },
                  { key: 'indent_for', label: 'Department' },
                  { key: null, label: 'Lines' },
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
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No indents found</td></tr>
              ) : displayed.map((row) => (
                <tr
                  key={row.indent_id}
                  className={`hover:bg-gray-50 cursor-pointer ${selectedIds.has(row.indent_id) ? 'bg-blue-50/60' : ''}`}
                  onClick={() => navigate(`/purchase/indents/${row.indent_id}`)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.indent_id)}
                      onChange={() => toggleRow(row.indent_id)}
                      aria-label={`Select ${row.indent_number}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-blue-600">
                    {row.indent_number}
                    {row.revision_number > 0 && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-800">R{row.revision_number}</span>
                    )}
                    {row.is_test && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">TEST</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{row.indent_date ? String(row.indent_date).slice(0, 10) : '—'}</td>
                  <td className="px-4 py-3">{row.indent_for ?? '—'}</td>
                  <td className="px-4 py-3">{row.line_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                      ${row.status === 'draft' ? 'bg-gray-100 text-gray-700' : ''}
                      ${row.status === 'submitted' ? 'bg-amber-100 text-amber-700' : ''}
                      ${row.status === 'approved' ? 'bg-purple-100 text-purple-700' : ''}
                      ${row.status === 'po_raised' ? 'bg-green-100 text-green-700' : ''}
                      ${row.status === 'cancelled' ? 'bg-red-100 text-red-700' : ''}
                    `}>
                      {INDENT_STATUS_LABELS[row.status] ?? row.status}
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
