import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePurchaseIndents } from '@/hooks/usePurchaseIndents';
import StatusBadge from '@/components/StatusBadge';
import { Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchFinancialYears } from '@/lib/api';

const INDENT_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Approval Pending',
  approved: 'Approved',
  po_raised: 'PO Raised',
  cancelled: 'Cancelled',
};

type SortKey = 'indent_number' | 'indent_date' | 'indent_for' | 'status';

export default function IndentsList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('indent_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: fyList = [] } = useQuery({ queryKey: ['financial-years'], queryFn: fetchFinancialYears });
  const currentFy: any = (fyList as any[]).find((f: any) => f.is_current) ?? (fyList as any[])[0];
  const [fyKey, setFyKey] = useState<number | null>(null);

  const { data, isLoading } = usePurchaseIndents({ fyKey: fyKey ?? currentFy?.fy_key, page });
  const rows: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  const displayed = [...rows]
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
        <h1 className="text-2xl font-bold text-gray-900">Indents</h1>
        <button
          onClick={() => navigate('/purchase/indents/new')}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> New Indent
        </button>
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

      {isLoading ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
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
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No indents found</td></tr>
              ) : displayed.map((row) => (
                <tr
                  key={row.indent_id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/purchase/indents/${row.indent_id}`)}
                >
                  <td className="px-4 py-3 font-medium text-blue-600">{row.indent_number}</td>
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
