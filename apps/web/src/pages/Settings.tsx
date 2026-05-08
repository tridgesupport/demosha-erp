import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStates, fetchFinancialYears, setCurrentFY, createFY, fetchPackagingTypes, createPackagingType, updatePackagingType, deletePackagingType, fetchAgents, createAgent, updateAgent } from '@/lib/api';
import { Edit2, Trash2, Plus, Save, X } from 'lucide-react';

type Tab = 'states' | 'financial-years' | 'packaging' | 'agents';

export default function Settings() {
  const [tab, setTab] = useState<Tab>('states');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <div className="flex border-b border-gray-200">
        {(['states', 'financial-years', 'packaging', 'agents'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 text-sm font-medium border-b-2 capitalize transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'financial-years' ? 'Financial Years' : t === 'packaging' ? 'Packaging Types' : t}
          </button>
        ))}
      </div>

      {tab === 'states' && <StatesTab />}
      {tab === 'financial-years' && <FYTab />}
      {tab === 'packaging' && <PackagingTab />}
      {tab === 'agents' && <AgentsTab />}
    </div>
  );
}

function StatesTab() {
  const { data: states = [] } = useQuery({ queryKey: ['states'], queryFn: fetchStates });
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
            <th className="px-4 py-2 text-left">Code</th>
            <th className="px-4 py-2 text-left">State Name</th>
            <th className="px-4 py-2 text-left">Region</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {(states as any[]).map((s) => (
            <tr key={s.state_code}>
              <td className="px-4 py-2 font-mono font-medium">{s.state_code}</td>
              <td className="px-4 py-2">{s.state_name}</td>
              <td className="px-4 py-2 text-gray-500">{s.region}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FYTab() {
  const qc = useQueryClient();
  const { data: fyList = [] } = useQuery({ queryKey: ['financial-years'], queryFn: fetchFinancialYears });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ fy_key: '', fy_label: '', start_date: '', end_date: '', is_current: false });

  const setCurrent = useMutation({
    mutationFn: (fyKey: number) => setCurrentFY(fyKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['financial-years'] }),
  });

  const addFY = useMutation({
    mutationFn: () => createFY({ ...form, fy_key: parseInt(form.fy_key, 10) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['financial-years'] }); setShowAdd(false); },
  });

  return (
    <div className="space-y-4">
      <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50">
        <Plus className="w-4 h-4" /> Add Financial Year
      </button>

      {showAdd && (
        <div className="bg-white border rounded-lg p-4 space-y-3 max-w-sm">
          <h3 className="font-semibold text-sm">Add Financial Year</h3>
          {(['fy_key', 'fy_label', 'start_date', 'end_date'] as const).map((f) => (
            <div key={f}>
              <label className="text-xs text-gray-400 capitalize">{f.replace('_', ' ')}</label>
              <input
                type={f.includes('date') ? 'date' : 'text'}
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm mt-0.5"
                value={form[f]}
                onChange={(e) => setForm({ ...form, [f]: e.target.value })}
              />
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_current} onChange={(e) => setForm({ ...form, is_current: e.target.checked })} />
            Set as current year
          </label>
          <div className="flex gap-2">
            <button onClick={() => addFY.mutate()} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">Save</button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 border rounded text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th className="px-4 py-2 text-left">Key</th>
              <th className="px-4 py-2 text-left">Label</th>
              <th className="px-4 py-2 text-left">Start</th>
              <th className="px-4 py-2 text-left">End</th>
              <th className="px-4 py-2 text-center">Current</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(fyList as any[]).map((fy) => (
              <tr key={fy.fy_key}>
                <td className="px-4 py-2 font-mono">{fy.fy_key}</td>
                <td className="px-4 py-2 font-medium">{fy.fy_label}</td>
                <td className="px-4 py-2 text-gray-500">{fy.start_date}</td>
                <td className="px-4 py-2 text-gray-500">{fy.end_date}</td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => !fy.is_current && setCurrent.mutate(fy.fy_key)}
                    className={`text-xs px-2 py-0.5 rounded-full ${fy.is_current ? 'bg-green-100 text-green-700 cursor-default' : 'bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-600'}`}
                  >
                    {fy.is_current ? '✓ Current' : 'Set current'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PackagingTab() {
  const qc = useQueryClient();
  const { data: pkgTypes = [] } = useQuery({ queryKey: ['packaging-types'], queryFn: fetchPackagingTypes });
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');

  const create = useMutation({ mutationFn: () => createPackagingType(newName), onSuccess: () => { qc.invalidateQueries({ queryKey: ['packaging-types'] }); setNewName(''); } });
  const update = useMutation({ mutationFn: () => updatePackagingType(editId!, editName), onSuccess: () => { qc.invalidateQueries({ queryKey: ['packaging-types'] }); setEditId(null); } });
  const remove = useMutation({ mutationFn: (id: number) => deletePackagingType(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['packaging-types'] }) });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          placeholder="New packaging type…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button onClick={() => create.mutate()} disabled={!newName} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50">Add</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden max-w-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th className="px-4 py-2 text-left">ID</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(pkgTypes as any[]).map((p) => (
              <tr key={p.pkg_id}>
                <td className="px-4 py-2 text-gray-400">{p.pkg_id}</td>
                <td className="px-4 py-2">
                  {editId === p.pkg_id ? (
                    <input
                      className="border rounded px-2 py-0.5 text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  ) : (
                    p.pkg_name
                  )}
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  {editId === p.pkg_id ? (
                    <>
                      <button onClick={() => update.mutate()} className="text-green-600 hover:text-green-800"><Save className="w-3.5 h-3.5 inline" /></button>
                      <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5 inline" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditId(p.pkg_id); setEditName(p.pkg_name); }} className="text-gray-400 hover:text-blue-600"><Edit2 className="w-3.5 h-3.5 inline" /></button>
                      <button
                        onClick={() => remove.mutate(p.pkg_id)}
                        disabled={parseInt(p.active_variant_count, 10) > 0}
                        title={parseInt(p.active_variant_count, 10) > 0 ? 'In use by active variants' : 'Delete'}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgentsTab() {
  const qc = useQueryClient();
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ agent_name: '', contact_phone: '', contact_email: '' });

  const createA = useMutation({ mutationFn: () => createAgent(addForm), onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); setShowAdd(false); setAddForm({ agent_name: '', contact_phone: '', contact_email: '' }); } });
  const updateA = useMutation({ mutationFn: () => updateAgent(editId!, editForm), onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); setEditId(null); } });

  return (
    <div className="space-y-4">
      <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50">
        <Plus className="w-4 h-4" /> Add Agent
      </button>

      {showAdd && (
        <div className="bg-white border rounded-lg p-4 space-y-2 max-w-sm">
          {(['agent_name', 'contact_phone', 'contact_email'] as const).map((f) => (
            <div key={f}>
              <label className="text-xs text-gray-400 capitalize">{f.replace('_', ' ')}</label>
              <input className="w-full border border-gray-300 rounded px-2 py-1 text-sm mt-0.5" value={addForm[f]} onChange={(e) => setAddForm({ ...addForm, [f]: e.target.value })} />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={() => createA.mutate()} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">Save</button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 border rounded text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Phone</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-center">Active</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(agents as any[]).map((a) => (
              <tr key={a.agent_id}>
                {editId === a.agent_id ? (
                  <>
                    <td className="px-4 py-2"><input className="border rounded px-2 py-0.5 text-sm w-full" value={editForm.agent_name ?? ''} onChange={(e) => setEditForm({ ...editForm, agent_name: e.target.value })} /></td>
                    <td className="px-4 py-2"><input className="border rounded px-2 py-0.5 text-sm w-full" value={editForm.contact_phone ?? ''} onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })} /></td>
                    <td className="px-4 py-2"><input className="border rounded px-2 py-0.5 text-sm w-full" value={editForm.contact_email ?? ''} onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })} /></td>
                    <td className="px-4 py-2 text-center"><input type="checkbox" checked={editForm.is_active ?? true} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })} /></td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <button onClick={() => updateA.mutate()} className="text-green-600"><Save className="w-3.5 h-3.5 inline" /></button>
                      <button onClick={() => setEditId(null)} className="text-gray-400"><X className="w-3.5 h-3.5 inline" /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2 font-medium">{a.agent_name}</td>
                    <td className="px-4 py-2 text-gray-500">{a.contact_phone ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-500">{a.contact_email ?? '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {a.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => { setEditId(a.agent_id); setEditForm({ ...a }); }} className="text-gray-400 hover:text-blue-600"><Edit2 className="w-3.5 h-3.5 inline" /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
