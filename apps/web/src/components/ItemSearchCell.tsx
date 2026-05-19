import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchPurchaseItems, fetchPurchaseItemGroups, createPurchaseItem } from '@/lib/api';
import { Plus, Search } from 'lucide-react';

const UNITS = ['KG', 'NOS', 'LTR', 'MTR', 'GM', 'ML', 'SET', 'KWH', 'SCM', 'Nos.', 'MTON', 'Kgs', 'Ltrs', 'Pair', 'Mtr', 'Box', 'Roll', 'Sheet', 'Bag', 'Drum', 'Can'];

interface ItemSearchCellProps {
  description: string;
  unit: string;
  item_id: string | null;
  idx: number;
  onChange: (idx: number, patch: { item_id?: string | null; description?: string; unit?: string }) => void;
}

export default function ItemSearchCell({ description, unit, item_id, idx, onChange }: ItemSearchCellProps) {
  const [query, setQuery]               = useState(description);
  const [open, setOpen]                 = useState(false);
  const [filterGroup, setFilterGroup]   = useState('');
  const [filterCat, setFilterCat]       = useState('');
  const [creating, setCreating]         = useState(false);
  const [newName, setNewName]           = useState('');
  const [newUnit, setNewUnit]           = useState('KG');
  const [newGroup, setNewGroup]         = useState('');
  const [newCat, setNewCat]             = useState('');
  const [dropPos, setDropPos]           = useState({ top: 0, left: 0, width: 320 });

  const inputRef  = useRef<HTMLInputElement>(null);
  const dropRef   = useRef<HTMLDivElement>(null);

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
      setDropPos({
        top:   rect.bottom + window.scrollY + 2,
        left:  rect.left   + window.scrollX,
        width: Math.max(420, rect.width),
      });
    }
    setOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (inputRef.current?.contains(target) || dropRef.current?.contains(target)) return;
      setOpen(false);
      setCreating(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on scroll
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [open]);

  const select = (item: any) => {
    onChange(idx, { item_id: item.item_id, description: item.item_name, unit: item.default_unit || unit });
    setQuery(item.item_name);
    setOpen(false);
    setCreating(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const created = await createPurchaseItem({ item_name: newName.trim(), default_unit: newUnit, item_group: newGroup || null, category: newCat || null });
    select(created);
    setNewName(''); setNewGroup(''); setNewCat(''); setNewUnit('KG');
  };

  const groupNames   = Object.keys(groups).sort();
  const catNames     = filterGroup ? (groups[filterGroup] ?? []).sort() : [];
  const newCatNames  = newGroup    ? (groups[newGroup]    ?? []).sort() : [];

  const dropdown = (open || creating) && createPortal(
    <div
      ref={dropRef}
      style={{ position: 'absolute', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-lg shadow-2xl"
    >
      {creating ? (
        <div className="p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-700 mb-1">New Item</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-0.5">Group</label>
              <select value={newGroup} onChange={e => { setNewGroup(e.target.value); setNewCat(''); }}
                className="border border-gray-300 rounded px-2 py-1 text-xs w-full">
                <option value="">— Select —</option>
                {groupNames.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-0.5">Category</label>
              <select value={newCat} onChange={e => setNewCat(e.target.value)} disabled={!newGroup}
                className="border border-gray-300 rounded px-2 py-1 text-xs w-full disabled:opacity-50">
                <option value="">— Select —</option>
                {newCatNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-0.5">Item Name</label>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Item name"
              className="border border-gray-300 rounded px-2 py-1 text-xs w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-0.5">Unit</label>
            <select value={newUnit} onChange={e => setNewUnit(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs w-full">
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button onMouseDown={handleCreate} className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Save</button>
            <button onMouseDown={() => setCreating(false)} className="px-3 py-1 border text-xs rounded">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="px-3 pt-3 pb-2 border-b border-gray-100 grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-0.5">Group</label>
              <select value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setFilterCat(''); }}
                className="border border-gray-200 rounded px-2 py-1 text-xs w-full bg-gray-50">
                <option value="">All groups</option>
                {groupNames.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-0.5">Category</label>
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} disabled={!filterGroup}
                className="border border-gray-200 rounded px-2 py-1 text-xs w-full bg-gray-50 disabled:opacity-50">
                <option value="">All categories</option>
                {catNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Results */}
          <div className="max-h-56 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-400">No items found</p>
            ) : (
              results.map((item: any) => (
                <div key={item.item_id} onMouseDown={() => select(item)}
                  className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800">{item.item_name}</span>
                    <span className="text-xs text-gray-400 shrink-0">{item.default_unit}</span>
                  </div>
                  {(item.item_group || item.category) && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      {[item.item_group, item.category].filter(Boolean).join(' › ')}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Create new */}
          <div className="border-t border-gray-100">
            <div onMouseDown={() => { setCreating(true); setNewName(query); }}
              className="px-3 py-2 hover:bg-green-50 cursor-pointer text-xs text-green-700 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Create new item
            </div>
          </div>
        </>
      )}
    </div>,
    document.body
  );

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(idx, { description: e.target.value, item_id: null }); if (!open) openDropdown(); }}
          onFocus={openDropdown}
          placeholder="Search items…"
          className="border border-gray-300 rounded px-2 py-1 text-sm w-full min-w-0"
        />
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
      </div>
      {item_id && <div className="text-xs text-blue-500 mt-0.5 truncate">{description}</div>}
      {dropdown}
    </div>
  );
}
