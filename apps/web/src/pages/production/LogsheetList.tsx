import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, CheckSquare } from 'lucide-react';
import { useLogsheets, useBulkApproveLogsheets } from '@/hooks/useProduction';
import { useAuth } from '@/context/AuthContext';
import { getProductConfig } from '@/lib/productionFormConfigs';

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-amber-100 text-amber-700',
  submitted: 'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
};

const STATUS_LABELS: Record<string, string> = {
  draft:     'Draft',
  submitted: 'Ready for Approval',
  approved:  'Approved',
};

export default function LogsheetList() {
  const { productCode = '' } = useParams<{ productCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const code = productCode.toUpperCase();
  const config = getProductConfig(code);

  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');
  const [page, setPage]                 = useState(1);
  const [selected, setSelected]         = useState<Set<string>>(new Set());

  const { data, isLoading } = useLogsheets({ productCode: code, status: statusFilter, dateFrom, dateTo, page });
  const rows: any[]   = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages    = Math.ceil(total / 50);

  const bulkApprove = useBulkApproveLogsheets();
  const role = user?.role?.toLowerCase() ?? '';
  const canApprove = ['admin', 'manager', 'plant_incharge'].includes(role);

  const submittedRows = rows.filter(r => r.status === 'submitted');
  const allSubmittedSelected = submittedRows.length > 0 && submittedRows.every(r => selected.has(r.logsheet_id));

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllSubmitted() {
    if (allSubmittedSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(submittedRows.map(r => r.logsheet_id)));
    }
  }

  async function handleBulkApprove() {
    if (!selected.size) return;
    await bulkApprove.mutateAsync(Array.from(selected));
    setSelected(new Set());
  }

  if (!config) {
    return <div className="text-gray-400 py-16 text-center">Unknown product: {productCode}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{config.name} — Logsheets</h1>
          <p className="text-xs text-gray-400 mt-0.5">{config.formRef}</p>
        </div>
        <div className="flex gap-2">
          {canApprove && selected.size > 0 && (
            <button
              onClick={handleBulkApprove}
              disabled={bulkApprove.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
            >
              <CheckSquare className="w-4 h-4" />
              Approve Selected ({selected.size})
            </button>
          )}
          <button
            onClick={() => navigate(`/production/${productCode}/new`)}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> New Logsheet
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Ready for Approval</option>
          <option value="approved">Approved</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="From date" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="To date" />
        {(dateFrom || dateTo || statusFilter) && (
          <button onClick={() => { setStatusFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}
            className="text-xs text-gray-400 hover:text-gray-700">Clear filters</button>
        )}
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm py-8">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                {canApprove && (
                  <th className="px-3 py-3 text-center">
                    <input type="checkbox" checked={allSubmittedSelected} onChange={toggleAllSubmitted}
                      className="rounded" title="Select all ready-for-approval" />
                  </th>
                )}
                <th className="px-4 py-3 text-left">Logsheet No.</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Shift</th>
                <th className="px-4 py-3 text-left">Batch No.</th>
                <th className="px-4 py-3 text-left">Sections</th>
                <th className="px-4 py-3 text-left">Created By</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr><td colSpan={canApprove ? 8 : 7} className="px-4 py-8 text-center text-gray-400">No logsheets found</td></tr>
              ) : rows.map(row => (
                <tr
                  key={row.logsheet_id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/production/${productCode}/${row.logsheet_id}`)}
                >
                  {canApprove && (
                    <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                      {row.status === 'submitted' && (
                        <input type="checkbox" checked={selected.has(row.logsheet_id)}
                          onChange={() => toggleSelect(row.logsheet_id)} className="rounded" />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium text-blue-600">{row.logsheet_no}</td>
                  <td className="px-4 py-3">{row.log_date ? String(row.log_date).slice(0, 10) : '—'}</td>
                  <td className="px-4 py-3">{row.shift ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{row.batch_no ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {row.sections_filled ?? 0} / {config.sections.length}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{row.created_by ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[row.status] ?? row.status}
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
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
