import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchPurchaseItems, fetchPurchaseItemGroups, createPurchaseItem } from '@/lib/api';
import { Plus, Search, X } from 'lucide-react';

const UNITS = ['KG', 'NOS', 'LTR', 'MTR', 'GM', 'ML', 'SET', 'KWH', 'SCM', 'Nos.', 'MTON', 'Kgs', 'Ltrs', 'Pair', 'Mtr', 'Box', 'Roll', 'Sheet', 'Bag', 'Drum', 'Can'];

interface ItemSearchCellProps {
  description: string;
  unit: string;
  item_id: string | null;
  idx: number;
  onChange: (idx: number, patch: { item_id?: string | null; description?: string; unit?: string }) => void;
}

export default function ItemSearchCell({ description, unit, item_id, idx, onChange }: ItemSearchCellProps) {
  const [query, setQuery]             = useState(description);
  const [open, setOpen]               = useState(false);
  const [filterGroup, setFilterGroup] = useState('');
  const [filterCat, setFilterCat]     = useState('');
  const [creating, setCreating]       = useState(false);
  const [newName, setNewName]         = useState('');
  const [newUnit, setNewUnit]         = useState('KG');
  const [newGroup, setNewGroup]       = useState('');
  const [newCat, setNewCat]           = useState('');
  const [dropPos, setDropPos]         = useState({ top: 0, left: 0, width: 480 });

  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);

  const { data: groups = {} } = useQuery<Record<string, string[]>>({
    queryKey: ['purchase-item-groups'],
    queryFn: fetchPurchaseItemGroups,
  });

  const { data: results = [] } = useQuery<any[]>({
    queryKey: ['purchase-items-search', query, filterGroup, filterCat],
    queryFn: () => fetchPurchaseItems(query, filterGroup, filterCat),
    enabled: open,
  });

  const openDropdown = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropHeight = 460;
      // flip up if not enough space below
      const top = spaceBelow >= dropHeight
        ? rect.bottom + window.scrollY + 4
        : rect.top + window.scrollY - dropHeight - 4;
      setDropPos({
        top,
        left:  rect.left + window.scrollX,
        width: Math.max(480, rect.width),
      });
    }
    setOpen(true);
  };

  // Close on outside click only — no scroll listener so scrolling inside works
  useEffect(() => {
    if (!open && !creating) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (inputRef.current?.contains(target) || dropRef.current?.contains(target)) return;
      setOpen(false);
      setCreating(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, creating]);

  const select = (item: any) => {
    onChange(idx, { item_id: item.item_id, description: item.item_name, unit: item.default_unit || unit });
    setQuery(item.item_name);
    setOpen(false);
    setCreating(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const created = await createPurchaseItem({
      item_name: newName.trim(),
      default_unit: newUnit,
      item_group: newGroup || null,
      category: newCat || null,
    });
    select(created);
    setNewName(''); setNewGroup(''); setNewCat(''); setNewUnit('KG');
  };

  const groupNames  = Object.keys(groups).sort();
  const catNames    = filterGroup ? (groups[filterGroup] ?? []).sort() : [];
  const newCatNames = newGroup    ? (groups[newGroup]    ?? []).sort() : [];

  const dropdown = createPortal(
    <div
      ref={dropRef}
      style={{
        position: 'absolute',
        top: dropPos.top,
        left: dropPos.left,
        width: dropPos.width,
        zIndex: 9999,
        display: (open || creating) ? 'block' : 'none',
      }}
      className="bg-white border border-gray-300 rounded-xl shadow-2xl"
    >
      {creating ? (
        /* ── Create new item panel ── */
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-800">New Item</p>
            <button onMouseDown={() => setCreating(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Group</label>
              <select value={newGroup} onChange={e => { setNewGroup(e.target.value); setNewCat(''); }}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full">
                <option value="">— Select group —</option>
                {groupNames.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Category</label>
              <select value={newCat} onChange={e => setNewCat(e.target.value)} disabled={!newGroup}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full disabled:opacity-50">
                <option value="">— Select category —</option>
                {newCatNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Item Name</label>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Hydrochloric Acid"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Unit</label>
            <select value={newUnit} onChange={e => setNewUnit(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full">
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button onMouseDown={handleCreate} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Save Item</button>
            <button onMouseDown={() => setCreating(false)} className="px-4 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      ) : (
        /* ── Search + filter panel ── */
        <>
          {/* Search input inside dropdown */}
          <div className="px-3 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); onChange(idx, { description: e.target.value, item_id: null }); }}
                placeholder="Search item name…"
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="px-3 pb-2 grid grid-cols-2 gap-2 border-b border-gray-100">
            <div>
              <label className="text-xs text-gray-400 block mb-0.5">Group</label>
              <select value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setFilterCat(''); }}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-full bg-gray-50 focus:outline-none">
                <option value="">All groups</option>
                {groupNames.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-0.5">Category</label>
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} disabled={!filterGroup}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-full bg-gray-50 focus:outline-none disabled:opacity-40">
                <option value="">All categories</option>
                {catNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Result count */}
          {results.length > 0 && (
            <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-50">
              {results.length} item{results.length !== 1 ? 's' : ''}
            </div>
          )}

          {/* Results list — tall, scrollable */}
          <div className="overflow-y-auto" style={{ maxHeight: 300 }}>
            {results.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">No items found</p>
            ) : (
              results.map((item: any) => (
                <div key={item.item_id} onMouseDown={() => select(item)}
                  className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 leading-tight">{item.item_name}</div>
                    {(item.item_group || item.category) && (
                      <div className="text-xs text-gray-400 mt-0.5 truncate">
                        {[item.item_group, item.category].filter(Boolean).join(' › ')}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 mt-0.5">{item.default_unit}</span>
                </div>
              ))
            )}
          </div>

          {/* Create new */}
          <div className="border-t border-gray-100 px-3 py-2.5">
            <button onMouseDown={() => { setCreating(true); setNewName(query); }}
              className="flex items-center gap-1.5 text-sm text-green-700 hover:text-green-800">
              <Plus className="w-3.5 h-3.5" /> Create new item
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openDropdown}
        className="w-full text-left border border-gray-300 rounded px-2 py-1.5 text-sm truncate bg-white hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {description
          ? <span className="text-gray-800">{description}</span>
          : <span className="text-gray-400">Search items…</span>
        }
      </button>
      <input ref={inputRef} className="sr-only" readOnly tabIndex={-1} />
      {dropdown}
    </div>
  );
}
