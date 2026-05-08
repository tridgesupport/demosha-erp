import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFiltersContext } from '@/context/FiltersContext';
import { useOutstanding, useOutstandingSummary, useAlerts, useAcknowledgeAlert } from '@/hooks/useFinance';
import { syncTallyFile } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { formatINR } from '@/lib/calculations';
import OverdueBadge from '@/components/OverdueBadge';
import { Upload } from 'lucide-react';

type Tab = 'debtors' | 'creditors' | 'alerts';

export default function Outstanding() {
  const [tab, setTab] = useState<Tab>('debtors');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const partyType = tab === 'creditors' ? 'creditor' : 'debtor';

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await syncTallyFile(file);
      setUploadMsg(`✓ Synced ${res.inserted} records at ${new Date(res.syncedAt).toLocaleString()}`);
      qc.invalidateQueries({ queryKey: ['outstanding'] });
      qc.invalidateQueries({ queryKey: ['outstanding-summary'] });
    } catch {
      setUploadMsg('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Finance — Outstanding</h1>
        <div className="flex items-center gap-3">
          {uploadMsg && <span className="text-xs text-gray-500">{uploadMsg}</span>}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading…' : 'Upload Tally Export (.xlsx)'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['debtors', 'creditors', 'alerts'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'debtors' ? 'Sundry Debtors' : t === 'creditors' ? 'Sundry Creditors' : 'Alerts'}
          </button>
        ))}
      </div>

      {tab !== 'alerts' ? (
        <OutstandingTab partyType={partyType} />
      ) : (
        <AlertsTab />
      )}
    </div>
  );
}

function OutstandingTab({ partyType }: { partyType: string }) {
  const { filters } = useFiltersContext();
  const navigate = useNavigate();
  const { data: summary } = useOutstandingSummary(partyType);
  const { data: rows = [], isLoading } = useOutstanding(partyType, filters);

  const s = summary as any;

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Pending', value: s?.total_pending ?? 0, color: 'bg-blue-50' },
          { label: '90+ Days', value: s?.bucket_90plus ?? 0, color: 'bg-red-50' },    // computed by finance/summary
          { label: '60-89 Days', value: s?.bucket_60_89 ?? 0, color: 'bg-orange-50' },
          { label: '30-59 Days', value: s?.bucket_30_59 ?? 0, color: 'bg-yellow-50' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-lg border border-gray-200 p-4 ${color}`}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className="text-xl font-bold mt-1">{formatINR(value)}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 text-left">Party Name</th>
                <th className="px-4 py-2 text-left">GSTIN</th>
                <th className="px-4 py-2 text-right">Bills</th>
                <th className="px-4 py-2 text-right">Total Pending</th>
                <th className="px-4 py-2 text-center">Max Overdue</th>
                <th className="px-4 py-2 text-right">90+ Days (INR)</th>
                <th className="px-4 py-2 text-right">60-89 Days (INR)</th>
                <th className="px-4 py-2 text-right">30-59 Days (INR)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse" /></td></tr>
                ))
              ) : (rows as any[]).length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No outstanding records</td></tr>
              ) : (
                (rows as any[]).map((r) => {
                  const rowBg = r.max_overdue_days >= 90 ? 'bg-red-50' : r.max_overdue_days >= 60 ? 'bg-orange-50' : r.max_overdue_days >= 30 ? 'bg-yellow-50' : '';
                  return (
                    <tr
                      key={r.customer_id}
                      className={`hover:bg-blue-50 cursor-pointer ${rowBg}`}
                      onClick={() => navigate(`/customers/${r.customer_id}`)}
                    >
                      <td className="px-4 py-2.5 font-medium text-gray-800">{r.party_name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{r.gstin ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right">{r.bill_count}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatINR(r.total_pending)}</td>
                      <td className="px-4 py-2.5 text-center"><OverdueBadge days={r.max_overdue_days} /></td>
                      <td className="px-4 py-2.5 text-right text-red-600">{formatINR(r.overdue_90_plus)}</td>
                      <td className="px-4 py-2.5 text-right text-orange-600">{formatINR(r.overdue_60_89)}</td>
                      <td className="px-4 py-2.5 text-right text-yellow-600">{formatINR(r.overdue_30_59)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AlertsTab() {
  const [showAll, setShowAll] = useState(false);
  const [thresholdFilter, setThresholdFilter] = useState<number | undefined>();
  const { data: alerts = [], isLoading } = useAlerts(showAll ? undefined : false, thresholdFilter);
  const acknowledge = useAcknowledgeAlert();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show all (including acknowledged)
        </label>
        <div className="flex gap-2">
          {[undefined, 30, 60, 90].map((d) => (
            <button
              key={d ?? 'all'}
              onClick={() => setThresholdFilter(d)}
              className={`px-3 py-1 text-xs rounded-full border ${
                thresholdFilter === d ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {d == null ? 'All' : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th className="px-4 py-2 text-left">Party</th>
              <th className="px-4 py-2 text-right">Pending</th>
              <th className="px-4 py-2 text-center">Overdue</th>
              <th className="px-4 py-2 text-center">Threshold</th>
              <th className="px-4 py-2 text-left">Triggered</th>
              <th className="px-4 py-2 text-center">Status</th>
              <th className="px-4 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse" /></td></tr>
              ))
            ) : (alerts as any[]).length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No alerts</td></tr>
            ) : (
              (alerts as any[]).map((a) => (
                <tr key={a.alert_id} className={a.is_acknowledged ? 'opacity-50' : ''}>
                  <td className="px-4 py-2.5 font-medium">{a.party_name}</td>
                  <td className="px-4 py-2.5 text-right">{formatINR(a.pending_amount)}</td>
                  <td className="px-4 py-2.5 text-center"><OverdueBadge days={a.overdue_days} /></td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      a.threshold_days >= 90 ? 'bg-red-100 text-red-700' :
                      a.threshold_days >= 60 ? 'bg-orange-100 text-orange-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{a.threshold_days}d</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {a.triggered_at ? new Date(a.triggered_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {a.is_acknowledged ? (
                      <span className="text-xs text-green-600">Acknowledged</span>
                    ) : (
                      <span className="text-xs text-orange-500 font-medium">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!a.is_acknowledged && (
                      <button
                        onClick={() => acknowledge.mutate({ id: a.alert_id, acknowledgedBy: 'user' })}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Acknowledge
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
