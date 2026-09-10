import { Fragment, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { Download, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useDispatchSchedule, useUpdateDispatchScheduleOrder } from '@/hooks/useDispatchSchedules';
import { fetchDispatchScheduleSplits } from '@/lib/api';
import { formatINR } from '@/lib/calculations';
import { useAuth } from '@/context/AuthContext';
import DispatchSchedulePdf from '@/components/DispatchSchedulePdf';
import DispatchScheduleSplitPanel from '@/components/DispatchScheduleSplitPanel';

export default function DispatchSchedulesList() {
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch, isRefetching } = useDispatchSchedule();
  const updateOrder = useUpdateDispatchScheduleOrder();
  const pdfRef = useRef<HTMLDivElement>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exportRows, setExportRows] = useState<any[]>([]);

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const orders: any[] = data?.data ?? [];

  const toggle = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    setSelected(prev => prev.size === orders.length ? new Set() : new Set(orders.map(o => o.order_id)));
  };

  const selectedOrders = useMemo(
    () => orders.filter(o => selected.has(o.order_id)),
    [orders, selected]
  );

  const saveField = (orderId: string, field: 'dispatch_tentative_date' | 'dispatch_remark', value: string) => {
    setSaveError(null);
    updateOrder.mutate({ orderId, body: { [field]: value || null } }, {
      onError: (err: any) => setSaveError(err?.message ?? 'Failed to save'),
    });
  };

  const generatePdf = async () => {
    if (selectedOrders.length === 0) return;
    setGeneratingPdf(true);
    try {
      // Orders that were split in this tab export one row per split
      // (labeled D1, D2, ...) instead of the order's own single row, so
      // the printed schedule reflects the planned batches.
      const rows: any[] = [];
      for (const o of selectedOrders) {
        if (o.split_count > 0) {
          const { splits } = await fetchDispatchScheduleSplits(o.order_id);
          for (const s of splits) {
            rows.push({
              ...o,
              dispatch_tentative_date: s.tentative_date,
              dispatch_remark: `(${o.pi_number}-D${s.split_number}) ${s.remark ?? ''}`.trim(),
            });
          }
        } else {
          rows.push(o);
        }
      }
      setExportRows(rows);
      // Give the hidden PDF target a moment to re-render with exportRows
      // before html2canvas snapshots it.
      await new Promise(r => setTimeout(r, 50));
      if (!pdfRef.current) return;
      pdfRef.current.style.display = 'block';
      const canvas = await html2canvas(pdfRef.current, { scale: 2, useCORS: true, allowTaint: false, logging: false });
      pdfRef.current.style.display = 'none';
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const imgW = 210;
      const imgH = (canvas.height * imgW) / canvas.width;
      const pageH = 297;
      if (imgH > pageH) {
        let y = 0;
        while (y < imgH) {
          if (y > 0) pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, -y, imgW, imgH);
          y += pageH;
        }
      } else {
        pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);
      }
      pdf.save(`dispatch_schedule_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } finally {
      if (pdfRef.current) pdfRef.current.style.display = 'none';
      setGeneratingPdf(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dispatch Schedule</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Every order Sent to Factory shows up here automatically. Fill in a tentative date and remark, then export the selected orders as a PDF.
          </p>
        </div>
        <button
          onClick={generatePdf}
          disabled={selectedOrders.length === 0 || generatingPdf}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {generatingPdf ? 'Generating…' : `Export PDF (${selectedOrders.length})`}
        </button>
      </div>

      {isError && (
        <div className="flex items-start justify-between gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Couldn't load the dispatch schedule: {(error as any)?.message ?? 'Unknown error'}</span>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="shrink-0 px-3 py-1 border border-red-300 rounded text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {isRefetching ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {saveError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Couldn't save: {saveError}</span>
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-400 text-sm py-10 text-center">Loading…</div>
      ) : isError ? null : orders.length === 0 ? (
        <div className="text-gray-400 text-sm py-10 text-center">No orders Sent to Factory right now.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" className="rounded" checked={orders.length > 0 && selected.size === orders.length} onChange={toggleAll} />
                  </th>
                  <th className="px-1 py-3 w-6"></th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">PI No.</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Buyer PO No.</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Product / Packing</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Qty (kg)</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Amount</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Tentative Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o: any) => (
                  <Fragment key={o.order_id}>
                    <tr className={selected.has(o.order_id) ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3">
                        <input type="checkbox" className="rounded" checked={selected.has(o.order_id)} onChange={() => toggle(o.order_id)} />
                      </td>
                      <td className="px-1 py-3">
                        <button onClick={() => toggleExpanded(o.order_id)} className="text-gray-400 hover:text-gray-700" title="Splits">
                          {expanded.has(o.order_id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/orders/${o.order_id}`} className="text-blue-600 font-medium hover:underline">
                          {o.pi_number}
                        </Link>
                        {o.split_count > 0 && (
                          <span className="ml-1.5 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-1.5 py-0.5">
                            {o.split_count} split{o.split_count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{o.buyer_po_number ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{o.buyer_name}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs truncate" title={o.packing_description}>{o.packing_description ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{o.total_qty_kg != null ? Number(o.total_qty_kg).toLocaleString('en-IN') : '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatINR(o.total_amount)}</td>
                      <td className="px-4 py-1">
                        <input
                          type="date"
                          className="border border-gray-300 rounded px-2 py-1 text-sm w-36"
                          defaultValue={o.dispatch_tentative_date ? String(o.dispatch_tentative_date).slice(0, 10) : ''}
                          onBlur={e => saveField(o.order_id, 'dispatch_tentative_date', e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-1">
                        <input
                          type="text"
                          className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
                          placeholder="Remark"
                          defaultValue={o.dispatch_remark ?? ''}
                          onBlur={e => saveField(o.order_id, 'dispatch_remark', e.target.value)}
                        />
                      </td>
                    </tr>
                    {expanded.has(o.order_id) && (
                      <tr>
                        <td colSpan={10} className="p-0">
                          <DispatchScheduleSplitPanel orderId={o.order_id} piNumber={o.pi_number} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hidden PDF render target */}
      <div ref={pdfRef} style={{ display: 'none', position: 'fixed', top: 0, left: 0, zIndex: -1 }}>
        <DispatchSchedulePdf
          orders={exportRows}
          generatedOn={format(new Date(), 'yyyy-MM-dd')}
          approverName={user?.name}
          approverSignatureUrl={user?.signature_url}
        />
      </div>
    </div>
  );
}
