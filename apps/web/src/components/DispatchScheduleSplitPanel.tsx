import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  useDispatchScheduleSplits,
  useCreateDispatchScheduleSplit,
  useUpdateDispatchScheduleSplit,
  useDeleteDispatchScheduleSplit,
} from '@/hooks/useDispatchSchedules';

interface Props {
  orderId: string;
  piNumber: string;
}

// Planning-only splits for the Dispatch Schedule tab — same per-line
// qty/packages carve-out as the real dispatch split (Orders > Mark
// Dispatched), but stored separately so it never touches the real order.
// Each split is labeled PI-D1, PI-D2, ... purely for display here.
export default function DispatchScheduleSplitPanel({ orderId, piNumber }: Props) {
  const { data, isLoading } = useDispatchScheduleSplits(orderId);
  const createSplit = useCreateDispatchScheduleSplit(orderId);
  const updateSplit = useUpdateDispatchScheduleSplit(orderId);
  const deleteSplit = useDeleteDispatchScheduleSplit(orderId);

  const [adding, setAdding] = useState(false);
  const [qtyByLine, setQtyByLine] = useState<Record<string, { qty_kg: number; num_packages: number }>>({});
  const [tentativeDate, setTentativeDate] = useState('');
  const [remark, setRemark] = useState('');
  const [error, setError] = useState<string | null>(null);

  const lines: any[] = data?.lines ?? [];
  const splits: any[] = data?.splits ?? [];

  const remainingFor = (line: any) => {
    const allocated = splits.reduce((sum, s) => {
      const l = (s.lines ?? []).find((sl: any) => sl.order_line_id === line.line_id);
      return sum + (l ? Number(l.qty_kg) : 0);
    }, 0);
    return Math.max(0, Number(line.qty_kg) - allocated);
  };
  const remainingPkgsFor = (line: any) => {
    const allocated = splits.reduce((sum, s) => {
      const l = (s.lines ?? []).find((sl: any) => sl.order_line_id === line.line_id);
      return sum + (l ? Number(l.num_packages) : 0);
    }, 0);
    return Math.max(0, Number(line.num_packages) - allocated);
  };

  const startAdding = () => {
    const seed: Record<string, { qty_kg: number; num_packages: number }> = {};
    for (const l of lines) seed[l.line_id] = { qty_kg: remainingFor(l), num_packages: remainingPkgsFor(l) };
    setQtyByLine(seed);
    setTentativeDate('');
    setRemark('');
    setError(null);
    setAdding(true);
  };

  const saveSplit = async () => {
    setError(null);
    try {
      await createSplit.mutateAsync({
        tentative_date: tentativeDate || null,
        remark: remark || null,
        lines: lines.map(l => ({
          line_id: l.line_id,
          qty_kg: qtyByLine[l.line_id]?.qty_kg ?? 0,
          num_packages: qtyByLine[l.line_id]?.num_packages ?? 0,
        })).filter(l => l.qty_kg > 0),
      });
      setAdding(false);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create split');
    }
  };

  if (isLoading) return <div className="text-xs text-gray-400 py-2">Loading splits…</div>;

  return (
    <div className="bg-gray-50 border-t border-gray-200 px-4 py-3">
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}

      {splits.length > 0 && (
        <table className="w-full text-xs mb-2">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left font-medium pb-1">Split</th>
              <th className="text-left font-medium pb-1">Tentative Date</th>
              <th className="text-left font-medium pb-1">Remark</th>
              <th className="pb-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {splits.map((s) => (
              <tr key={s.split_id}>
                <td className="py-1 font-medium text-gray-700">{piNumber}-D{s.split_number}</td>
                <td className="py-1">
                  <input type="date" className="border border-gray-300 rounded px-1.5 py-0.5 text-xs"
                    defaultValue={s.tentative_date ? String(s.tentative_date).slice(0, 10) : ''}
                    onBlur={e => updateSplit.mutate({ splitId: s.split_id, body: { tentative_date: e.target.value || null, remark: s.remark } })} />
                </td>
                <td className="py-1">
                  <input type="text" className="border border-gray-300 rounded px-1.5 py-0.5 text-xs w-40"
                    defaultValue={s.remark ?? ''}
                    onBlur={e => updateSplit.mutate({ splitId: s.split_id, body: { tentative_date: s.tentative_date, remark: e.target.value || null } })} />
                </td>
                <td className="py-1 text-right">
                  <button onClick={() => deleteSplit.mutate(s.split_id)} className="text-gray-400 hover:text-red-600" title="Delete this split">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!adding ? (
        <button onClick={startAdding} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
          <Plus className="w-3.5 h-3.5" /> Add split
        </button>
      ) : (
        <div className="border border-blue-200 bg-blue-50 rounded p-2">
          <table className="w-full text-xs mb-2">
            <thead>
              <tr className="text-blue-800 uppercase">
                <th className="text-left pb-1">Description</th>
                <th className="text-right pb-1">Unclaimed (kg)</th>
                <th className="text-right pb-1">Qty for this split</th>
                <th className="text-right pb-1">Pkgs</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const remaining = remainingFor(l);
                const remainingPkgs = remainingPkgsFor(l);
                return (
                  <tr key={l.line_id}>
                    <td className="py-0.5">{l.full_description}</td>
                    <td className="text-right py-0.5 text-gray-500">{remaining}</td>
                    <td className="text-right py-0.5">
                      <input type="number" min={0} max={remaining} step="0.001"
                        value={qtyByLine[l.line_id]?.qty_kg ?? 0}
                        onChange={(e) => {
                          const qty_kg = parseFloat(e.target.value) || 0;
                          const scaledPkgs = remaining > 0 ? Math.round((qty_kg / remaining) * remainingPkgs) : 0;
                          setQtyByLine(prev => ({ ...prev, [l.line_id]: { qty_kg, num_packages: Math.min(remainingPkgs, Math.max(0, scaledPkgs)) } }));
                        }}
                        className="w-20 border border-gray-300 rounded px-1.5 py-0.5 text-right" />
                    </td>
                    <td className="text-right py-0.5">
                      <input type="number" min={0} max={remainingPkgs} step="1"
                        value={qtyByLine[l.line_id]?.num_packages ?? 0}
                        onChange={(e) => setQtyByLine(prev => ({ ...prev, [l.line_id]: { ...prev[l.line_id], num_packages: parseInt(e.target.value, 10) || 0 } }))}
                        className="w-16 border border-gray-300 rounded px-1.5 py-0.5 text-right" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center gap-2 mb-2">
            <input type="date" value={tentativeDate} onChange={e => setTentativeDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs" placeholder="Tentative date" />
            <input type="text" value={remark} onChange={e => setRemark(e.target.value)}
              placeholder="Remark" className="border border-gray-300 rounded px-2 py-1 text-xs flex-1" />
          </div>
          <div className="flex gap-2">
            <button onClick={saveSplit} disabled={createSplit.isPending}
              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50">
              {createSplit.isPending ? 'Saving…' : `Save as D${splits.length + 1}`}
            </button>
            <button onClick={() => setAdding(false)} className="px-3 py-1 border border-gray-300 text-xs rounded hover:bg-white">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
