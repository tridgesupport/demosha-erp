import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, TrendingDown, TrendingUp, CheckCircle, MinusCircle, Edit2, X, Check } from 'lucide-react';
import { fetchStockLevels, updateItemStock, fetchPurchaseItemGroups } from '@/lib/api';

type StockItem = {
  item_id: string;
  item_code: string | null;
  item_name: string;
  default_unit: string | null;
  item_group: string | null;
  category: string | null;
  current_stock: number;
  min_level: number | null;
};

type StockStatus = 'critical' | 'low' | 'ok' | 'excess' | 'no_minimum';

function getStockStatus(current: number, min: number | null): StockStatus {
  if (min == null || min === 0) return 'no_minimum';
  const ratio = current / min;
  if (ratio < 0.9)  return 'critical';
  if (ratio < 1.0)  return 'low';
  if (ratio > 1.1)  return 'excess';
  return 'ok';
}

const STATUS_CONFIG: Record<StockStatus, { label: string; rowClass: string; badgeClass: string; activeBadgeClass: string; Icon: React.ElementType }> = {
  critical:   { label: 'Low Stock',    rowClass: 'bg-red-50',   badgeClass: 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-700',    activeBadgeClass: 'bg-red-100 text-red-700 ring-2 ring-red-400',    Icon: TrendingDown  },
  low:        { label: 'Near Minimum', rowClass: 'bg-amber-50', badgeClass: 'bg-gray-100 text-gray-500 hover:bg-amber-100 hover:text-amber-700', activeBadgeClass: 'bg-amber-100 text-amber-700 ring-2 ring-amber-400', Icon: AlertTriangle },
  ok:         { label: 'OK',           rowClass: '',            badgeClass: 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700',  activeBadgeClass: 'bg-green-100 text-green-700 ring-2 ring-green-400',  Icon: CheckCircle   },
  excess:     { label: 'Overstocked',  rowClass: 'bg-blue-50',  badgeClass: 'bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-700',   activeBadgeClass: 'bg-blue-100 text-blue-700 ring-2 ring-blue-400',   Icon: TrendingUp    },
  no_minimum: { label: 'No Min Set',   rowClass: '',            badgeClass: 'bg-gray-100 text-gray-500 hover:bg-gray-200',                        activeBadgeClass: 'bg-gray-200 text-gray-600 ring-2 ring-gray-400',   Icon: MinusCircle   },
};

function pct(current: number, min: number | null): string {
  if (!min) return '—';
  return `${Math.round((current / min) * 100)}%`;
}

// Searchable category combobox
function CategoryCombobox({ categories, value, onChange }: { categories: string[]; value: string; onChange: (v: string) => void }) {
  const [inputVal, setInputVal] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() =>
    inputVal.trim() === ''
      ? categories
      : categories.filter(c => c.toLowerCase().includes(inputVal.toLowerCase())),
    [categories, inputVal]
  );

  useEffect(() => { setInputVal(value); }, [value]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function select(c: string) {
    onChange(c);
    setInputVal(c);
    setOpen(false);
  }

  function clear() {
    onChange('');
    setInputVal('');
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center border border-gray-300 rounded overflow-hidden">
        <input
          type="text"
          placeholder="All categories…"
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="px-3 py-1.5 text-sm w-44 focus:outline-none"
        />
        {(inputVal || value) && (
          <button onClick={clear} className="px-2 text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg text-sm">
          <li
            className="px-3 py-1.5 text-gray-400 hover:bg-gray-50 cursor-pointer"
            onMouseDown={() => clear()}
          >
            All categories
          </li>
          {filtered.map(c => (
            <li
              key={c}
              className={`px-3 py-1.5 cursor-pointer hover:bg-blue-50 ${value === c ? 'font-medium text-blue-700 bg-blue-50' : 'text-gray-700'}`}
              onMouseDown={() => select(c)}
            >
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function StockLevels() {
  const queryClient = useQueryClient();

  const [search,          setSearch]          = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category,        setCategory]        = useState('');
  const [alertOnly,       setAlertOnly]       = useState(true);
  const [statusFilter,    setStatusFilter]    = useState<StockStatus[]>([]);
  const [editingId,       setEditingId]       = useState<string | null>(null);
  const [editStock,       setEditStock]       = useState('');
  const [editMin,         setEditMin]         = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: rows = [], isLoading } = useQuery<StockItem[]>({
    queryKey: ['stock-levels', debouncedSearch, alertOnly],
    queryFn: () => fetchStockLevels({ q: debouncedSearch, alert_only: alertOnly }) as Promise<StockItem[]>,
  });

  const { data: groups = {} } = useQuery<Record<string, string[]>>({
    queryKey: ['purchase-item-groups'],
    queryFn: () => fetchPurchaseItemGroups() as Promise<Record<string, string[]>>,
  });

  const categories = useMemo(() => {
    const cats = new Set<string>();
    Object.values(groups).forEach(cs => cs.forEach(c => cats.add(c)));
    rows.forEach(r => r.category && cats.add(r.category));
    return Array.from(cats).sort();
  }, [groups, rows]);

  const displayed = useMemo(() => {
    let r = rows;
    if (category) {
      r = r.filter(item => (item.category ?? '').toLowerCase().includes(category.toLowerCase()));
    }
    if (statusFilter.length > 0) {
      r = r.filter(item => statusFilter.includes(getStockStatus(Number(item.current_stock), item.min_level)));
    }
    return r;
  }, [rows, category, statusFilter]);

  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { current_stock?: number | null; min_level?: number | null } }) =>
      updateItemStock(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      setEditingId(null);
    },
  });

  function toggleStatus(s: StockStatus) {
    setStatusFilter(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  }

  function startEdit(item: StockItem) {
    setEditingId(item.item_id);
    setEditStock(String(item.current_stock));
    setEditMin(item.min_level != null ? String(item.min_level) : '');
  }

  function cancelEdit() { setEditingId(null); }

  function saveEdit(itemId: string) {
    mutation.mutate({
      id: itemId,
      body: {
        current_stock: editStock !== '' ? Number(editStock) : 0,
        min_level:     editMin   !== '' ? Number(editMin)   : null,
      },
    });
  }

  const alertCount = rows.filter(r => {
    const s = getStockStatus(Number(r.current_stock), r.min_level);
    return s === 'critical' || s === 'low';
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Levels</h1>
          <p className="text-sm text-gray-500 mt-0.5">Packing material stock vs minimum required levels</p>
        </div>

        {alertCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
            <AlertTriangle className="w-4 h-4" />
            {alertCount} item{alertCount !== 1 ? 's' : ''} below minimum
          </div>
        )}
      </div>

      {/* Status filter chips — click to filter */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-gray-400 text-xs self-center mr-1">Filter by status:</span>
        {(Object.entries(STATUS_CONFIG) as [StockStatus, typeof STATUS_CONFIG[StockStatus]][]).map(([key, cfg]) => {
          const active = statusFilter.includes(key);
          return (
            <button
              key={key}
              onClick={() => toggleStatus(key)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium transition-all cursor-pointer ${active ? cfg.activeBadgeClass : cfg.badgeClass}`}
            >
              <cfg.Icon className="w-3 h-3" />
              {cfg.label}
            </button>
          );
        })}
        {statusFilter.length > 0 && (
          <button onClick={() => setStatusFilter([])} className="text-xs text-gray-400 hover:text-gray-600 underline self-center">
            Clear
          </button>
        )}
      </div>

      {/* Search + category + alert toggle */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search item name or code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64"
        />
        <CategoryCombobox categories={categories} value={category} onChange={setCategory} />
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={alertOnly}
            onChange={e => setAlertOnly(e.target.checked)}
            className="rounded"
          />
          <span className="text-gray-700">Alerts only</span>
        </label>
        {(search || category || statusFilter.length > 0) && (
          <button
            onClick={() => { setSearch(''); setDebouncedSearch(''); setCategory(''); setStatusFilter([]); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Reset filters
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm py-8">Loading…</div>
      ) : (
        <>
          <p className="text-xs text-gray-400">
            Showing {displayed.length} of {rows.length} items
          </p>
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Item Name</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-right">Current Stock</th>
                  <th className="px-4 py-3 text-right">Min Level</th>
                  <th className="px-4 py-3 text-right">% of Min</th>
                  <th className="px-4 py-3 text-left">Unit</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-center">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                      {alertOnly && statusFilter.length === 0 && !search && !category
                        ? 'No stock alerts — all items are within range'
                        : 'No items match the current filters'}
                    </td>
                  </tr>
                ) : displayed.map(item => {
                  const status = getStockStatus(Number(item.current_stock), item.min_level);
                  const cfg    = STATUS_CONFIG[status];
                  const isEditing = editingId === item.item_id;

                  return (
                    <tr key={item.item_id} className={`${cfg.rowClass} hover:brightness-95 transition-colors`}>
                      <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{item.item_code ?? '—'}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{item.item_name}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{item.category ?? '—'}</td>

                      <td className="px-4 py-2.5 text-right font-mono">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editStock}
                            onChange={e => setEditStock(e.target.value)}
                            className="w-24 border border-gray-300 rounded px-2 py-1 text-right text-sm"
                            min={0}
                          />
                        ) : (
                          <span className={status === 'critical' ? 'text-red-700 font-bold' : ''}>
                            {Number(item.current_stock).toLocaleString('en-IN')}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-2.5 text-right font-mono text-gray-600">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editMin}
                            onChange={e => setEditMin(e.target.value)}
                            placeholder="—"
                            className="w-24 border border-gray-300 rounded px-2 py-1 text-right text-sm"
                            min={0}
                          />
                        ) : (
                          item.min_level != null
                            ? Number(item.min_level).toLocaleString('en-IN')
                            : <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-2.5 text-right text-gray-500 font-mono text-xs">
                        {pct(Number(item.current_stock), item.min_level)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{item.default_unit ?? '—'}</td>

                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.activeBadgeClass}`}>
                          <cfg.Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>

                      <td className="px-4 py-2.5 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => saveEdit(item.item_id)}
                              disabled={mutation.isPending}
                              className="p-1 text-green-600 hover:text-green-800 disabled:opacity-40"
                              title="Save"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 text-gray-400 hover:text-gray-600"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(item)}
                            className="p-1 text-gray-400 hover:text-blue-600"
                            title="Edit stock levels"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-gray-400">
        Stock as on {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.
        Click the edit icon to update current stock or minimum level for any item.
      </p>
    </div>
  );
}
