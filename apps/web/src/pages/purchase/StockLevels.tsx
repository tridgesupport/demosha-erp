import { useState, useMemo, useEffect } from 'react';
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

const STATUS_CONFIG: Record<StockStatus, { label: string; rowClass: string; badgeClass: string; Icon: React.ElementType }> = {
  critical:   { label: 'Low Stock',    rowClass: 'bg-red-50',    badgeClass: 'bg-red-100 text-red-700',    Icon: TrendingDown  },
  low:        { label: 'Near Minimum', rowClass: 'bg-amber-50',  badgeClass: 'bg-amber-100 text-amber-700', Icon: AlertTriangle },
  ok:         { label: 'OK',           rowClass: '',             badgeClass: 'bg-green-100 text-green-700', Icon: CheckCircle   },
  excess:     { label: 'Overstocked',  rowClass: 'bg-blue-50',   badgeClass: 'bg-blue-100 text-blue-700',   Icon: TrendingUp    },
  no_minimum: { label: 'No Min Set',   rowClass: '',             badgeClass: 'bg-gray-100 text-gray-500',   Icon: MinusCircle   },
};

function pct(current: number, min: number | null): string {
  if (!min) return '—';
  return `${Math.round((current / min) * 100)}%`;
}

export default function StockLevels() {
  const queryClient = useQueryClient();

  const [search,    setSearch]    = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category,  setCategory]  = useState('');
  const [alertOnly, setAlertOnly] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [editStock, setEditStock] = useState('');
  const [editMin,   setEditMin]   = useState('');

  const { data: rows = [], isLoading } = useQuery<StockItem[]>({
    queryKey: ['stock-levels', debouncedSearch, category, alertOnly],
    queryFn: () => fetchStockLevels({ q: debouncedSearch, category, alert_only: alertOnly }) as Promise<StockItem[]>,
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

  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { current_stock?: number | null; min_level?: number | null } }) =>
      updateItemStock(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      setEditingId(null);
    },
  });

  function startEdit(item: StockItem) {
    setEditingId(item.item_id);
    setEditStock(String(item.current_stock));
    setEditMin(item.min_level != null ? String(item.min_level) : '');
  }

  function cancelEdit() {
    setEditingId(null);
  }

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
    const s = getStockStatus(r.current_stock, r.min_level);
    return s === 'critical' || s === 'low' || s === 'excess';
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
            {alertCount} item{alertCount !== 1 ? 's' : ''} need attention
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <span key={key} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium ${cfg.badgeClass}`}>
            <cfg.Icon className="w-3 h-3" />
            {cfg.label}
            {key === 'critical' && ' (>10% below min)'}
            {key === 'excess'   && ' (>10% above min)'}
          </span>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search item name or code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64"
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={alertOnly}
            onChange={e => setAlertOnly(e.target.checked)}
            className="rounded"
          />
          <span className="text-gray-700">Show alerts only</span>
        </label>
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm py-8">Loading…</div>
      ) : (
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    {alertOnly ? 'No stock alerts — all items are within range' : 'No items found'}
                  </td>
                </tr>
              ) : rows.map(item => {
                const status = getStockStatus(item.current_stock, item.min_level);
                const cfg    = STATUS_CONFIG[status];
                const isEditing = editingId === item.item_id;

                return (
                  <tr key={item.item_id} className={`${cfg.rowClass} hover:brightness-95 transition-colors`}>
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{item.item_code ?? '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{item.item_name}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{item.category ?? '—'}</td>

                    {/* Current Stock */}
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

                    {/* Min Level */}
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
                      {pct(item.current_stock, item.min_level)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{item.default_unit ?? '—'}</td>

                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badgeClass}`}>
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
      )}

      <p className="text-xs text-gray-400">
        Stock as on {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.
        Click the edit icon to update current stock or minimum level for any item.
      </p>
    </div>
  );
}
