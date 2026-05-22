import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, CheckCircle, Clock, Printer, ArrowLeft, ThumbsUp, Send } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useLogsheet, useUpdateLogsheetSection, useUpdateLogsheetStatus } from '@/hooks/useProduction';
import { useAuth } from '@/context/AuthContext';
import { getProductConfig, SectionConfig, FormField } from '@/lib/productionFormConfigs';
import LogsheetPdf from '@/components/LogsheetPdf';

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-amber-100 text-amber-700',
  submitted: 'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
};
const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', submitted: 'Ready for Approval', approved: 'Approved',
};

function renderField(field: FormField, value: string, onChange: (v: string) => void, readOnly: boolean) {
  const base = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500';

  if (field.type === 'textarea') {
    return <textarea value={value} onChange={e => onChange(e.target.value)} disabled={readOnly}
      rows={2} className={base + ' resize-none'} />;
  }
  if (field.type === 'select' && field.options) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} disabled={readOnly} className={base}>
        <option value="">—</option>
        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={value} onChange={e => onChange(e.target.value)}
      disabled={readOnly} className={base}
      step={field.type === 'number' ? 'any' : undefined}
    />
  );
}

function SectionCard({
  section, sectionData, readOnly, onSave, saving,
}: {
  section: SectionConfig;
  sectionData: Record<string, any> | undefined;
  readOnly: boolean;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    section.fields.forEach(f => { init[f.key] = sectionData?.[f.key] != null ? String(sectionData[f.key]) : ''; });
    return init;
  });
  const [dirty, setDirty] = useState(false);

  const savedBy  = sectionData?._saved_by;
  const savedAt  = sectionData?._saved_at;
  const hasSaved = !!savedBy;

  function update(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
    setDirty(true);
  }

  async function handleSave() {
    const payload: Record<string, unknown> = {};
    section.fields.forEach(f => {
      if (form[f.key] !== '') {
        payload[f.key] = f.type === 'number' ? Number(form[f.key]) : form[f.key];
      }
    });
    await onSave(payload);
    setDirty(false);
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <div className="flex items-center gap-3">
          {hasSaved
            ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
            : <Clock className="w-4 h-4 text-gray-300 flex-shrink-0" />}
          <div>
            <span className="font-semibold text-gray-800 text-sm">{section.title}</span>
            {section.subtitle && <span className="ml-2 text-xs text-gray-400">{section.subtitle}</span>}
            {hasSaved && (
              <span className="ml-3 text-xs text-green-600">
                Saved by {savedBy}{savedAt ? ` · ${new Date(savedAt).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}` : ''}
              </span>
            )}
            {dirty && <span className="ml-2 text-xs text-amber-600">Unsaved changes</span>}
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {section.fields.map(field => (
              <div key={field.key} className={field.colSpan === 2 ? 'col-span-2' : ''}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                {renderField(field, form[field.key] ?? '', v => update(field.key, v), readOnly)}
              </div>
            ))}
          </div>

          {!readOnly && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !dirty}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-40"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save Section'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LogsheetDetail() {
  const { productCode = '', id = '' } = useParams<{ productCode: string; id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false);
  const [savingSection, setSavingSection] = useState<string | null>(null);

  const code = productCode.toUpperCase();
  const config = getProductConfig(code);

  const { data: logsheet, isLoading } = useLogsheet(id);
  const saveSection = useUpdateLogsheetSection(id);
  const updateStatus = useUpdateLogsheetStatus(id);

  const role = user?.role?.toLowerCase() ?? '';
  const canApprove = ['admin', 'manager', 'plant_incharge'].includes(role);

  const status = logsheet?.status ?? 'draft';
  const readOnly = status === 'approved';
  const sectionData: Record<string, any> = logsheet?.section_data ?? {};

  const filledCount = config ? config.sections.filter(s => !!sectionData[s.key]).length : 0;
  const allFilled   = config ? filledCount === config.sections.length : false;

  const canSubmit  = status === 'draft' && allFilled;
  const canApproveSingle = status === 'submitted' && canApprove;

  async function handleSaveSection(sectionKey: string, data: Record<string, unknown>) {
    setSavingSection(sectionKey);
    try {
      await saveSection.mutateAsync({ section_key: sectionKey, data });
    } finally {
      setSavingSection(null);
    }
  }

  async function handlePrint() {
    if (!printRef.current) return;
    setPrinting(true);
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
      const img    = canvas.toDataURL('image/png');
      const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height / canvas.width) * w;
      pdf.addImage(img, 'PNG', 0, 0, w, h);
      pdf.save(`${logsheet?.logsheet_no ?? 'logsheet'}.pdf`);
    } finally {
      setPrinting(false);
    }
  }

  if (!config) return <div className="text-gray-400 py-16 text-center">Unknown product: {productCode}</div>;
  if (isLoading) return <div className="text-gray-400 text-sm py-8">Loading…</div>;
  if (!logsheet) return <div className="text-gray-400 py-16 text-center">Logsheet not found</div>;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/production/${productCode}`)} className="text-gray-400 hover:text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{logsheet.logsheet_no}</h1>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
                {STATUS_LABELS[status]}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {config.name} · {logsheet.log_date ? String(logsheet.log_date).slice(0,10) : '—'} · {logsheet.shift ?? '—'} shift
              {logsheet.batch_no ? ` · Batch: ${logsheet.batch_no}` : ''}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handlePrint}
            disabled={printing}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" /> {printing ? 'Generating…' : 'Print PDF'}
          </button>

          {canSubmit && (
            <button
              onClick={() => updateStatus.mutateAsync('submitted')}
              disabled={updateStatus.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> Submit for Approval
            </button>
          )}

          {canApproveSingle && (
            <button
              onClick={() => updateStatus.mutateAsync('approved')}
              disabled={updateStatus.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
            >
              <ThumbsUp className="w-4 h-4" /> Approve
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Sections completed</span>
          <span className="text-sm text-gray-500">{filledCount} / {config.sections.length}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${(filledCount / config.sections.length) * 100}%` }}
          />
        </div>
        {!allFilled && !readOnly && (
          <p className="text-xs text-gray-400 mt-2">Fill all sections and save each one to enable submission for approval.</p>
        )}
        {status === 'approved' && logsheet.approved_by && (
          <p className="text-xs text-green-600 mt-2">
            Approved by {logsheet.approved_by} on {logsheet.approved_at ? new Date(logsheet.approved_at).toLocaleString('en-IN') : '—'}
          </p>
        )}
        {status === 'submitted' && logsheet.submitted_by && (
          <p className="text-xs text-blue-600 mt-2">
            Submitted by {logsheet.submitted_by} on {logsheet.submitted_at ? new Date(logsheet.submitted_at).toLocaleString('en-IN') : '—'}
          </p>
        )}
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {config.sections.map(section => (
          <SectionCard
            key={section.key}
            section={section}
            sectionData={sectionData[section.key]}
            readOnly={readOnly}
            saving={savingSection === section.key}
            onSave={data => handleSaveSection(section.key, data)}
          />
        ))}
      </div>

      {/* Hidden print area */}
      <div className="hidden">
        <div ref={printRef}>
          <LogsheetPdf logsheet={logsheet} config={config} />
        </div>
      </div>
    </div>
  );
}
