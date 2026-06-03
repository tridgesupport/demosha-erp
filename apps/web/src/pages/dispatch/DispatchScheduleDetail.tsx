import { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import { useDispatchSchedule, useUpdateDispatchScheduleLine } from '@/hooks/useDispatchSchedules';
import { uploadDispatchSchedulePdf } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import DispatchSchedulePdf from '@/components/DispatchSchedulePdf';

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  return String(d).slice(0, 10).split('-').reverse().join('/');
}

export default function DispatchScheduleDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: schedule, isLoading } = useDispatchSchedule(id);
  const updateLine = useUpdateDispatchScheduleLine(id!);
  const pdfRef = useRef<HTMLDivElement>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [lineEdits, setLineEdits] = useState<Record<string, any>>({});

  const isFactory = user?.role === 'factory';

  const handleLineEdit = (lineId: string, field: string, value: string) => {
    setLineEdits(prev => ({
      ...prev,
      [lineId]: { ...(prev[lineId] ?? {}), [field]: value },
    }));
  };

  const saveLineEdit = async (lineId: string) => {
    const edits = lineEdits[lineId];
    if (!edits) return;
    await updateLine.mutateAsync({ lineId, body: edits });
    setEditingLine(null);
  };

  const generatePdf = async () => {
    if (!pdfRef.current) return;
    setGeneratingPdf(true);
    try {
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
      const blob = pdf.output('blob');

      // Upload to server
      await uploadDispatchSchedulePdf(id!, blob);

      // Download locally
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${schedule?.schedule_ref ?? 'dispatch'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      if (pdfRef.current) pdfRef.current.style.display = 'none';
      setGeneratingPdf(false);
    }
  };

  if (isLoading) return <div className="text-gray-400 text-sm py-10 text-center">Loading…</div>;
  if (!schedule) return <div className="text-red-500 text-sm py-10 text-center">Schedule not found.</div>;

  const lines: any[] = schedule.lines ?? [];

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/dispatch/schedules" className="text-gray-500 hover:text-gray-800">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{schedule.schedule_ref}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {fmt(schedule.date_from)}{schedule.date_from !== schedule.date_to ? ` → ${fmt(schedule.date_to)}` : ''}
              {' · '}Created by {schedule.created_by}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {schedule.pdf_url && (
            <a href={schedule.pdf_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              <ExternalLink className="w-4 h-4" /> View PDF
            </a>
          )}
          <button
            onClick={generatePdf}
            disabled={generatingPdf}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {generatingPdf ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Schedule info */}
      {schedule.product_description && (
        <div className="bg-blue-50 text-blue-800 text-sm rounded-lg px-4 py-3 mb-5">
          {schedule.product_description}
        </div>
      )}

      {/* Lines table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-700 w-8">#</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">PO Number</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">PO Recd. Date</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Customer</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Comments</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Tentative Date</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Dispatched Date</th>
              {isFactory && <th className="px-4 py-3 w-20"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((line: any) => {
              const isEditing = editingLine === line.line_id;
              const edits = lineEdits[line.line_id] ?? {};
              return (
                <tr key={line.line_id} className={line.dispatched_date ? 'bg-green-50' : ''}>
                  <td className="px-4 py-3 text-gray-500">{line.line_number}</td>
                  <td className="px-4 py-3">
                    {line.pi_number ? (
                      <Link to={`/orders/${line.order_id}`} className="text-blue-600 hover:underline text-xs">
                        {line.pi_number}
                      </Link>
                    ) : null}
                    <div className="text-gray-700">{line.po_number ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{fmt(line.po_received_date)}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{line.customer_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs text-xs whitespace-pre-wrap">{line.comments ?? '—'}</td>
                  <td className="px-4 py-3 text-center text-gray-700">
                    {isEditing ? (
                      <input type="date" className="border border-gray-300 rounded px-2 py-1 text-sm w-36"
                        defaultValue={line.tentative_date ? String(line.tentative_date).slice(0, 10) : ''}
                        onChange={e => handleLineEdit(line.line_id, 'tentative_date', e.target.value)} />
                    ) : fmt(line.tentative_date)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isEditing ? (
                      <input type="date" className="border border-gray-300 rounded px-2 py-1 text-sm w-36"
                        defaultValue={line.dispatched_date ? String(line.dispatched_date).slice(0, 10) : ''}
                        onChange={e => handleLineEdit(line.line_id, 'dispatched_date', e.target.value)} />
                    ) : (
                      <span className={line.dispatched_date ? 'text-green-700 font-medium' : 'text-gray-400'}>
                        {fmt(line.dispatched_date)}
                      </span>
                    )}
                  </td>
                  {isFactory && (
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => saveLineEdit(line.line_id)}
                            disabled={updateLine.isPending}
                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingLine(null)}
                            className="px-2 py-1 text-gray-600 border border-gray-300 text-xs rounded hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingLine(line.line_id)}
                          className="text-xs text-gray-500 hover:text-blue-600 font-medium"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hidden PDF render target */}
      <div ref={pdfRef} style={{ display: 'none', position: 'fixed', top: 0, left: 0, zIndex: -1 }}>
        <DispatchSchedulePdf
          schedule={schedule}
          lines={lines.map(l => ({
            line_number: l.line_number,
            po_number: l.po_number,
            po_received_date: l.po_received_date,
            customer_name: l.customer_name,
            comments: l.comments,
            tentative_date: l.tentative_date,
            dispatched_date: l.dispatched_date,
          }))}
          approverName={user?.name}
          approverSignatureUrl={user?.signature_url}
        />
      </div>
    </div>
  );
}
