import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStates, fetchFinancialYears, setCurrentFY, createFY, fetchPackagingTypes, createPackagingType, updatePackagingType, deletePackagingType, fetchAgents, createAgent, updateAgent, uploadSignature } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Edit2, Trash2, Plus, Save, X, Upload } from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL ?? '';
function authHeader(): Record<string, string> { const t = localStorage.getItem('token'); return t ? { Authorization: `Bearer ${t}` } : {}; }

type Tab = 'profile' | 'users' | 'permissions' | 'states' | 'financial-years' | 'packaging' | 'agents';

const TAB_LABELS: Record<Tab, string> = {
  profile: 'Profile',
  users: 'Users',
  permissions: 'Permissions',
  states: 'States',
  'financial-years': 'Financial Years',
  packaging: 'Packaging Types',
  agents: 'Agents',
};

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');

  const visibleTabs: Tab[] = [
    'profile',
    ...(user?.role === 'admin' ? (['users', 'permissions'] as Tab[]) : []),
    'states',
    'financial-years',
    'packaging',
    'agents',
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <div className="flex border-b border-gray-200 flex-wrap">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfileTab />}
      {tab === 'users' && user?.role === 'admin' && <UsersTab />}
      {tab === 'permissions' && user?.role === 'admin' && <PermissionsTab />}
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

