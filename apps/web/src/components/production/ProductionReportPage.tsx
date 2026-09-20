import { ReactNode, useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import {
  useProductionReport, useProductionUploadStatus, useUploadProductionReport,
} from '@/hooks/useProduction';
import type { ProductReportKey, ProductionReportFilters } from '@/lib/api';

// Shared page for the SHS / ZFS / ZnO daily production reports: PDF upload +
// extraction status + filters + paged table. Each product supplies its title,
// filters and columns (see pages/production/{SHS,ZFS,ZNO}.tsx).

export interface ReportColumn {
  header: string;
  align?: 'left' | 'right';
  render: (row: any) => ReactNode;
  className?: string;
}

export interface ReportFilter {
  key: keyof ProductionReportFilters;
  type: 'date' | 'text' | 'number' | 'select';
  placeholder?: string;
  width?: string;
  options?: string[]; // for select; the first "All" option is added automatically
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return String(d).slice(0, 10).split('-').reverse().join('/');
}

export function num(v: any, digits = 2): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : String(v);
}

interface Props {
  product: ProductReportKey;
  title: string;          // e.g. "SHS"
  subtitle: string;       // e.g. "SHSP/F/03/00 — one row per batch"
  tabLabel: string;       // e.g. "Daily Report"
  rowNoun: string;        // e.g. "batch row"
  emptyHint?: string;
  filters: ReportFilter[];
  columns: ReportColumn[];
  rowKey: (row: any) => string;
}

export default function ProductionReportPage({ product, title, subtitle, tabLabel, rowNoun, emptyHint, filters, columns, rowKey }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, refetch } = useProductionReport(product, { ...values, page });
  const rows: any[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 100);

  const upload = useUploadProductionReport(product);
  const { data: uploadStatus } = useProductionUploadStatus(product, uploadId);
  const status = uploadStatus?.status;

  // Once extraction finishes, refresh the table so the new rows show up.
  useEffect(() => {
    if (status === 'done') refetch();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadId(null);
    try {
      const result = await upload.mutateAsync(file);
      setUploadId(result.uploadId);
      setPage(1);
    } catch (err: any) {
      alert(`Upload failed: ${err?.message ?? 'Unknown error'}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const set = (key: string, v: string) => { setValues(prev => ({ ...prev, [key]: v })); setPage(1); };
  const hasFilters = Object.values(values).some(Boolean);
  const inputCls = 'border border-gray-300 rounded px-2 py-1.5 text-sm';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <nav className="flex gap-4 mt-3 border-b border-gray-200">
          <span className="pb-2 text-sm font-medium border-b-2 -mb-px border-blue-600 text-blue-600">{tabLabel}</span>
        </nav>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-gray-400">{subtitle}</p>
        <div>
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={upload.isPending}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" /> {upload.isPending ? 'Uploading…' : 'Upload PDF'}
          </button>
        </div>
      </div>

      {uploadId && (
        <div
          className={`rounded p-3 text-sm border ${
            status === 'failed' ? 'bg-red-50 border-red-200 text-red-700'
            : status === 'done' && uploadStatus?.error_message ? 'bg-amber-50 border-amber-200 text-amber-800'
            : status === 'done' ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          {status === 'done' && (
            <>
              Extracted {uploadStatus?.rows_upserted ?? 0} {rowNoun}(s).
              {uploadStatus?.error_message && <span className="block mt-1">Please check: {uploadStatus.error_message}</span>}
            </>
          )}
          {status === 'failed' && `Extraction failed: ${uploadStatus?.error_message ?? 'Unknown error'}`}
          {(!status || status === 'pending' || status === 'processing') &&
            'Extracting data from the PDF — this runs in the background and can take a minute or two…'}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {filters.map(f =>
          f.type === 'select' ? (
            <select key={f.key} value={values[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} className={inputCls}>
              <option value="">{f.placeholder ?? 'All'}</option>
              {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              key={f.key}
              type={f.type}
              value={values[f.key] ?? ''}
              onChange={e => set(f.key, e.target.value)}
              className={`${inputCls} ${f.width ?? ''}`}
              placeholder={f.placeholder}
            />
          ),
        )}
        {hasFilters && (
          <button onClick={() => { setValues({}); setPage(1); }} className="text-xs text-gray-400 hover:text-gray-700">Clear filters</button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{total} {rowNoun}(s)</span>
      </div>

      {/* Table */}
      {isError ? (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          Failed to load the {title} report. Please try again or contact support if this persists.
        </div>
      ) : isLoading ? (
        <div className="text-gray-400 text-sm py-8">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                {columns.map(c => (
                  <th key={c.header} className={`px-3 py-3 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">
                    {emptyHint ?? 'No records found. Upload a PDF to get started.'}
                  </td>
                </tr>
              ) : rows.map(row => (
                <tr key={rowKey(row)} className="hover:bg-gray-50">
                  {columns.map(c => (
                    <td key={c.header} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? 'text-gray-600'}`}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 items-center text-sm">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
