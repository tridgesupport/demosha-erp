import { useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePurchaseIndent, useUpdatePurchaseIndentStatus } from '@/hooks/usePurchaseIndents';
import { useAuth } from '@/context/AuthContext';
import IndentPdf from '@/components/IndentPdf';
import { ArrowLeft, CheckCircle, ShoppingCart, Printer, ThumbsUp } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const STEPS = ['submitted', 'approved', 'po_raised'] as const;
const STEP_LABELS: Record<string, string> = {
  draft: 'Approval Pending',
  submitted: 'Approval Pending',
  approved: 'Approved',
  po_raised: 'PO Raised',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-700',
  submitted: 'bg-amber-100 text-amber-700',
  approved: 'bg-purple-100 text-purple-700',
  po_raised: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const COMPANY_LABELS: Record<string, string> = {
  DCPL: 'Demosha Chemicals Pvt. Ltd.',
  WIC: 'Western India Chemicals',
};

export default function IndentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: indent, isLoading } = usePurchaseIndent(id);
  const updateStatus = useUpdatePurchaseIndentStatus(id!);
  const printRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);

  const role = user?.role?.toLowerCase() ?? '';
  const isManagerOrAdmin = ['admin', 'manager'].includes(role);

  const canSubmit  = indent?.status === 'draft';
  const canApprove = indent?.status === 'submitted' && isManagerOrAdmin;
  const canRaisePO = indent?.status === 'approved';
  const canCancel  = ['draft', 'submitted'].includes(indent?.status ?? '');

  const handleStatus = async (status: string) => {
    await updateStatus.mutateAsync(status);
  };

  const handlePrint = async () => {
    if (!printRef.current) return;
    setPrinting(true);
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      pdf.addImage(img, 'PNG', 0, 0, 297, 210);
      pdf.save(`${indent?.indent_number ?? 'indent'}.pdf`);
    } finally {
      setPrinting(false);
    }
  };

  const formatDate = (d: string | null) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';

  if (isLoading) return <div className="text-gray-400 text-sm p-8">Loading…</div>;
  if (!indent) return <div className="text-red-500 p-8">Indent not found</div>;

  const lines: any[] = indent.lines ?? [];
  const flowStatus = indent.status === 'draft' ? 'submitted' : indent.status;
  const currentStep = STEPS.indexOf(flowStatus as any);

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-16">
      {/* Header bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">{indent.indent_number}</h1>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[indent.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {STEP_LABELS[indent.status] ?? indent.status}
        </span>
        <div className="ml-auto flex gap-2 flex-wrap">
          <button
            onClick={handlePrint}
            disabled={printing}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            <Printer className="w-4 h-4" />
            {printing ? 'Generating…' : 'Print Indent'}
          </button>
          {canSubmit && (
            <button
              onClick={() => handleStatus('submitted')}
              disabled={updateStatus.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-60"
            >
              <CheckCircle className="w-4 h-4" /> Submit
            </button>
          )}
          {canApprove && (
            <button
              onClick={() => handleStatus('approved')}
              disabled={updateStatus.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-60"
            >
              <ThumbsUp className="w-4 h-4" /> Approve
            </button>
          )}
          {canRaisePO && (
            <Link
              to={`/purchase/orders/new?indentId=${indent.indent_id}`}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700"
            >
              <ShoppingCart className="w-4 h-4" /> Raise PO
            </Link>
          )}
          {canCancel && (
            <button
              onClick={() => handleStatus('cancelled')}
              disabled={updateStatus.isPending}
              className="px-3 py-1.5 border border-red-300 text-red-600 rounded text-sm hover:bg-red-50 disabled:opacity-60"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Status flow bar (4 steps, skip for cancelled) */}
      {indent.status !== 'cancelled' && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center">
            {STEPS.map((step, i) => {
              const done = currentStep > i;
              const active = currentStep === i;
              return (
                <div key={step} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                      ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                      {done ? '✓' : i + 1}
                    </div>
                    <span className={`mt-1 text-xs ${active ? 'text-blue-600 font-semibold' : done ? 'text-green-600' : 'text-gray-400'}`}>
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Details card */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Company</p>
          <p className="font-medium">{COMPANY_LABELS[indent.company] ?? indent.company ?? 'DCPL'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Indent Date</p>
          <p className="font-medium">{formatDate(indent.indent_date)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Financial Year</p>
          <p className="font-medium">{indent.fy_label ?? indent.fy_key}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Department / Plant</p>
          <p className="font-medium">{indent.indent_for ?? '—'}</p>
        </div>
        {indent.submitted_by && (
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Submitted By</p>
            <p className="font-medium">{indent.submitted_by}</p>
          </div>
        )}
        {indent.submitted_at && (
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Submitted At</p>
            <p className="font-medium">{new Date(indent.submitted_at).toLocaleString()}</p>
          </div>
        )}
        {indent.approved_by && (
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Approved By</p>
            <p className="font-medium">{indent.approved_by}</p>
          </div>
        )}
        {indent.approved_at && (
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Approved At</p>
            <p className="font-medium">{new Date(indent.approved_at).toLocaleString()}</p>
          </div>
        )}
        {indent.remarks && (
          <div className="col-span-3">
            <p className="text-xs text-gray-500 mb-0.5">Remarks</p>
            <p className="font-medium">{indent.remarks}</p>
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Line Items ({lines.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left w-8">#</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left w-20">Unit</th>
                <th className="px-3 py-2 text-right w-20">Qty</th>
                <th className="px-3 py-2 text-right w-20">Stock</th>
                <th className="px-3 py-2 text-left w-32">Required For</th>
                <th className="px-3 py-2 text-left w-36">Pref. Brand</th>
                <th className="px-3 py-2 text-left w-24">Repl./New</th>
                <th className="px-3 py-2 text-left w-20">Action By</th>
                <th className="px-3 py-2 text-left">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((l: any) => (
                <tr key={l.line_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400">{l.line_number}</td>
                  <td className="px-3 py-2 font-medium">{l.description}</td>
                  <td className="px-3 py-2">{l.unit}</td>
                  <td className="px-3 py-2 text-right">{Number(l.quantity).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{l.stock_available != null ? Number(l.stock_available).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2">{l.goods_required_for ?? '—'}</td>
                  <td className="px-3 py-2">{l.preferred_brand ?? '—'}</td>
                  <td className="px-3 py-2">{l.replacement_or_new ?? '—'}</td>
                  <td className="px-3 py-2">{l.action_by ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600 italic">{l.comments ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hidden print template */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={printRef}>
          <IndentPdf indent={indent} />
        </div>
      </div>
    </div>
  );
}
