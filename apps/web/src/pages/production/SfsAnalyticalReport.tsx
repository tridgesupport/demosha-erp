import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { useSfsAnalyticalRegister, useUploadSfsAnalyticalReport, useSfsUploadStatus } from '@/hooks/useProduction';

const CLARITY_OPTIONS = ['EX.CLEAR', 'CLEAR', 'HAZY'];

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return String(d).slice(0, 10).split('-').reverse().join('/');
}

function num(v: any, digits = 2): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : String(v);
}

export default function SfsAnalyticalReport() {
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [batchNo, setBatchNo]     = useState('');
  const [clarity, setClarity]     = useState('');
  const [reactor, setReactor]     = useState('');
  const [purityMin, setPurityMin] = useState('');
  const [purityMax, setPurityMax] = useState('');
  const [page, setPage]           = useState(1);
  const [uploadId, setUploadId]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filters = { dateFrom, dateTo, batchNo, clarity, reactor, purityMin, purityMax };

  const { data, isLoading, isError, refetch: refetchRegister } = useSfsAnalyticalRegister({ ...filters, page });
  const rows: any[]   = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages    = Math.ceil(total / 100);

  const upload = useUploadSfsAnalyticalReport();
  const { data: uploadStatus } = useSfsUploadStatus(uploadId);
  const status = uploadStatus?.status;

  // Once extraction finishes, refresh the table once so newly-extracted rows show up.
  useEffect(() => {
    if (status === 'done') refetchRegister();
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

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setBatchNo(''); setClarity(''); setReactor(''); setPurityMin(''); setPurityMax(''); setPage(1);
  }
  const hasFilters = !!(dateFrom || dateTo || batchNo || clarity || reactor || purityMin || purityMax);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-gray-400">DLSP/F/02/00 — one row per batch</p>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileChange}
          />
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
            : status === 'done' ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          {status === 'done' && `Extracted ${uploadStatus?.rows_upserted ?? 0} batch row(s).`}
          {status === 'failed' && `Extraction failed: ${uploadStatus?.error_message ?? 'Unknown error'}`}
          {(!status || status === 'pending' || status === 'processing') &&
            'Extracting data from the PDF — this runs in the background and can take a minute or two…'}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="From date" />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="To date" />
        <input type="text" value={batchNo} onChange={e => { setBatchNo(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm w-28" placeholder="Batch no." />
        <select value={clarity} onChange={e => { setClarity(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm">
          <option value="">All Clarity</option>
          {CLARITY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" value={reactor} onChange={e => { setReactor(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm w-36" placeholder="Reactor brand" />
        <input type="number" value={purityMin} onChange={e => { setPurityMin(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm w-24" placeholder="Purity ≥" />
        <input type="number" value={purityMax} onChange={e => { setPurityMax(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm w-24" placeholder="Purity ≤" />
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-700">Clear filters</button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{total} batch row(s)</span>
      </div>

      {/* Table */}
      {isError ? (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          Failed to load the register. Please try again or contact support if this persists.
        </div>
      ) : isLoading ? (
        <div className="text-gray-400 text-sm py-8">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-3 text-left">Date</th>
                <th className="px-3 py-3 text-left">Batch No.</th>
                <th className="px-3 py-3 text-right">Purity %</th>
                <th className="px-3 py-3 text-right">Quantity (Kgs)</th>
                <th className="px-3 py-3 text-right">Y.R.</th>
                <th className="px-3 py-3 text-right">Zinc Used (Kgs)</th>
                <th className="px-3 py-3 text-right">EVPT Final Temp (°C)</th>
                <th className="px-3 py-3 text-right">BCCT Temp (°C)</th>
                <th className="px-3 py-3 text-left">1st Reactor</th>
                <th className="px-3 py-3 text-left">2nd Reactor</th>
                <th className="px-3 py-3 text-left">Clarity</th>
                <th className="px-3 py-3 text-right">NTU</th>
                <th className="px-3 py-3 text-left">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr><td colSpan={13} className="px-4 py-8 text-center text-gray-400">No records found. Upload a PDF to get started.</td></tr>
              ) : rows.map(row => (
                <tr key={row.register_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-800">{fmtDate(row.log_date)}</td>
                  <td className="px-3 py-2 font-medium text-blue-600">{row.batch_no}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.purity_pct)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.quantity_kgs, 0)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.yield_ratio, 3)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.zinc_used_kgs, 0)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.evpt_final_temp_c)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.bcct_temp_c)}</td>
                  <td className="px-3 py-2 text-gray-600">{row.reactor_1st_brand ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{row.reactor_2nd_brand ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{row.clarity ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{num(row.ntu, 0)}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-xs truncate" title={row.remarks ?? ''}>{row.remarks ?? '—'}</td>
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
