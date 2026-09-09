import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCustomers, fetchCustomer } from '@/lib/api';
import { ChevronDown, X } from 'lucide-react';

// Type-to-search customer/buyer picker. Queries the server's own `search`
// param (ILIKE on name + GSTIN) as the user types, rather than trying to
// preload "all" customers into a plain <select> — that approach silently
// truncated at the API's page-size cap once the customer list grew past it.
export default function CustomerCombobox({
  value,
  onChange,
  placeholder = 'Search customer by name or GSTIN…',
  className = '',
}: {
  value: string | null | undefined;
  onChange: (customer: any | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Resolve the currently-selected customer's name for display, in case it
  // wasn't the one just picked from a search (e.g. prefilled from a URL param).
  const { data: selectedCustomer } = useQuery({
    queryKey: ['customer', value],
    queryFn: () => fetchCustomer(value as string),
    enabled: !!value && !open,
  });

  useEffect(() => {
    if (!open && selectedCustomer) setSearch((selectedCustomer as any).customer_name ?? '');
    if (!value && !open) setSearch('');
  }, [selectedCustomer, value, open]);

  const { data: results, isLoading } = useQuery({
    queryKey: ['customers-combobox', debouncedSearch],
    queryFn: () => fetchCustomers(undefined, debouncedSearch || undefined, 1, 50),
    enabled: open,
  });
  const customers: any[] = (results as any)?.data ?? [];

  const handleSearchChange = (v: string) => {
    setSearch(v);
    setOpen(true);
    if (!v && value) onChange(null);
    clearTimeout((window as any).__customerSearchTimer);
    (window as any).__customerSearchTimer = setTimeout(() => setDebouncedSearch(v), 250);
  };

  const handleSelect = (c: any) => {
    onChange(c);
    setSearch(c.customer_name);
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setSearch('');
    setDebouncedSearch('');
  };

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <input
        type="text"
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        onFocus={() => { setOpen(true); setDebouncedSearch(search); }}
        placeholder={placeholder}
        className={`input w-full pr-14 ${className}`}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {value && (
          <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600 p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      </div>
      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-3 text-sm text-gray-400 text-center">Searching…</div>
          ) : customers.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400 text-center">
              {search.trim() ? 'No matching customers' : 'Start typing to search customers'}
            </div>
          ) : (
            customers.map((c) => (
              <button
                key={c.customer_id}
                type="button"
                onMouseDown={() => handleSelect(c)}
                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-center justify-between gap-4 ${
                  value === c.customer_id ? 'bg-blue-50 text-blue-700' : 'text-gray-800'
                }`}
              >
                <span className="font-medium">{c.customer_name}</span>
                <span className="text-xs text-gray-400 shrink-0">{c.gstin ?? ''}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
