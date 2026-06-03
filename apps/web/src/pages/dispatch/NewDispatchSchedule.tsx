import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fetchFinancialYears } from '@/lib/api';
import { useEligibleOrders, useCreateDispatchSchedule } from '@/hooks/useDispatchSchedules';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';

interface Line {
  order_id: string | null;
  po_number: string;
  po_received_date: string;
  customer_name: string;
  comments: string;
  tentative_date: string;
}

function emptyLine(): Line {
  return { order_id: null, po_number: '', po_received_date: '', customer_name: '', comments: '', tentative_date: '' };
}

export default function NewDispatchSchedule() {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: fyList = [] } = useQuery({ queryKey: ['financial-years'], queryFn: fetchFinancialYears });
  const { data: eligibleRes } = useEligibleOrders();
  const createSchedule = useCreateDispatchSchedule();

  const currentFy: any = (fyList as any[]).find((f: any) => f.is_current) ?? (fyList as any[])[0];

  const [fyKey, setFyKey] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [productDescription, setProductDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (currentFy && fyKey === null) setFyKey(currentFy.fy_key);
  }, [currentFy, fyKey]);

  const eligibleOrders: any[] = eligibleRes?.data ?? [];

  const toggleOrder = (order: any) => {
    const id = order.order_id;
    if (selectedOrderIds.has(id)) {
      setSelectedOrderIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      setLines(prev => prev.filter(l => l.order_id !== id));
    } else {
      setSelectedOrderIds(prev => new Set(prev).add(id));
      setLines(prev => [...prev, {
        order_id: id,
        po_number: order.buyer_po_number ?? '',
        po_received_date: order.buyer_order_date ? String(order.buyer_order_date).slice(0, 10) : '',
        customer_name: order.buyer_name ?? '',
        comments: order.packing_description ?? '',
        tentative_date: '',
      }]);
    }
  };

  const addManualLine = () => setLines(prev => [...prev, emptyLine()]);

  const updateLine = (idx: number, field: keyof Line, value: string) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const removeLine = (idx: number) => {
    const line = lines[idx];
    if (line.order_id) setSelectedOrderIds(prev => { const n = new Set(prev); n.delete(line.order_id!); return n; });
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    const errs: string[] = [];
    if (!fyKey) errs.push('Select a financial year');
    if (!dateFrom) errs.push('Date from is required');
    if (!dateTo) errs.push('Date to is required');
    if (lines.length === 0) errs.push('Add at least one line');
    if (errs.length) { setErrors(errs); return; }

    try {
      const result = await createSchedule.mutateAsync({
        fy_key: fyKey,
        date_from: dateFrom,
        date_to: dateTo,
        product_description: productDescription || null,
        notes: notes || null,
        lines: lines.map(l => ({
          order_id: l.order_id || null,
          po_number: l.po_number || null,
          po_received_date: l.po_received_date || null,
          customer_name: l.customer_name || null,
          comments: l.comments || null,
          tentative_date: l.tentative_date || null,
        })),
      });
      navigate(`/dispatch/schedules/${(result as any).schedule_id}`);
    } catch (err: any) {
      setErrors([err?.message ?? 'Failed to create schedule']);
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/dispatch/schedules')} className="text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">New Dispatch Schedule</h1>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {/* Header fields */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Schedule Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Financial Year</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              value={fyKey ?? ''}
              onChange={e => setFyKey(Number(e.target.value))}
            >
              {(fyList as any[]).map((f: any) => (
                <option key={f.fy_key} value={f.fy_key}>{f.fy_label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date From</label>
            <input type="date" className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date To</label>
            <input type="date" className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="col-span-2 md:col-span-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Product / Description Header</label>
            <input type="text" className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="e.g. SODIUM HYDROSULPHITE / DECOLITE / DECOLIN-DS & OTHER DESPATCH SCHEDULE"
              value={productDescription} onChange={e => setProductDescription(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Eligible orders */}
      {eligibleOrders.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Pending 'Sent to Factory' Orders ({eligibleOrders.length})
          </h2>
          <p className="text-xs text-gray-500 mb-3">Select orders to include in this schedule.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-8"></th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">PI No.</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Buyer PO No.</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">PO Date</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Customer</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Packing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {eligibleOrders.map((o: any) => (
                  <tr
                    key={o.order_id}
                    className={`cursor-pointer ${selectedOrderIds.has(o.order_id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    onClick={() => toggleOrder(o)}
                  >
                    <td className="px-3 py-2">
                      <input type="checkbox" readOnly checked={selectedOrderIds.has(o.order_id)} className="rounded" />
                    </td>
                    <td className="px-3 py-2 font-medium text-blue-700">{o.pi_number}</td>
                    <td className="px-3 py-2 text-gray-700">{o.buyer_po_number ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {o.buyer_order_date ? String(o.buyer_order_date).slice(0, 10).split('-').reverse().join('/') : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{o.buyer_name}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-xs truncate">{o.packing_description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lines editor */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Schedule Lines ({lines.length})</h2>
          <button
            onClick={addManualLine}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            <Plus className="w-4 h-4" /> Add manual row
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Select orders above or add manual rows.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-2 py-2 font-medium text-gray-600 w-6">#</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">PO Number</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">PO Recd. Date</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Customer</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Comments / Packing</th>
                  <th className="text-left px-2 py-2 font-medium text-gray-600">Tentative Date</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="px-2 py-2 text-gray-500">{idx + 1}</td>
                    <td className="px-2 py-1">
                      <input type="text" className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                        value={line.po_number} onChange={e => updateLine(idx, 'po_number', e.target.value)} />
                    </td>
                    <td className="px-2 py-1">
                      <input type="date" className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                        value={line.po_received_date} onChange={e => updateLine(idx, 'po_received_date', e.target.value)} />
                    </td>
                    <td className="px-2 py-1">
                      <input type="text" className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                        value={line.customer_name} onChange={e => updateLine(idx, 'customer_name', e.target.value)} />
                    </td>
                    <td className="px-2 py-1">
                      <textarea className="w-full border border-gray-200 rounded px-2 py-1 text-sm resize-none"
                        rows={2} value={line.comments} onChange={e => updateLine(idx, 'comments', e.target.value)} />
                    </td>
                    <td className="px-2 py-1">
                      <input type="date" className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                        value={line.tentative_date} onChange={e => updateLine(idx, 'tentative_date', e.target.value)} />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button onClick={() => removeLine(idx)} className="text-gray-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={() => navigate('/dispatch/schedules')} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={createSchedule.isPending}
          className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {createSchedule.isPending ? 'Creating…' : 'Create Schedule'}
        </button>
      </div>
    </div>
  );
}
