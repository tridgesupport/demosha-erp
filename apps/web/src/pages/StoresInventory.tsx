import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { fetchStoresInventory, fetchStoresInventoryFilters } from '@/lib/api';

type InventoryRow = {
  item: string;
  stock_group: string | null;
  stock_group_parent: string | null;
  stock_category: string | null;
  uom: string | null;
  quantity_on_hand: number | string;
};

type SortKey = 'item' | 'stock_group' | 'stock_group_parent' | 'quantity_on_hand';

export default function StoresInventory() {
  const [search, setSearch] = useState('');
  const [stockGroup, setStockGroup] = useState('');
  const [stockGroupParent, setStockGroupParent] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('item');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { data: rows = [], isLoading, error } = useQuery<InventoryRow[]>({
    queryKey: ['stores-inventory'],
    queryFn: () => fetchStoresInventory() as Promise<InventoryRow[]>,
  });

  const { data: filters } = useQuery({
    queryKey: ['stores-inventory-filters'],
    queryFn: fetchStoresInventoryFilters,
  });

  const stockGroups = filters?.stock_groups ?? [];
  const stockGroupParents = filters?.stock_group_parents ?? [];

  const displayed = useMemo(() => {
    let r = rows;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((row) => row.item?.toLowerCase().includes(q));
    }
    if (stockGroup) r = r.filter((row) => row.stock_group === stockGroup);
    if (stockGroupParent) r = r.filter((row) => row.stock_group_parent === stockGroupParent);
    return [...r].sort((a, b) => {
      let av: string | number = a[sortKey] ?? '';
      let bv: string | number = b[sortKey] ?? '';
      if (sortKey === 'quantity_on_hand') {
        av = Number(av) || 0;
        bv = Number(bv) || 0;
      }
      const cmp = typeof av === 'number'
        ? (av as number) - (bv as number)
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, search, stockGroup, stockGroupParent, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />
      : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Stores Inventory</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Latest available stock per item in the stores/warehouse Tally company (packing
          material, engineering spares, electrical items — across DEMOSHA, Unit-2 and
          Western India Chemical godowns)
          {rows.length > 0 && ` — ${rows.length} items`}
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Stock Item</label>
          <input
            type="text"
            placeholder="Search item name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-56"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Stock Item Group</label>
          <select
            value={stockGroup}
            onChange={(e) => setStockGroup(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm w-48"
          >
            <option value="">All groups</option>
            {stockGroups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Parent Group</label>
          <select
            value={stockGroupParent}
            onChange={(e) => setStockGroupParent(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm w-48"
          >
            <option value="">All parent groups</option>
            {stockGroupParents.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        {(search || stockGroup || stockGroupParent) && (
          <button
            onClick={() => { setSearch(''); setStockGroup(''); setStockGroupParent(''); }}
            className="text-xs text-gray-500 hover:text-red-600 underline pb-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Failed to load stores inventory. The stores Tally data source may be unavailable.
        </div>
      ) : isLoading ? (
        <div className="text-gray-400 text-sm py-8">Loading…</div>
      ) : (
        <>
          <p className="text-xs text-gray-400">Showing {displayed.length} of {rows.length} items</p>
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  {([
                    ['item', 'Stock Item', 'text-left'],
                    ['stock_group', 'Stock Item Group', 'text-left'],
                    ['stock_group_parent', 'Parent Group', 'text-left'],
                    ['quantity_on_hand', 'Available Qty', 'text-right'],
                  ] as [SortKey, string, string][]).map(([key, label, align]) => (
                    <th
                      key={key}
                      className={`px-4 py-3 ${align} cursor-pointer select-none hover:text-gray-900`}
                      onClick={() => toggleSort(key)}
                    >
                      {label} <SortIcon col={key} />
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayed.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No items match the current filters</td></tr>
                ) : displayed.map((row) => (
                  <tr key={row.item} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{row.item}</td>
                    <td className="px-4 py-2.5 text-gray-600">{row.stock_group ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{row.stock_group_parent ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{Number(row.quantity_on_hand).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{row.uom ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
