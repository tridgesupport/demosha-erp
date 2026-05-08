import React, { createContext, useContext, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface GlobalFilters {
  dateFrom: string | null;
  dateTo: string | null;
  fyKey: number | null;
  customerId: string | null;
  consigneeId: string | null;
  agentId: string | null;
  status: string[] | null;
  piFrom: number | null;
  piTo: number | null;
}

interface FiltersContextValue {
  filters: GlobalFilters;
  setFilter: <K extends keyof GlobalFilters>(key: K, value: GlobalFilters[K]) => void;
  clearAll: () => void;
  activeCount: number;
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: GlobalFilters = useMemo(() => ({
    dateFrom: searchParams.get('dateFrom'),
    dateTo: searchParams.get('dateTo'),
    fyKey: searchParams.get('fyKey') ? parseInt(searchParams.get('fyKey')!, 10) : null,
    customerId: searchParams.get('customerId'),
    consigneeId: searchParams.get('consigneeId'),
    agentId: searchParams.get('agentId'),
    status: searchParams.get('status') ? searchParams.get('status')!.split(',') : null,
    piFrom: searchParams.get('piFrom') ? parseInt(searchParams.get('piFrom')!, 10) : null,
    piTo: searchParams.get('piTo') ? parseInt(searchParams.get('piTo')!, 10) : null,
  }), [searchParams]);

  const activeCount = useMemo(() => {
    return Object.values(filters).filter((v) => v !== null && v !== undefined && (Array.isArray(v) ? v.length > 0 : true)).length;
  }, [filters]);

  const setFilter = <K extends keyof GlobalFilters>(key: K, value: GlobalFilters[K]) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
        next.delete(key);
      } else if (Array.isArray(value)) {
        next.set(key, value.join(','));
      } else {
        next.set(key, String(value));
      }
      return next;
    }, { replace: true });
  };

  const clearAll = () => {
    setSearchParams({}, { replace: true });
  };

  return (
    <FiltersContext.Provider value={{ filters, setFilter, clearAll, activeCount }}>
      {children}
    </FiltersContext.Provider>
  );
}

export function useFiltersContext() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFiltersContext must be used within FiltersProvider');
  return ctx;
}
