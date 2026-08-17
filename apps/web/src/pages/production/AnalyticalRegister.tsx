import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { useAnalyticalRegister, useUploadAnalyticalRegister } from '@/hooks/useProduction';

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return String(d).slice(0, 10).split('-').reverse().join('/');
}

function num(v: any, digits = 2): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : String(v);
}

export default function AnalyticalRegister() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [page, setPage]         = useState(1);
  const [message, setMessage]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useAnalyticalRegister({ dateFrom, dateTo, page });
  const rows: any[]   = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages    = Math.ceil(total / 100);

  const upload = useUploadAnalyticalRegister();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage(null);
    try {
      const result: any = await upload.mutateAsync(file);
      setMessage(
        `Imported ${result.rowsInserted} batch row(s) across ${result.newDates} new date(s).` +
        (result.skippedDates ? ` ${result.skippedDates} date(s) already in the register were skipped.` : '')
      );
      setPage(1);
    } catch (err: any) {
      setMessage(`Upload failed: ${err?.message ?? 'Unknown error'}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SHS Analytical Register</h1>
          <p className="text-xs text-gray-400 mt-0.5">QCRD/F/13/01 — one row per batch</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={upload.isPending}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" /> {upload.isPending ? 'Uploading…' : 'Upload Excel'}
          </button>
        </div>
      </div>

      {message && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
          {message}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="From date" />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="To date" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
            className="text-xs text-gray-400 hover:text-gray-700">Clear filters</button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{total} batch row(s)</span>
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm py-8">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-3 text-left">Date</th>
                <th className="px-3 py-3 text-left">Batch No.</th>
                <th className="px-3 py-3 text-left">Zinc Used</th>
                <th className="px-3 py-3 text-right">%Passes 240</th>
                <th className="px-3 py-3 text-right">%Passes 150</th>
                <th className="px-3 py-3 text-right">%Passes 44</th>
                <th className="px-3 py-3 text-right">%age</th>
                <th className="px-3 py-3 text-right">Quantity (Kgs)</th>
                <th className="px-3 py-3 text-right">Y.R.</th>
                <th className="px-3 py-3 text-right">86% Basis (Kgs)</th>
                <th className="px-3 py-3 text-left">Clarity</th>
                <th className="px-3 py-3 text-right">NTU</th>
                <th className="px-3 py-3 text-left">Grade</th>
                <th className="px-3 py-3 text-left">Tax Grade</th>
                <th className="px-3 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-right">Carboys</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr><td colSpan={16} className="px-4 py-8 text-center text-gray-400">No records found. Upload an Excel register to get started.</td></tr>
              ) : rows.map(row => (
                <tr key={row.register_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-800">{fmtDate(row.log_date)}</td>
                  <td className="px-3 py-2 font-medium text-blue-600">{row.batch_no}</td>
                  <td className="px-3 py-2 text-gray-600">{row.zinc_used ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.passes_240_pct)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.passes_150_pct)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.passes_44_pct)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.pct_age)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.quantity_kgs, 0)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.yr, 3)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.wt_86_basis_kgs, 0)}</td>
                  <td className="px-3 py-2 text-gray-600">{row.clarity ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.ntu, 0)}</td>
                  <td className="px-3 py-2 text-gray-600">{row.grade ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{row.tax_grade ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{row.approval_status ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{row.carboys ?? '—'}</td>
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
