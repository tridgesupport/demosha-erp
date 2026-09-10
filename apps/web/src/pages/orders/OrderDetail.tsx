import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOrder, useUpdateOrderStatus, useReviseOrder, useSplitOrder, useDeleteOrder } from '@/hooks/useOrders';
import { formatINR } from '@/lib/calculations';
import StatusBadge from '@/components/StatusBadge';
import OverdueBadge from '@/components/OverdueBadge';
import ProformaInvoice from '@/components/ProformaInvoice';
import { useCustomerOutstanding } from '@/hooks/useCustomers';
import { useAuth } from '@/context/AuthContext';
import { uploadSalesBill, uploadLr, uploadOrderApprovalAttachment } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { ArrowLeft, CheckCircle, Printer, Upload, FileText, ExternalLink, AlertTriangle, Paperclip, Layers, Pencil, Trash2 } from 'lucide-react';

// "Invoiced" was a distinct stage before it got folded into dispatch — it's
// deliberately left out of the visible flow now (nothing new lands there),
// but a handful of old orders are still parked at that status; the timeline
// below treats them as equivalent to "Sent to Factory" rather than adding
// invoiced back in as its own box.
const STATUS_FLOW = ['draft', 'sent', 'approved', 'sent_to_factory', 'dispatched'];

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
  const splitOrder = useSplitOrder(id!);
  const deleteOrder = useDeleteOrder();
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [fulfillQty, setFulfillQty] = useState<Record<string, { qty_kg: number; num_packages: number }>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingProforma, setGeneratingProforma] = useState(false);
  const [approvalSigUrl, setApprovalSigUrl] = useState<string | null>(null);
  const [selfApproving, setSelfApproving] = useState(false);
  const [selfApproveComment, setSelfApproveComment] = useState('');
  const [selfApproveFile, setSelfApproveFile] = useState<File | null>(null);
  const [submittingSelfApproval, setSubmittingSelfApproval] = useState(false);

  const buyerOutstanding = useCustomerOutstanding(order?.buyer_id);
  const printRef = useRef<HTMLDivElement>(null);
  const approvalRef = useRef<HTMLDivElement>(null);

  const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const generatePdf = async (el: HTMLDivElement): Promise<Blob> => {
    el.style.display = 'block';
    // `el` is just a positioning wrapper — the actual fixed-size A4 page is
    // its one child (ProformaInvoice's own root div, 210mm wide, centered
    // via margin:auto). Without an explicit width/height, html2canvas sizes
    // its canvas off *el's* own layout width — however wide its containing
    // block happens to be, easily 1000px+ on a wide screen — instead of the
    // narrower centered page inside it. That squashes the real content into
    // a fraction of an oversized, mostly-blank canvas, which jsPDF then
    // stretches to fill the PDF page: tiny print with a big blank margin.
    // Capturing the child directly, pinned to its own real pixel size, is
    // what keeps the output at genuine full-page A4 size.
    const target = (el.firstElementChild as HTMLElement) ?? el;
    await new Promise<void>(r => requestAnimationFrame(() => r()));
    const rect = target.getBoundingClientRect();
    const canvas = await html2canvas(target, {
      scale: 2, useCORS: true, allowTaint: false, logging: false,
      width: rect.width, height: rect.height,
      windowWidth: rect.width, windowHeight: rect.height,
    });
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
    setGeneratingProforma(true);
    try {
      const blob = await generatePdf(printRef.current);
      const fd = new FormData();
      fd.append('file', blob, 'proforma.pdf');
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/orders/${id}/upload-proforma`, {
        method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd,
      });
      if (res.ok) {
        const { url } = await res.json();
        queryClient.invalidateQueries({ queryKey: ['order', id] });
        window.open(url, '_blank');
      } else {
        window.open(URL.createObjectURL(blob), '_blank');
      }
    } catch (err) {
      console.error('Failed to generate proforma PDF:', err);
    } finally {
      setGeneratingProforma(false);
    }
  };

  const prefetchSigAsDataUrl = async (url: string | null | undefined): Promise<string | null> => {
    if (!url) return null;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      return await blobToDataUrl(blob);
    } catch { return null; }
  };

  const generateAndUploadApprovedPdf = async () => {
    if (!approvalRef.current) return;
    setGeneratingPdf(true);
    try {
      const sigDataUrl = await prefetchSigAsDataUrl(user?.signature_url);
      setApprovalSigUrl(sigDataUrl);
      await new Promise<void>(r => requestAnimationFrame(() => { requestAnimationFrame(() => r()); }));

      const blob = await generatePdf(approvalRef.current!);
      setApprovalSigUrl(null);

      const fd = new FormData();
      fd.append('file', blob, 'approved_pi.pdf');
      const token = localStorage.getItem('token');
      await fetch(`/api/orders/${id}/upload-approved-pi`, {
        method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd,
      });
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    } catch (err) {
      console.error('Failed to generate approved PI PDF:', err);
      setApprovalSigUrl(null);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadApproved = async () => {
    const ord = order as any;
    // If a stored signed PDF exists, open it directly
    if (ord.approved_pi_url) {
      window.open(ord.approved_pi_url, '_blank');
      return;
    }
    if (!approvalRef.current) return;
    setGeneratingPdf(true);
    try {
      // Pre-fetch approver signature as base64 so html2canvas can render it without CORS errors
      const sigDataUrl = await prefetchSigAsDataUrl(ord.approver_signature_url);
      setApprovalSigUrl(sigDataUrl);
      // Wait for React to commit the state update to the DOM
      await new Promise<void>(r => requestAnimationFrame(() => { requestAnimationFrame(() => r()); }));
      const blob = await generatePdf(approvalRef.current!);
      setApprovalSigUrl(null);
      // Trigger a direct file download (avoids popup blocker)
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `${ord.pi_number}_approved_proforma.pdf`;
      a.click();
      URL.revokeObjectURL(dlUrl);
    } catch (err) {
      console.error('Failed to generate approved PI PDF:', err);
      setApprovalSigUrl(null);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading('sales-bill');
    try {
      await uploadSalesBill(id!, file);
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    } finally {
      setUploading(null);
    }
  };

  const handleUploadLr = async (file: File) => {
    setUploading('lr');
    try {
      await uploadLr(id!, file);
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    } finally {
      setUploading(null);
    }
  };

  if (isLoading) return <div className="animate-pulse h-64 bg-gray-200 rounded-lg" />;
  if (!order) return <div className="text-center py-16 text-gray-400">Order not found</div>;

  const o = order as any;

  // No per-role gating within a tab — reaching this page at all already
  // means the Sales tab was granted to this user's role; every action here
  // is available to anyone who got that far, regardless of which specific
  // role they hold.
  const getNextAction = () => {
    if (o.status === 'draft') return { label: 'Submit for Approval', next: 'sent' };
    if (o.status === 'sent') return { label: 'Mark Approved', next: 'approved' };
    if (o.status === 'approved') return { label: 'Sent to Factory', next: 'sent_to_factory' };
    // The "invoiced" stage has been folded into dispatch — sent_to_factory
    // now goes straight to Mark Dispatched. Orders already sitting at
    // 'invoiced' from before that change aren't backfilled, so that status
    // is still handled here (same next step, same label) rather than left
    // with no way forward.
    if (['sent_to_factory', 'invoiced'].includes(o.status)) return { label: 'Mark Dispatched', next: 'dispatched' };
    return null;
  };

  const nextAction = getNextAction();
  // The sales bill is mandatory paperwork before dispatch (enforced by the
  // API too). This no longer blocks opening the quantity editor below or
  // creating a split — only the final Confirm submission is held back, so
  // sales can still line up how much is being dispatched while the bill is
  // still being chased down.
  const dispatchNeedsSalesBill = nextAction?.next === 'dispatched' && !o.sales_bill_url;
  // Dispatch is the one stage that can be done partially — clicking the
  // button opens a per-line quantity editor instead of firing the
  // whole-order transition straight away (see the fulfillment panel below).
  const isFulfillAction = nextAction != null && nextAction.next === 'dispatched';
  // A leftover part (created by a previous partial invoice/dispatch) sits at
  // sent_to_factory with nothing left to approve — it can still be revised
  // (re-quoted at a new price) or cancelled outright, same as a fresh PI.
  const canRevise = ['dispatched', 'invoiced', 'cancelled', 'sent_to_factory'].includes(o.status);
  const canCancel = ['draft', 'sent', 'approved', 'sent_to_factory'].includes(o.status);
  // Self-Approve sits alongside the plain "Mark Approved" button — anyone
  // can use either, it's just a second option for when they want to record
  // a reason (and optional evidence) for the approval.
  const canSelfApprove = o.status === 'sent';

  const handleStatusChange = async () => {
    if (!nextAction) return;
    if (isFulfillAction) {
      // First click opens the quantity editor below, pre-filled with the
      // full remaining quantity on every line; the editor's own Confirm
      // button calls handleFulfillConfirm.
      const seed: Record<string, { qty_kg: number; num_packages: number }> = {};
      for (const l of o.lines ?? []) {
        seed[l.line_id] = { qty_kg: Number(l.qty_kg), num_packages: Number(l.num_packages) };
      }
      setFulfillQty(seed);
      setConfirming(true);
      return;
    }
    if (nextAction.next === 'approved') await generateAndUploadApprovedPdf();
    await updateStatus.mutateAsync({ status: nextAction.next });
    setConfirming(false);
  };

  const handleFulfillConfirm = async () => {
    if (!nextAction || dispatchNeedsSalesBill) return;
    const lines = (o.lines ?? []).map((l: any) => ({
      line_id: l.line_id,
      qty_kg: fulfillQty[l.line_id]?.qty_kg ?? Number(l.qty_kg),
      num_packages: fulfillQty[l.line_id]?.num_packages ?? Number(l.num_packages),
    }));
    const result = await splitOrder.mutateAsync({ action: nextAction.next as 'invoiced' | 'dispatched', lines }) as any;
    setConfirming(false);
    if (result?.splitOff) {
      const label = `${result.splitOff.pi_number}-${result.splitOff.part_suffix}`;
      alert(`Remaining quantity split off as ${label} — still ${STATUS_LABELS[result.splitOff.status] ?? result.splitOff.status} and visible in Orders List.`);
    }
  };

  const handleRevise = async () => {
    const newOrder = await revise.mutateAsync() as any;
    navigate(`/orders/${newOrder.order_id}`);
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this PI?')) return;
    await updateStatus.mutateAsync({ status: 'cancelled' });
  };

  const handleDeleteDraft = async () => {
    if (!confirm(`Permanently delete draft ${o.pi_number}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteOrder.mutateAsync(id!);
      navigate('/orders');
    } catch (err: any) {
      alert(err?.message || 'Failed to delete draft');
    } finally {
      setDeleting(false);
    }
  };

  const handleSelfApprove = async () => {
    if (!selfApproveComment.trim()) return;
    setSubmittingSelfApproval(true);
    try {
      await generateAndUploadApprovedPdf();
      await updateStatus.mutateAsync({ status: 'approved', comment: selfApproveComment.trim() });
      if (selfApproveFile) {
        await uploadOrderApprovalAttachment(id!, selfApproveFile);
        queryClient.invalidateQueries({ queryKey: ['order', id] });
      }
      setSelfApproving(false);
      setSelfApproveComment('');
      setSelfApproveFile(null);
    } finally {
      setSubmittingSelfApproval(false);
    }
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
              <h1 className="text-2xl font-bold text-gray-900">
                {o.pi_number}{o.part_suffix && <span className="text-purple-600">-{o.part_suffix}</span>}
              </h1>
              <StatusBadge status={o.status} />
              {o.is_test && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                  TEST
                </span>
              )}
              {o.revision_number > 0 && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                  Rev {o.revision_number}
                </span>
              )}
              {o.is_self_approved && (
                <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" /> Self-Approved
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
              <p className="text-xs text-gray-400">
                {o.is_self_approved ? 'Self-approved' : 'Approved'} by {o.approved_by} on {o.approved_at ? new Date(o.approved_at).toLocaleString() : ''}
              </p>
            )}
            {o.approval_comment && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1 max-w-xl">
                <span className="font-medium">Approval comment:</span> {o.approval_comment}
              </p>
            )}
            {o.invoiced_at && (
              <p className="text-xs text-gray-400">Invoiced on {new Date(o.invoiced_at).toLocaleString()}</p>
            )}
            {o.dispatched_at && (
              <p className="text-xs text-gray-400">Dispatched on {new Date(o.dispatched_at).toLocaleString()}</p>
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
            {dispatchNeedsSalesBill && (
              <p className="text-xs text-orange-500 mt-1">
                Upload the sales bill (below) before this order can be marked dispatched.
              </p>
            )}
            {o.parts && o.parts.length > 0 && (
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Layers className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-xs text-gray-400">Other parts of this PI:</span>
                {o.parts.map((p: any) => (
                  <Link key={p.order_id} to={`/orders/${p.order_id}`}
                    className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5 hover:bg-purple-100">
                    {o.pi_number}-{p.part_suffix} · {STATUS_LABELS[p.status] ?? p.status}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {o.status === 'draft' && (
              <Link to={`/orders/${id}/edit`}
                className="flex items-center gap-1.5 px-4 py-1.5 border border-blue-300 text-blue-700 rounded text-sm hover:bg-blue-50">
                <Pencil className="w-4 h-4" /> Edit Draft
              </Link>
            )}
            <button onClick={handlePrint} disabled={generatingProforma} className="flex items-center gap-1.5 px-4 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50">
              <Printer className="w-4 h-4" /> {generatingProforma ? 'Generating…' : 'Print Pro Forma'}
            </button>
            {['approved', 'sent_to_factory', 'invoiced', 'dispatched'].includes(o.status) && (
              <button onClick={handleDownloadApproved} disabled={generatingPdf}
                className="flex items-center gap-1.5 px-4 py-1.5 border border-green-300 text-green-700 rounded text-sm hover:bg-green-50 disabled:opacity-50">
                <FileText className="w-4 h-4" /> {generatingPdf ? 'Generating…' : 'Download Approved Pro Forma'}
              </button>
            )}
            {['approved', 'sent_to_factory', 'invoiced', 'dispatched'].includes(o.status) && (
              <label className={`flex items-center gap-1.5 px-4 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 cursor-pointer ${uploading === 'sales-bill' ? 'opacity-50' : ''}`}>
                <Upload className="w-4 h-4" />
                {o.sales_bill_url ? 'Replace Sales Bill' : 'Upload Sales Bill'}
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
              </label>
            )}
            {o.status === 'dispatched' && (
              <label className={`flex items-center gap-1.5 px-4 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 cursor-pointer ${uploading === 'lr' ? 'opacity-50' : ''}`}>
                <Upload className="w-4 h-4" />
                {o.lr_url ? 'Replace LR' : 'Upload LR'}
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => e.target.files?.[0] && handleUploadLr(e.target.files[0])} />
              </label>
            )}
            {nextAction && o.status !== 'cancelled' && !(isFulfillAction && confirming) && (
              <button
                onClick={isFulfillAction ? handleStatusChange : confirming ? handleStatusChange : () => setConfirming(true)}
                disabled={updateStatus.isPending || generatingPdf}
                className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {generatingPdf ? 'Generating PDF…' : updateStatus.isPending ? 'Saving…' : confirming ? `Confirm: ${nextAction.label}` : nextAction.label}
              </button>
            )}
            {canSelfApprove && (
              <button
                onClick={() => setSelfApproving(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 border border-amber-400 text-amber-700 rounded text-sm hover:bg-amber-50"
              >
                <AlertTriangle className="w-4 h-4" /> Self-Approve
              </button>
            )}
            {canRevise && (
              <button onClick={handleRevise} disabled={revise.isPending} className="px-4 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50">
                Revise PI
              </button>
            )}
            {canCancel && (
              <button onClick={handleCancel} className="px-4 py-1.5 border border-red-300 text-red-600 rounded text-sm hover:bg-red-50">
                Cancel PI
              </button>
            )}
            {o.status === 'draft' && (
              <button onClick={handleDeleteDraft} disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-1.5 border border-red-300 text-red-600 rounded text-sm hover:bg-red-50 disabled:opacity-50">
                <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting…' : 'Delete Draft'}
              </button>
            )}
          </div>
        </div>

        {/* Partial invoice/dispatch — per-line quantity editor */}
        {isFulfillAction && confirming && (
          <div className="mt-4 border border-blue-200 bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-sm text-blue-900 mb-1">{nextAction!.label} — how much now?</h3>
            <p className="text-xs text-blue-700 mb-3">
              Enter the quantity being dispatched right now.
              Leave a line at its full quantity to action all of it. Reducing a line splits the remainder
              off into a new part (same PI number, next letter) that stays visible to both sales and factory.
              Pkgs Now scales with quantity automatically — adjust it by hand if packaging doesn't split evenly.
            </p>
            {dispatchNeedsSalesBill && (
              <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-1 mb-3">
                You can set up the split below, but upload the sales bill (above) before this can be confirmed as dispatched.
              </p>
            )}
            <table className="w-full text-sm mb-3">
              <thead>
                <tr className="text-xs text-blue-800 uppercase">
                  <th className="text-left pb-1">Description</th>
                  <th className="text-right pb-1">Full Qty (kg)</th>
                  <th className="text-right pb-1">Qty Now (kg)</th>
                  <th className="text-right pb-1">Pkgs Now</th>
                </tr>
              </thead>
              <tbody>
                {(o.lines ?? []).map((l: any) => (
                  <tr key={l.line_id}>
                    <td className="py-1">{l.full_description}</td>
                    <td className="text-right py-1 text-gray-500">{l.qty_kg}</td>
                    <td className="text-right py-1">
                      <input type="number" min={0} max={Number(l.qty_kg)} step="0.001"
                        value={fulfillQty[l.line_id]?.qty_kg ?? Number(l.qty_kg)}
                        onChange={(e) => {
                          const qty_kg = parseFloat(e.target.value) || 0;
                          const origQty = Number(l.qty_kg);
                          const origPkgs = Number(l.num_packages);
                          // Package count defaults to scaling with quantity (e.g. 1kg
                          // jars: half the qty -> half the packages) — still editable
                          // by hand afterward for cases that don't split evenly.
                          const scaledPkgs = origQty > 0 ? Math.round((qty_kg / origQty) * origPkgs) : origPkgs;
                          setFulfillQty((prev) => ({
                            ...prev,
                            [l.line_id]: { qty_kg, num_packages: Math.min(origPkgs, Math.max(0, scaledPkgs)) },
                          }));
                        }}
                        className="w-24 border border-gray-300 rounded px-2 py-1 text-right" />
                    </td>
                    <td className="text-right py-1">
                      <input type="number" min={0} max={Number(l.num_packages)} step="1"
                        value={fulfillQty[l.line_id]?.num_packages ?? Number(l.num_packages)}
                        onChange={(e) => setFulfillQty((prev) => ({
                          ...prev,
                          [l.line_id]: { ...prev[l.line_id], num_packages: parseInt(e.target.value, 10) || 0 },
                        }))}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-right" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2">
              <button onClick={handleFulfillConfirm} disabled={splitOrder.isPending || dispatchNeedsSalesBill}
                title={dispatchNeedsSalesBill ? 'Upload the sales bill before marking this order dispatched' : undefined}
                className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                {splitOrder.isPending ? 'Saving…' : `Confirm: ${nextAction!.label}`}
              </button>
              <button onClick={() => setConfirming(false)} disabled={splitOrder.isPending}
                className="px-4 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Status timeline */}
        <div className="mt-6 flex items-center gap-1 flex-wrap">
          {STATUS_FLOW.map((s, i) => {
            const idx = STATUS_FLOW.indexOf(o.status === 'invoiced' ? 'sent_to_factory' : o.status);
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
          {(o.approved_pi_url || o.sales_bill_url || o.lr_url || o.approval_attachment_url) && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-700 text-sm mb-3">Documents</h3>
              <div className="flex flex-wrap gap-3">
                {o.approved_pi_url && (
                  <a href={o.approved_pi_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-green-200 rounded text-sm text-green-700 hover:bg-green-50">
                    <FileText className="w-4 h-4" /> Approved Pro Forma <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {o.approval_attachment_url && (
                  <a href={o.approval_attachment_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-200 rounded text-sm text-amber-700 hover:bg-amber-50">
                    <Paperclip className="w-4 h-4" /> Approval Evidence <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {o.sales_bill_url && (
                  <a href={o.sales_bill_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-orange-200 rounded text-sm text-orange-700 hover:bg-orange-50">
                    <FileText className="w-4 h-4" /> Sales Bill <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {o.lr_url && (
                  <a href={o.lr_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 rounded text-sm text-blue-700 hover:bg-blue-50">
                    <FileText className="w-4 h-4" /> LR (Lorry Receipt) <ExternalLink className="w-3 h-3" />
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

      {/* Self-approve modal */}
      {selfApproving && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96 space-y-4">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-semibold">Self-Approve {o.pi_number}</h3>
            </div>
            <p className="text-xs text-gray-500">
              An alternative to the plain Approve button, for when you want to record why —
              your comment stays visible to everyone who opens this PI afterwards.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Comment (required)</label>
              <textarea
                value={selfApproveComment}
                onChange={(e) => setSelfApproveComment(e.target.value)}
                placeholder="Why are you self-approving this PI?"
                rows={3}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Attach evidence — picture or file (optional)</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setSelfApproveFile(e.target.files?.[0] ?? null)}
                className="text-xs w-full" />
              {selfApproveFile && <p className="text-xs text-gray-500 mt-1">{selfApproveFile.name}</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={handleSelfApprove} disabled={!selfApproveComment.trim() || submittingSelfApproval}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 disabled:opacity-50">
                {submittingSelfApproval ? 'Submitting…' : 'Confirm Self-Approval'}
              </button>
              <button onClick={() => { setSelfApproving(false); setSelfApproveComment(''); setSelfApproveFile(null); }}
                disabled={submittingSelfApproval}
                className="flex-1 px-4 py-2 border rounded text-sm hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden print content */}
      <div ref={printRef} style={{ display: 'none' }}>
        <ProformaInvoice order={o} />
      </div>

      {/* Hidden approval PDF content — uses pre-fetched base64 sig to avoid html2canvas CORS */}
      <div ref={approvalRef} style={{ display: 'none', position: 'absolute', left: '-9999px', top: 0 }}>
        <ProformaInvoice order={o} approverName={o.approver_name ?? user?.name} approverSignatureUrl={approvalSigUrl ?? undefined} />
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