function PermissionsTab() {
  const ROLES = ['admin', 'manager', 'salesperson', 'factory'] as const;
  const TABS  = ['sales', 'purchase', 'management'] as const;

  type PermMap = Record<string, Record<string, boolean>>;

  const { data: perms, refetch, isLoading } = useQuery<PermMap>({
    queryKey: ['tab-permissions'],
    queryFn: () =>
      fetch(`${BASE}/api/auth/tab-permissions`, { headers: authHeader() }).then(r => r.json()),
  });

  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError]   = useState('');

  const toggle = async (role: string, tab: string, allowed: boolean) => {
    setSaving(`${role}:${tab}`);
    setError('');
    const res = await fetch(`${BASE}/api/auth/tab-permissions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ role, tab, allowed }),
    });
    if (!res.ok) {
      const e = await res.json();
      setError(e.error ?? 'Failed to update');
    }
    await refetch();
    setSaving(null);
  };

  if (isLoading) return <div className="text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Configure which tabs each role can access. Each role must retain at least one tab.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden max-w-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th className="px-4 py-2 text-left">Role</th>
              {TABS.map(t => (
                <th key={t} className="px-4 py-2 text-center capitalize">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {ROLES.map(role => (
              <tr key={role}>
                <td className="px-4 py-2 font-medium capitalize">{role}</td>
                {TABS.map(tab => {
                  const checked = perms?.[role]?.[tab] ?? false;
                  const key = `${role}:${tab}`;
                  return (
                    <td key={tab} className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={saving === key}
                        onChange={e => toggle(role, tab, e.target.checked)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer disabled:opacity-50"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { user, refreshUser } = useAuth();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleSignatureUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      await uploadSignature(user.user_id, file);
      await refreshUser();
    } finally { setUploading(false); }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(''); setPwSuccess(false);
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match'); return; }
    const res = await fetch(`${BASE}/api/auth/password`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
    });
    if (res.ok) { setPwSuccess(true); setPwForm({ current: '', next: '', confirm: '' }); }
    else { const e = await res.json(); setPwError(e.error ?? 'Failed'); }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-800 mb-4">My Profile</h2>
        <div className="space-y-2 text-sm">
          <div className="flex gap-2"><span className="text-gray-400 w-24">Name:</span><span>{user?.name}</span></div>
          <div className="flex gap-2"><span className="text-gray-400 w-24">Email:</span><span>{user?.email}</span></div>
          <div className="flex gap-2"><span className="text-gray-400 w-24">Role:</span><span className="capitalize">{user?.role}</span></div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Signature</h2>
        {user?.signature_url && (
          <div className="mb-3 p-3 border border-gray-100 rounded bg-gray-50 inline-block">
            <img src={user.signature_url} alt="Your signature" className="max-h-16 max-w-xs object-contain" />
          </div>
        )}
        <label className={`flex items-center gap-2 cursor-pointer px-4 py-2 border border-gray-300 rounded text-sm w-fit hover:bg-gray-50 ${uploading ? 'opacity-50' : ''}`}>
          <Upload className="w-4 h-4" />
          {user?.signature_url ? 'Replace Signature' : 'Upload Signature'}
          <input type="file" className="hidden" accept=".png,.jpg,.jpeg"
            onChange={(e) => e.target.files?.[0] && handleSignatureUpload(e.target.files[0])} />
        </label>
        <p className="text-xs text-gray-400 mt-1">PNG with transparent background recommended.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          {['current', 'next', 'confirm'].map((f) => (
            <div key={f}>
              <label className="block text-xs text-gray-500 mb-1">
                {f === 'current' ? 'Current Password' : f === 'next' ? 'New Password' : 'Confirm New Password'}
              </label>
              <input type="password" className="input w-full" value={(pwForm as any)[f]}
                onChange={(e) => setPwForm(p => ({ ...p, [f]: e.target.value }))} required />
            </div>
          ))}
          {pwError && <p className="text-xs text-red-600">{pwError}</p>}
          {pwSuccess && <p className="text-xs text-green-600">Password changed successfully.</p>}
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Update Password</button>
        </form>
      </div>
    </div>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', role: 'salesperson', password: '' });
  const [error, setError] = useState('');
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPw, setNewPw] = useState('');
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => fetch(`${BASE}/api/auth/users`, { headers: authHeader() }).then(r => r.json()),
  });

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(form),
    });
    if (res.ok) { setForm({ name: '', email: '', role: 'salesperson', password: '' }); qc.invalidateQueries({ queryKey: ['admin-users'] }); }
    else { const e = await res.json(); setError(e.error ?? 'Failed'); }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Delete this user?')) return;
    await fetch(`${BASE}/api/auth/users/${id}`, { method: 'DELETE', headers: authHeader() });
    qc.invalidateQueries({ queryKey: ['admin-users'] });
  };

  const changeRole = async (id: string, role: string) => {
    setSavingRoleId(id);
    await fetch(`${BASE}/api/auth/users/${id}/role`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ role }),
    });
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    setSavingRoleId(null);
  };

  const resetPassword = async (id: string) => {
    if (!newPw || newPw.length < 6) return;
    await fetch(`${BASE}/api/auth/users/${id}/reset-password`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ new_password: newPw }),
    });
    setResetId(null); setNewPw('');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 font-semibold text-sm text-gray-700">Users</div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-xs text-gray-400 uppercase">
            <th className="px-4 py-2 text-left">Name</th>
            <th className="px-4 py-2 text-left">Email</th>
            <th className="px-4 py-2 text-left">Role</th>
            <th className="px-4 py-2 text-left">Created</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y">
            {(users as any[]).map((u: any) => (
              <tr key={u.user_id}>
                <td className="px-4 py-2 font-medium">{u.name}</td>
                <td className="px-4 py-2 text-gray-500">{u.email}</td>
                <td className="px-4 py-2">
                  <select
                    className="border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white disabled:opacity-50"
                    value={u.role}
                    disabled={savingRoleId === u.user_id}
                    onChange={(e) => changeRole(u.user_id, e.target.value)}
                  >
                    <option value="salesperson">Salesperson</option>
                    <option value="manager">Manager</option>
                    <option value="factory">Factory</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-2 text-gray-400">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex gap-2 justify-end">
                    {resetId === u.user_id ? (
                      <>
                        <input type="password" placeholder="New password" className="border border-gray-300 rounded px-2 py-1 text-xs w-28"
                          value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                        <button onClick={() => resetPassword(u.user_id)} className="text-xs text-blue-600 hover:underline">Save</button>
                        <button onClick={() => setResetId(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setResetId(u.user_id); setNewPw(''); }} className="text-xs text-gray-400 hover:text-blue-600">Reset PW</button>
                        <button onClick={() => deleteUser(u.user_id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 max-w-md">
        <h2 className="font-semibold text-gray-800 mb-4 text-sm">Add User</h2>
        <form onSubmit={createUser} className="space-y-3">
          {[['name', 'Full Name', 'text'], ['email', 'Email', 'email'], ['password', 'Temporary Password', 'password']].map(([f, label, type]) => (
            <div key={f}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <input type={type} className="input w-full" value={(form as any)[f]}
                onChange={(e) => setForm(p => ({ ...p, [f]: e.target.value }))} required />
            </div>
          ))}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Role</label>
            <select className="input w-full" value={form.role} onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))}>
              <option value="salesperson">Salesperson</option>
              <option value="manager">Manager</option>
              <option value="factory">Factory</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Add User
          </button>
        </form>
      </div>
    </div>
  );
}
