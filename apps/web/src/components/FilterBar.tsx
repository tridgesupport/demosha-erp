import { useFiltersContext } from '@/context/FiltersContext';
import { useQuery } from '@tanstack/react-query';
import { fetchFinancialYears, fetchAgents, fetchCustomers } from '@/lib/api';
import { X, SlidersHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { useState, useRef, useEffect } from 'react';

const STATUSES = ['draft', 'sent', 'approved', 'dispatched', 'invoiced', 'cancelled'];

export default function FilterBar() {
  const { filters, setFilter, clearAll, activeCount } = useFiltersContext();
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const { data: fyList = [] } = useQuery({ queryKey: ['financial-years'], queryFn: fetchFinancialYears });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents });
  const { data: customerRes } = useQuery({
    queryKey: ['customers-filter'],
    queryFn: () => fetchCustomers(undefined, undefined, 1, 200),
  });
  const customers: any[] = customerRes?.data ?? [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggleStatus = (s: string) => {
    const cur = filters.status ?? [];
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    setFilter('status', next.length > 0 ? next : null);
  };

  const handleFyChange = (fyKey: string) => {
    if (!fyKey) {
      setFilter('fyKey', null);
      setFilter('dateFrom', null);
      setFilter('dateTo', null);
      return;
    }
    const fy = fyList.find((f: any) => String(f.fy_key) === fyKey);
    setFilter('fyKey', parseInt(fyKey, 10));
    if (fy) {
      setFilter('dateFrom', fy.start_date ? format(new Date(fy.start_date), 'yyyy-MM-dd') : null);
      const end = fy.is_current ? format(new Date(), 'yyyy-MM-dd') : fy.end_date ? format(new Date(fy.end_date), 'yyyy-MM-dd') : null;
      setFilter('dateTo', end);
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 sticky top-14 z-30" ref={barRef}>
      <div className="max-w-screen-2xl mx-auto px-4 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle button */}
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 font-medium"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeCount > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {activeCount}
              </span>
            )}
          </button>

          {/* Quick chips for active filters */}
          {filters.fyKey && (
            <Chip
              label={`FY: ${fyList.find((f: any) => f.fy_key === filters.fyKey)?.fy_label ?? filters.fyKey}`}
              onRemove={() => { setFilter('fyKey', null); setFilter('dateFrom', null); setFilter('dateTo', null); }}
            />
          )}
          {filters.dateFrom && !filters.fyKey && (
            <Chip label={`From: ${filters.dateFrom}`} onRemove={() => setFilter('dateFrom', null)} />
          )}
          {filters.dateTo && !filters.fyKey && (
            <Chip label={`To: ${filters.dateTo}`} onRemove={() => setFilter('dateTo', null)} />
          )}
          {filters.customerId && (
            <Chip
              label={`Customer: ${customers.find((c) => c.customer_id === filters.customerId)?.party_name ?? '…'}`}
              onRemove={() => setFilter('customerId', null)}
            />
          )}
          {filters.agentId && (
            <Chip
              label={`Agent: ${(agents as any[]).find((a) => a.agent_id === filters.agentId)?.agent_name ?? '…'}`}
              onRemove={() => setFilter('agentId', null)}
            />
          )}
          {filters.status && filters.status.length > 0 && (
            <Chip label={`Status: ${filters.status.join(', ')}`} onRemove={() => setFilter('status', null)} />
          )}

          {activeCount > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-gray-500 hover:text-red-600 underline ml-1"
            >
              Clear all
            </button>
          )}
        </div>

        {open && (
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {/* FY */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Financial Year</label>
              <select
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={filters.fyKey ?? ''}
                onChange={(e) => handleFyChange(e.target.value)}
              >
                <option value="">All years</option>
                {(fyList as any[]).map((fy: any) => (
                  <option key={fy.fy_key} value={fy.fy_key}>{fy.fy_label}</option>
                ))}
              </select>
            </div>

            {/* Date from */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Date From</label>
              <input
                type="date"
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={filters.dateFrom ?? ''}
                onChange={(e) => setFilter('dateFrom', e.target.value || null)}
              />
            </div>

            {/* Date to */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Date To</label>
              <input
                type="date"
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={filters.dateTo ?? ''}
                onChange={(e) => setFilter('dateTo', e.target.value || null)}
              />
            </div>

            {/* Customer */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Customer / Buyer</label>
              <select
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={filters.customerId ?? ''}
                onChange={(e) => setFilter('customerId', e.target.value || null)}
              >
                <option value="">All customers</option>
                {customers.map((c) => (
                  <option key={c.customer_id} value={c.customer_id}>{c.party_name}</option>
                ))}
              </select>
            </div>

            {/* Agent */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">Agent</label>
              <select
                className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={filters.agentId ?? ''}
                onChange={(e) => setFilter('agentId', e.target.value || null)}
              >
                <option value="">All agents</option>
                {(agents as any[]).map((a: any) => (
                  <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>
                ))}
              </select>
            </div>

            {/* PI # range */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500">PI # Range</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  placeholder="From"
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-1/2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={filters.piFrom ?? ''}
                  onChange={(e) => setFilter('piFrom', e.target.value ? parseInt(e.target.value, 10) : null)}
                />
                <input
                  type="number"
                  placeholder="To"
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-1/2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={filters.piTo ?? ''}
                  onChange={(e) => setFilter('piTo', e.target.value ? parseInt(e.target.value, 10) : null)}
                />
              </div>
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1 col-span-2 md:col-span-4 lg:col-span-6">
              <label className="text-xs font-medium text-gray-500">Status</label>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStatus(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filters.status?.includes(s)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full">
      {label}
      <button onClick={onRemove} className="hover:text-blue-900">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}
