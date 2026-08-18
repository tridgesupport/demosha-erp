import { useState } from 'react';
import { formatINR } from '@/lib/calculations';
import { useArSummary, useApSummary, useArBills, useApBills } from '@/hooks/useAnalytics';
import KpiRow from '@/components/analytics/KpiRow';
import OverdueBadge from '@/components/OverdueBadge';

type Tab = 'debtors' | 'creditors';

export default function Outstanding() {
  const [tab, setTab] = useState<Tab>('debtors');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: ar = [] } = useArSummary();
  const { data: ap = [] } = useApSummary();
  const rows: any[] = (tab === 'debtors' ? ar : ap) as any[];
  const nameKey = tab === 'debtors' ? 'customer' : 'vendor';

  // Both hooks are called unconditionally (Rules of Hooks) — only the one
  // for the active tab actually fetches, via each hook's `enabled` gate.
  const { data: arBills = [] } = useArBills(tab === 'debtors' ? expanded ?? undefined : undefined);
  const { data: apBills = [] } = useApBills(tab === 'creditors' ? expanded ?? undefined : undefined);
  const bills = tab === 'debtors' ? arBills : apBills;

  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + Number(r.total_outstanding ?? 0),
      d0_30: acc.d0_30 + Number(r.due_0_30 ?? 0),
      d31_60: acc.d31_60 + Number(r.due_31_60 ?? 0),
      d61_90: acc.d61_90 + Number(r.due_61_90 ?? 0),
      d90: acc.d90 + Number(r.due_90_plus ?? 0),
    }),
    { total: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90: 0 },
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Outstanding — {tab === 'debtors' ? 'Receivables' : 'Payables'}</h1>

      <div className="flex gap-1 border-b border-gray-200">
        {(['debtors', 'creditors'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setExpanded(null); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t === 'debtors' ? 'Sundry Debtors (Customers owe us)' : 'Sundry Creditors (We owe vendors)'}
          </button>
        ))}
      </div>

      <KpiRow kpis={[
        { label: 'Total Outstanding', value: formatINR(totals.total), color: 'bg-blue-50' },
        { label: '0-30 Days', value: formatINR(totals.d0_30), color: 'bg-green-50' },
        { label: '31-90 Days', value: formatINR(totals.d31_60 + totals.d61_90), color: 'bg-yellow-50' },
        { label: '90+ Days', value: formatINR(totals.d90), color: 'bg-red-50' },
      ]} />

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">{tab === 'debtors' ? 'Customer' : 'Vendor'}</th>
              <th className="text-right px-3 py-2">Total Outstanding</th>
              <th className="text-right px-3 py-2">0-30</th>
              <th className="text-right px-3 py-2">31-60</th>
              <th className="text-right px-3 py-2">61-90</th>
              <th className="text-right px-3 py-2">90+</th>
              <th className="text-right px-3 py-2">Days Since Last {tab === 'debtors' ? 'Invoice' : 'Purchase'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const name = r[nameKey];
              const daysSince = tab === 'debtors' ? r.days_since_last_invoice : r.days_since_last_purchase;
              return (
                <>
                  <tr
                    key={name}
                    className="border-t border-gray-100 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpanded(expanded === name ? null : name)}
                  >
                    <td className="px-3 py-1.5 font-medium text-gray-800">{name}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{formatINR(r.total_outstanding)}</td>
                    <td className="px-3 py-1.5 text-right">{formatINR(r.due_0_30 ?? 0)}</td>
                    <td className="px-3 py-1.5 text-right">{formatINR(r.due_31_60 ?? 0)}</td>
                    <td className="px-3 py-1.5 text-right">{formatINR(r.due_61_90 ?? 0)}</td>
                    <td className="px-3 py-1.5 text-right text-red-600">{formatINR(r.due_90_plus ?? 0)}</td>
                    <td className="px-3 py-1.5 text-right"><OverdueBadge days={daysSince ?? 0} /></td>
                  </tr>
                  {expanded === name && (
                    <tr className="bg-gray-50">
                      <td colSpan={7} className="px-3 py-2">
                        <div className="text-xs font-semibold text-gray-500 mb-1">Open bills</div>
                        <table className="w-full text-xs">
                          <thead className="text-gray-400">
                            <tr>
                              <th className="text-left py-1">Bill Ref</th>
                              <th className="text-left py-1">Bill Date</th>
                              <th className="text-left py-1">Due Date</th>
                              <th className="text-right py-1">Amount</th>
                              <th className="text-right py-1">Age (days)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(bills as any[]).map((b, i) => (
                              <tr key={i} className="border-t border-gray-200">
                                <td className="py-1">{b.bill_ref}</td>
                                <td className="py-1">{b.bill_date ? new Date(b.bill_date).toLocaleDateString('en-IN') : '—'}</td>
                                <td className="py-1">{b.due_date ? new Date(b.due_date).toLocaleDateString('en-IN') : '—'}</td>
                                <td className="py-1 text-right">{formatINR(b.outstanding_amount)}</td>
                                <td className="py-1 text-right">{b.age_days}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
