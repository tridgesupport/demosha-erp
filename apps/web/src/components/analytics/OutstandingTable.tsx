import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { formatINR } from '@/lib/calculations';
import { useArSummary, useApSummary, useArBills, useApBills } from '@/hooks/useAnalytics';
import KpiRow from '@/components/analytics/KpiRow';
import OverdueBadge from '@/components/OverdueBadge';

type PartyType = 'debtors' | 'creditors';

// Tally-sourced AR/AP aging + open-bill drill-down. Shared by Analytics ->
// Outstanding (both tabs) and by Sales -> Sundry Debtors / Purchase ->
// Sundry Creditors, so all three surface the same books-of-record numbers.
export default function OutstandingTable({ partyType }: { partyType: PartyType }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const { data: ar = [] } = useArSummary();
  const { data: ap = [] } = useApSummary();
  const rows: any[] = (partyType === 'debtors' ? ar : ap) as any[];
  const nameKey = partyType === 'debtors' ? 'customer' : 'vendor';
  const label = partyType === 'debtors' ? 'Customer' : 'Vendor';

  // Both hooks are called unconditionally (Rules of Hooks) — only the one
  // for the active party type actually fetches, via each hook's `enabled` gate.
  const { data: arBills = [] } = useArBills(partyType === 'debtors' ? expanded ?? undefined : undefined);
  const { data: apBills = [] } = useApBills(partyType === 'creditors' ? expanded ?? undefined : undefined);
  const bills = partyType === 'debtors' ? arBills : apBills;

  // Close the suggestion list on outside click.
  useEffect(() => {
    if (!suggestOpen) return;
    const handler = (e: MouseEvent) => {
      if (!searchBoxRef.current?.contains(e.target as Node)) setSuggestOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [suggestOpen]);

  const query = search.trim().toLowerCase();
  const filteredRows = query ? rows.filter((r) => String(r[nameKey] ?? '').toLowerCase().includes(query)) : rows;
  const suggestions = useMemo(() => (query ? filteredRows.slice(0, 8) : []), [query, filteredRows]);

  const selectCompany = (name: string) => {
    setSearch(name);
    setSuggestOpen(false);
    setExpanded(name); // jump straight to that company's open bills
  };

  const clearSearch = () => {
    setSearch('');
    setSuggestOpen(false);
  };

  const totals = filteredRows.reduce(
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
      <KpiRow kpis={[
        { label: 'Total Outstanding', value: formatINR(totals.total), color: 'bg-blue-50' },
        { label: '0-30 Days', value: formatINR(totals.d0_30), color: 'bg-green-50' },
        { label: '31-90 Days', value: formatINR(totals.d31_60 + totals.d61_90), color: 'bg-yellow-50' },
        { label: '90+ Days', value: formatINR(totals.d90), color: 'bg-red-50' },
      ]} />

      <div ref={searchBoxRef} className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSuggestOpen(true); }}
          onFocus={() => setSuggestOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Escape') setSuggestOpen(false); }}
          placeholder={`Search ${label.toLowerCase()}…`}
          className="w-full border border-gray-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && (
          <button
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {suggestOpen && query && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
            {suggestions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">No {label.toLowerCase()} matches "{search}"</div>
            ) : (
              suggestions.map((r) => (
                <button
                  key={r[nameKey]}
                  onClick={() => selectCompany(r[nameKey])}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left hover:bg-blue-50"
                >
                  <span className="font-medium text-gray-800 truncate">{r[nameKey]}</span>
                  <span className="text-gray-500 shrink-0">{formatINR(r.total_outstanding)}</span>
                </button>
              ))
            )}
            {filteredRows.length > suggestions.length && (
              <div className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-100">
                +{filteredRows.length - suggestions.length} more — table below is filtered too
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">{label}</th>
              <th className="text-right px-3 py-2">Total Outstanding</th>
              <th className="text-right px-3 py-2">0-30</th>
              <th className="text-right px-3 py-2">31-60</th>
              <th className="text-right px-3 py-2">61-90</th>
              <th className="text-right px-3 py-2">90+</th>
              <th className="text-right px-3 py-2">Days Since Last {partyType === 'debtors' ? 'Invoice' : 'Purchase'}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                  No {label.toLowerCase()} matches "{search}"
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => {
                const name = r[nameKey];
                const daysSince = partyType === 'debtors' ? r.days_since_last_invoice : r.days_since_last_purchase;
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
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
