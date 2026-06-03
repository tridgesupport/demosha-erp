import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatchSchedules, useDeleteDispatchSchedule } from '@/hooks/useDispatchSchedules';
import { useAuth } from '@/context/AuthContext';
import { Plus, FileText, Trash2 } from 'lucide-react';

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  return String(d).slice(0, 10).split('-').reverse().join('/');
}

export default function DispatchSchedulesList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useDispatchSchedules(page);
  const deleteSchedule = useDeleteDispatchSchedule();
  const isFactory = user?.role === 'factory';

  const handleDelete = async (id: string, ref: string) => {
    if (!confirm(`Delete schedule ${ref}?`)) return;
    await deleteSchedule.mutateAsync(id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dispatch Schedules</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data?.total ?? 0} schedule{(data?.total ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        {isFactory && (
          <button
            onClick={() => navigate('/dispatch/schedules/new')}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Schedule
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm py-10 text-center">Loading…</div>
      ) : !data?.data?.length ? (
        <div className="text-gray-400 text-sm py-10 text-center">No dispatch schedules yet.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Ref</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Date From</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Date To</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Product / Description</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Lines</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Created By</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.data.map((s: any) => (
                <tr key={s.schedule_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/dispatch/schedules/${s.schedule_id}`} className="text-blue-600 font-medium hover:underline">
                      {s.schedule_ref}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{fmt(s.date_from)}</td>
                  <td className="px-4 py-3 text-gray-700">{fmt(s.date_to)}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{s.product_description ?? '—'}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{s.line_count}</td>
                  <td className="px-4 py-3 text-gray-500">{s.created_by}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {s.pdf_url && (
                        <a href={s.pdf_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600" title="View PDF">
                          <FileText className="w-4 h-4" />
                        </a>
                      )}
                      {isFactory && (
                        <button
                          onClick={() => handleDelete(s.schedule_id, s.schedule_ref)}
                          className="text-gray-400 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {(data?.total ?? 0) > 50 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-600">
              <span>Page {page}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border disabled:opacity-40">Prev</button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * 50 >= (data?.total ?? 0)} className="px-3 py-1 rounded border disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
