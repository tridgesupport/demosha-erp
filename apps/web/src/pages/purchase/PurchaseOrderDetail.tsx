import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePurchaseOrder, useUpdatePurchaseOrderStatus } from '@/hooks/usePurchaseOrders';
import { useAuth } from '@/context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import PurchaseOrderPdf from '@/components/PurchaseOrderPdf';
import { uploadPoPdf, uploadApprovedPo } from '@/lib/api';
import { ArrowLeft, CheckCircle, Printer, Upload, ExternalLink, Truck, Package } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const STATUS_FLOW = ['draft', 'sent', 'approved', 'sent_to_vendor', 'received'];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent for Approval',
  approved: 'Approved',
  sent_to_vendor: 'Sent to Vendor',
  received: 'Received',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  approved: 'bg-indigo-100 text-indigo-700',
  sent_to_vendor: 'bg-orange-100 text-orange-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: order, isLoading } = usePurchaseOrder(id);
  const updateStatus = useUpdatePurchaseOrderStatus(id!);
  const printRef = useRef<HTMLDivElement>(null);

  const [confirming, setConfirming] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [grnInput, setGrnInput] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const role = user?.role?.toLowerCase() ?? '';
  const isManagerOrAdmin = ['admin', 'manager'].includes(role);

  const generatePdf = async (el: HTMLDivElement): Promise<Blob> => {
    el.style.display = 'block';
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: false, logging: false });
    el.style.display = 'none';
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
    return pdf.output('blob');
  };

  const handlePrint = async () => {
    if (!printRef.current) return;
    setGeneratingPdf(true);
    try {
      const blob = await generatePdf(printRef.current);
      const { url } = await uploadPoPdf(id!, blob, 'purchase_order.pdf');
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
      window.open(url ?? URL.createObjectURL(blob), '_blank');
    } catch {
      window.open(URL.createObjectURL(await generatePdf(printRef.current!)), '_blank');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleUploadApproved = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading('approved');
    try {
      await uploadApprovedPo(id!, file);
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
    } finally {
      setUploading(null);
    }
  };

  const requestStatus = (status: string) => {
    setPendingStatus(status);
    setConfirming(true);
  };

  const confirmStatus = async () => {
    if (!pendingStatus) return;
    await updateStatus.mutateAsync({ status: pendingStatus, grn_number: pendingStatus === 'received' ? grnInput : undefined });
    setConfirming(false);
    setPendingStatus(null);
    setGrnInput('');
  };

  const formatDate = (d: string | null) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
  const fmtINR = (v: number | null) => v != null
    ? `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';

  if (isLoading) return <div className="text-gray-400 text-sm p-8">Loading…</div>;
  if (!order) return <div className="text-red-500 p-8">Purchase order not found</div>;

  const lines: any[] = order.lines ?? [];
  const currentStepIdx = STATUS_FLOW.indexOf(order.status);

  const canSend         = order.status === 'draft';
  const canApprove      = order.status === 'sent' && isManagerOrAdmin;
  const canSendToVendor = order.status === 'approved';
  const canReceive      = order.status === 'sent_to_vendor';
  const canCancel       = ['draft', 'sent'].includes(order.status);

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">{order.po_number}</h1>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={handlePrint} disabled={generatingPdf}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-60">
            <Printer className="w-4 h-4" /> {generatingPdf ? 'Generating…' : 'Print PO'}
          </button>
          {order.po_pdf_url && (
            <a href={order.po_pdf_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50">
              <ExternalLink className="w-4 h-4" /> View PO PDF
            </a>
          )}
          {isManagerOrAdmin && (
            <label className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 cursor-pointer">
              <Upload className="w-4 h-4" /> {uploading === 'approved' ? 'Uploading…' : 'Upload Approved PO'}
              <input type="file" accept=".pdf" className="hidden" onChange={handleUploadApproved} />
            </label>
          )}
          {order.approved_po_url && (
            <a href={order.approved_po_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 border border-green-400 text-green-700 rounded text-sm hover:bg-green-50">
              <ExternalLink className="w-4 h-4" /> Approved PO
            </a>
          )}
        </div>
      </div>

      {/* Status flow bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-0">
          {STATUS_FLOW.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className={`flex flex-col items-center ${i <= currentStepIdx ? 'text-blue-600' : 'text-gray-300'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2
                  ${i < currentStepIdx ? 'bg-blue-600 border-blue-600 text-white' : i === currentStepIdx ? 'border-blue-600 text-blue-600' : 'border-gray-300 text-gray-300'}`}>
                  {i < currentStepIdx ? '✓' : i + 1}
                </div>
                <span className="text-xs mt-1 text-center whitespace-nowrap">{STATUS_LABELS[s]}</span>
              </div>
              {i < STATUS_FLOW.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${i < currentStepIdx ? 'bg-blue-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          {canSend && (
            <button onClick={() => requestStatus('sent')} disabled={updateStatus.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-60">
              <CheckCircle className="w-4 h-4" /> Submit for Approval
            </button>
          )}
          {canApprove && (
            <button onClick={() => requestStatus('approved')} disabled={updateStatus.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-60">
              <CheckCircle className="w-4 h-4" /> Approve PO
            </button>
          )}
          {canSendToVendor && (
            <button onClick={() => requestStatus('sent_to_vendor')} disabled={updateStatus.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 disabled:opacity-60">
              <Truck className="w-4 h-4" /> Mark Sent to Vendor
            </button>
          )}
          {canReceive && (
            <button onClick={() => requestStatus('received')} disabled={updateStatus.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-60">
              <Package className="w-4 h-4" /> Mark Received (GRN)
            </button>
          )}
          {canCancel && (
            <button onClick={() => requestStatus('cancelled')} disabled={updateStatus.isPending}
              className="px-3 py-1.5 border border-red-300 text-red-600 rounded text-sm hover:bg-red-50 disabled:opacity-60">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      {confirming && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80 space-y-4">
            <h3 className="font-semibold text-gray-900">
              {pendingStatus === 'received' ? 'Record GRN' : `Confirm: ${STATUS_LABELS[pendingStatus!]}`}
            </h3>
            {pendingStatus === 'received' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">GRN Number</label>
                <input type="text" value={grnInput} onChange={(e) => setGrnInput(e.target.value)}
                  placeholder="GRN #"
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" />
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={confirmStatus} disabled={updateStatus.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-60">
                Confirm
              </button>
              <button onClick={() => { setConfirming(false); setPendingStatus(null); }}
                className="flex-1 px-4 py-2 border rounded text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 grid grid-cols-3 gap-4 text-sm">
        <div><p className="text-xs text-gray-500 mb-0.5">Order Date</p><p className="font-medium">{formatDate(order.order_date)}</p></div>
        <div><p className="text-xs text-gray-500 mb-0.5">FY</p><p className="font-medium">{order.fy_label ?? order.fy_key}</p></div>
        <div><p className="text-xs text-gray-500 mb-0.5">Department</p><p className="font-medium">{order.dept ?? '—'}</p></div>
        <div><p className="text-xs text-gray-500 mb-0.5">Supplier</p><p className="font-medium">{order.supplier_name ?? '—'}</p></div>
        <div><p className="text-xs text-gray-500 mb-0.5">Indent No.</p>
          {order.indent_id
            ? <Link to={`/purchase/indents/${order.indent_id}`} className="text-blue-600 hover:underline font-medium">{order.indent_number ?? '—'}</Link>
            : <p className="font-medium">{order.indent_number ?? '—'}</p>}
        </div>
        <div><p className="text-xs text-gray-500 mb-0.5">Quotation Ref.</p><p className="font-medium">{order.quotation_ref ?? '—'}</p></div>
        <div><p className="text-xs text-gray-500 mb-0.5">Delivery Schedule</p><p className="font-medium">{order.delivery_schedule ?? '—'}</p></div>
        <div><p className="text-xs text-gray-500 mb-0.5">Payment Terms</p><p className="font-medium">{order.payment_terms ?? '—'}</p></div>
        <div><p className="text-xs text-gray-500 mb-0.5">Freight Terms</p><p className="font-medium">{order.freight_terms ?? '—'}</p></div>
        {order.approved_by && <div><p className="text-xs text-gray-500 mb-0.5">Approved By</p><p className="font-medium">{order.approved_by}</p></div>}
        {order.grn_number && <div><p className="text-xs text-gray-500 mb-0.5">GRN #</p><p className="font-medium">{order.grn_number}</p></div>}
        {order.received_at && <div><p className="text-xs text-gray-500 mb-0.5">Received At</p><p className="font-medium">{new Date(order.received_at).toLocaleDateString()}</p></div>}
      </div>

      {/* Line items */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Items ({lines.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left w-8">#</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left w-20">Unit</th>
                <th className="px-3 py-2 text-right w-24">Qty</th>
                <th className="px-3 py-2 text-right w-28">Rate (₹)</th>
                <th className="px-3 py-2 text-left w-24">Rate Unit</th>
                <th className="px-3 py-2 text-right w-28">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((l: any) => (
                <tr key={l.line_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400">{l.line_number}</td>
                  <td className="px-3 py-2 whitespace-pre-wrap">{l.description}</td>
                  <td className="px-3 py-2">{l.unit}</td>
                  <td className="px-3 py-2 text-right">{Number(l.quantity).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    {l.rate ? Number(l.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="px-3 py-2">{l.rate_unit ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmtINR(l.line_amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 text-sm">
              <tr>
                <td colSpan={6} className="px-3 py-2 text-right text-gray-500">Gross Value</td>
                <td className="px-3 py-2 text-right font-medium">{fmtINR(order.gross_value)}</td>
              </tr>
              <tr>
                <td colSpan={6} className="px-3 py-2 text-right text-gray-500">
                  GST ({order.gst_type === 'IGST' ? 'IGST' : 'CGST+SGST'} @ {order.gst_rate}%)
                </td>
                <td className="px-3 py-2 text-right font-medium">{fmtINR(order.gst_amount)}</td>
              </tr>
              <tr className="font-bold">
                <td colSpan={6} className="px-3 py-2 text-right border-t border-gray-200">Total</td>
                <td className="px-3 py-2 text-right border-t border-gray-200">{fmtINR(order.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Hidden print template */}
      <div ref={printRef} style={{ display: 'none', position: 'absolute', left: -9999, top: 0 }}>
        <PurchaseOrderPdf
          order={order}
          approverName={order.approver_name}
          approverSignatureUrl={order.approver_signature_url}
        />
      </div>
    </div>
  );
}
