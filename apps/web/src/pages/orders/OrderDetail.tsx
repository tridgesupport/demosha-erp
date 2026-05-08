import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOrder, useUpdateOrderStatus, useReviseOrder } from '@/hooks/useOrders';
import { formatINR } from '@/lib/calculations';
import StatusBadge from '@/components/StatusBadge';
import OverdueBadge from '@/components/OverdueBadge';
import ProformaInvoice from '@/components/ProformaInvoice';
import { useCustomerOutstanding } from '@/hooks/useCustomers';
import { useAuth } from '@/context/AuthContext';
import { uploadApprovedPi, uploadSalesBill } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, Printer, Upload, FileText, ExternalLink } from 'lucide-react';

const STATUS_FLOW = ['draft', 'sent', 'approved', 'sent_to_factory', 'dispatched', 'invoiced'];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', sent: 'Sent for Approval', approved: 'Approved',
  sent_to_factory: 'Sent to Factory', dispatched: 'Dispatched',
  invoiced: 'Invoiced', cancelled: 'Cancelled',
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: order, isLoading } = useOrder(id);
  const updateStatus = useUpdateOrderStatus(id!);
  const revise = useReviseOrder(id!);
  const [confirming, setConfirming] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const buyerOutstanding = useCustomerOutstanding(order?.buyer_id);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>PI ${o?.pi_number}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff; }
        @page { size: A4; margin: 10mm; }
        @media print { body { -webkit-print-color-adjust: exact; } }
      </style>
    </head><body>${content}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  const handleUpload = async (type: 'approved-pi' | 'sales-bill', file: File) => {
    setUploading(type);
    try {
      if (type === 'approved-pi') await uploadApprovedPi(id!, file);
      else await uploadSalesBill(id!, file);
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    } finally {
      setUploading(null);
    }
  };

  if (isLoading) return <div className="animate-pulse h-64 bg-gray-200 rounded-lg" />;
  if (!order) return <div className="text-center py-16 text-gray-400">Order not found</div>;

  const o = order as any;
  const isManagerOrAdmin = user?.role === 'manager' || user?.role === 'admin';
  const isSalesperson = user?.role === 'salesperson';

  // Role-based next action
  const getNextAction = () => {
    if (o.status === 'draft') return { label: 'Submit for Approval', next: 'sent' };
    if (o.status === 'sent' && isManagerOrAdmin) return { label: 'Mark Approved', next: 'approved' };
    if (o.status === 'approved' && isSalesperson) return { label: 'Sent to Factory', next: 'sent_to_factory' };
    if (o.status === 'sent_to_factory') return { label: 'Mark Dispatched', next: 'dispatched' };
    if (o.status === 'dispatched') return { label: 'Mark Invoiced', next: 'invoiced' };
    return null;
  };

  const nextAction = getNextAction();
  const canRevise = o.status === 'invoiced' || o.status === 'cancelled';

  const handleStatusChange = async () => {
    if (!nextAction) return;
    await updateStatus.mutateAsync(nextAction.next);
    setConfirming(false);
  };

  const handleRevise = async () => {
    const newOrder = await revise.mutateAsync() as any;
    navigate(`/orders/${newOrder.order_id}`);
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this PI?')) return;
    await updateStatus.mutateAsync('cancelled');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700 text-sm">
          <ArrowLeft className="w-4 h-4 inline" /> Back
        </button>
      </div>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{o.pi_number}</h1>
              <StatusBadge status={o.status} />
              {o.revision_number > 0 && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                  Rev {o.revision_number}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {o.fy_label} · Order date: {o.order_date ? String(o.order_date).slice(0, 10) : 'N/A'}
            </p>
            {o.submitted_by && (
              <p className="text-xs text-gray-400 mt-1">Submitted by {o.submitted_by} on {o.submitted_at ? new Date(o.submitted_at).toLocaleString() : ''}</p>
            )}
            {o.approved_by && (
              <p className="text-xs text-gray-400">Approved by {o.approved_by} on {o.approved_at ? new Date(o.approved_at).toLocaleString() : ''}</p>
            )}
            {o.parent_pi_number && (
              <p className="text-xs text-gray-400 mt-1">
                Revised from <Link to={`/orders/${o.parent_order_id}`} className="underline text-blue-600">{o.parent_pi_number}</Link>
              </p>
            )}
            {o.child_pi_number && (
              <p className="text-xs text-orange-500 mt-1">
                Superseded by <Link to={`/orders/${o.child_order_id}`} className="underline">{o.child_pi_number}</Link>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50">
              <Printer className="w-4 h-4" /> Print Pro Forma
            </button>
            {nextAction && o.status !== 'cancelled' && (
              <button
                onClick={confirming ? handleStatusChange : () => setConfirming(true)}
                disabled={updateStatus.isPending}
                className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {confirming ? `Confirm: ${nextAction.label}` : nextAction.label}
              </button>
            )}
            {/* Manager: upload approved PI */}
            {isManagerOrAdmin && ['sent', 'approved', 'sent_to_factory', 'dispatched', 'invoiced'].includes(o.status) && (
              <label className={`flex items-center gap-1.5 px-4 py-1.5 border border-blue-300 text-blue-700 rounded text-sm hover:bg-blue-50 cursor-pointer ${uploading === 'approved-pi' ? 'opacity-50' : ''}`}>
                <Upload className="w-4 h-4" />
                {o.approved_pi_url ? 'Replace Approved PI' : 'Upload Approved PI'}
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => e.target.files?.[0] && handleUpload('approved-pi', e.target.files[0])} />
              </label>
            )}
            {/* Salesperson: upload sales bill after approval */}
            {['approved', 'sent_to_factory', 'dispatched', 'invoiced'].includes(o.status) && (
              <label className={`flex items-center gap-1.5 px-4 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 cursor-pointer ${uploading === 'sales-bill' ? 'opacity-50' : ''}`}>
                <Upload className="w-4 h-4" />
                {o.sales_bill_url ? 'Replace Sales Bill' : 'Upload Sales Bill'}
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => e.target.files?.[0] && handleUpload('sales-bill', e.target.files[0])} />
              </label>
            )}
            {canRevise && (
              <button onClick={handleRevise} disabled={revise.isPending} className="px-4 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50">
                Revise PI
              </button>
            )}
            {['draft', 'sent', 'approved'].includes(o.status) && (
              <button onClick={handleCancel} className="px-4 py-1.5 border border-red-300 text-red-600 rounded text-sm hover:bg-red-50">
                Cancel PI
              </button>
            )}
          </div>
        </div>

        {/* Status timeline */}
        <div className="mt-6 flex items-center gap-1 flex-wrap">
          {STATUS_FLOW.map((s, i) => {
            const idx = STATUS_FLOW.indexOf(o.status);
            const done = i < idx;
            const active = i === idx;
            return (
              <div key={s} className="flex items-center">
                <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                  active ? 'bg-blue-600 text-white' : done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  {done && <CheckCircle className="w-3 h-3" />}
                  {STATUS_LABELS[s] ?? s}
                </div>
                {i < STATUS_FLOW.length - 1 && (
                  <div className={`w-6 h-0.5 ${i < idx ? 'bg-green-300' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Buyer / Consignee */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-2 gap-4 text-sm">
            <KVSection title="Bill To (Buyer)" items={[
              ['Party', o.buyer_name],
              ['GSTIN', o.buyer_gstin],
              ['Address', o.buyer_address],
              ['PO #', o.buyer_po_number],
              ['PO Date', o.buyer_order_date ? String(o.buyer_order_date).slice(0, 10) : null],
            ]} />
            <KVSection title="Ship To (Consignee)" items={[
              ['Party', o.consignee_name],
              ['GSTIN', o.consignee_gstin],
              ['Address', o.consignee_address],
            ]} />
          </div>

          {/* Commercial Terms */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm">
            <h3 className="font-semibold text-gray-700 mb-3">Commercial Terms</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                ['Agent', o.agent_name],
                ['Payment Terms', o.payment_terms],
                ['Freight', o.freight_desc],
                ['Freight/kg', `₹${o.freight_per_kg}`],
                ['Insurance %', `${o.insurance_pct}%`],
                ['GST Type', o.gst_type],
              ].map(([k, v]) => (
                <div key={k}>
                  <span className="text-xs text-gray-400">{k}</span>
                  <p className="font-medium text-gray-800">{v ?? '—'}</p>
                </div>
              ))}
            </div>
            {o.schedule_notes && (
              <p className="mt-3 text-xs text-gray-500 bg-gray-50 p-2 rounded">{o.schedule_notes}</p>
            )}
          </div>

          {/* Line items */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-700 text-sm">Line Items</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-400 uppercase">
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-4 py-2 text-right">Qty (kg)</th>
                  <th className="px-4 py-2 text-right">Pkgs</th>
                  <th className="px-4 py-2 text-right">Rate/MT</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(o.lines ?? []).map((l: any) => (
                  <tr key={l.line_id}>
                    <td className="px-4 py-2 text-gray-400">{l.line_number}</td>
                    <td className="px-4 py-2">
                      <p className="font-medium">{l.full_description}</p>
                      <p className="text-xs text-gray-400">HS: {l.hs_code} · {l.pkg_name}</p>
                    </td>
                    <td className="px-4 py-2 text-right">{l.qty_kg}</td>
                    <td className="px-4 py-2 text-right">{l.num_packages}</td>
                    <td className="px-4 py-2 text-right">{formatINR(l.rate_per_mt)}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatINR(l.line_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Documents */}
          {(o.proforma_url || o.approved_pi_url || o.sales_bill_url || o.po_copy_url) && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-700 text-sm mb-3">Documents</h3>
              <div className="flex flex-wrap gap-3">
                {o.proforma_url && (
                  <a href={o.proforma_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded text-sm text-blue-600 hover:bg-blue-50">
                    <FileText className="w-4 h-4" /> Pro Forma Invoice <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {o.po_copy_url && (
                  <a href={o.po_copy_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded text-sm text-blue-600 hover:bg-blue-50">
                    <FileText className="w-4 h-4" /> PO Copy <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {o.approved_pi_url && (
                  <a href={o.approved_pi_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded text-sm text-green-600 hover:bg-green-50">
                    <FileText className="w-4 h-4" /> Approved PI <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {o.sales_bill_url && (
                  <a href={o.sales_bill_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded text-sm text-orange-600 hover:bg-orange-50">
                    <FileText className="w-4 h-4" /> Sales Bill <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Totals */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm space-y-2">
            <h3 className="font-semibold text-gray-700 border-b pb-2">Totals</h3>
            <TotalRow label="Gross Value" value={o.gross_value} />
            <TotalRow label="Insurance" value={o.insurance_amount} />
            <TotalRow label="Assessable Value" value={o.assessable_value} bold />
            {o.gst_type === 'IGST' && <TotalRow label={`IGST (${o.igst_rate}%)`} value={o.igst_amount} />}
            {o.gst_type === 'CGST_SGST' && <>
              <TotalRow label={`CGST (${o.cgst_rate}%)`} value={o.cgst_amount} />
              <TotalRow label={`SGST (${o.cgst_rate}%)`} value={o.sgst_amount} />
            </>}
            {parseFloat(o.tcs_amount) > 0 && <TotalRow label={`TCS (${o.tcs_rate}%)`} value={o.tcs_amount} />}
            <div className="border-t pt-2">
              <TotalRow label="TOTAL" value={o.total_amount} bold large />
            </div>
          </div>

          {/* Outstanding panel */}
          {o.buyer_id && buyerOutstanding.data && parseFloat(buyerOutstanding.data.total_pending) > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm space-y-2">
              <h3 className="font-semibold text-gray-700">Buyer Outstanding</h3>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Pending</span>
                <span className="font-bold">{formatINR(buyerOutstanding.data.total_pending)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Max Overdue</span>
                <OverdueBadge days={buyerOutstanding.data.max_overdue_days} />
              </div>
              <Link to={`/finance/outstanding?customerId=${o.buyer_id}`} className="text-xs text-blue-600 underline block mt-1">
                View full outstanding →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Hidden print content */}
      <div ref={printRef} style={{ display: 'none' }}>
        <ProformaInvoice order={o} />
      </div>
    </div>
  );
}

function KVSection({ title, items }: { title: string; items: [string, any][] }) {
  return (
    <div>
      <h3 className="font-semibold text-gray-700 mb-2">{title}</h3>
      <div className="space-y-1">
        {items.map(([k, v]) => v ? (
          <div key={k} className="flex gap-2">
            <span className="text-gray-400 w-20 shrink-0">{k}:</span>
            <span className="text-gray-800">{v}</span>
          </div>
        ) : null)}
      </div>
    </div>
  );
}

function TotalRow({ label, value, bold, large }: { label: string; value: any; bold?: boolean; large?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : ''}`}>
      <span className="text-gray-500">{label}</span>
      <span className={large ? 'text-base' : ''}>{formatINR(value)}</span>
    </div>
  );
}
