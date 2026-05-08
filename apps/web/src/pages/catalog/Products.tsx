import { useState } from 'react';
import { useProducts, useCreateProduct, useUpdateProduct, useCreateVariant, useUpdateVariant, useVariants, usePackagingTypes } from '@/hooks/useCatalog';
import { ChevronDown, ChevronRight, Plus, Edit2 } from 'lucide-react';

const ITEM_TYPES = ['finished_goods', 'raw_material', 'packing_material', 'store_spares', 'wip', 'other'];

export default function Products() {
  const [search, setSearch] = useState('');
  const { data: products = [], isLoading } = useProducts(search || undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddVariant, setShowAddVariant] = useState<string | null>(null);
  const [editProduct, setEditProduct] = useState<any | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Products & Catalog</h1>
        <button
          onClick={() => setShowAddProduct(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      <input
        type="text"
        placeholder="Search products…"
        className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {showAddProduct && (
        <AddProductModal
          onClose={() => setShowAddProduct(false)}
        />
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th className="px-4 py-2 text-left w-8"></th>
              <th className="px-4 py-2 text-left">Product Name</th>
              <th className="px-4 py-2 text-left">HS Code</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-center">Variants</th>
              <th className="px-4 py-2 text-center">Active</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse" /></td></tr>
              ))
            ) : (products as any[]).map((p: any) => (
              <>
                <tr
                  key={p.product_id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === p.product_id ? null : p.product_id)}
                >
                  <td className="px-4 py-2.5 text-gray-400">
                    {expandedId === p.product_id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{p.product_name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{p.hs_code ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {p.item_type?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-500">{p.variant_count}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowAddVariant(p.product_id); }}
                      className="text-xs text-blue-600 hover:underline mr-3"
                    >
                      + Variant
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditProduct(p); }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Edit
                    </button>
                  </td>
                </tr>

                {expandedId === p.product_id && (
                  <VariantRows key={`v-${p.product_id}`} productId={p.product_id} />
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {showAddVariant && (
        <AddVariantModal productId={showAddVariant} onClose={() => setShowAddVariant(null)} />
      )}
      {editProduct && (
        <EditProductModal product={editProduct} onClose={() => setEditProduct(null)} />
      )}
    </div>
  );
}

function VariantRows({ productId }: { productId: string }) {
  const { data: variants = [] } = useVariants(productId);
  return (
    <>
      {(variants as any[]).map((v: any) => (
        <tr key={v.variant_id} className="bg-blue-50/40 border-b">
          <td className="px-4 py-2"></td>
          <td className="px-4 py-2 pl-8 text-xs text-gray-600 col-span-1">
            ↳ {v.full_description}
          </td>
          <td className="px-4 py-2 text-xs text-gray-400">{v.grade ?? '—'}</td>
          <td className="px-4 py-2 text-xs text-gray-400">{v.pkg_name ?? '—'}</td>
          <td className="px-4 py-2 text-xs text-center text-gray-400">{v.qty_per_pkg ?? '—'} kg/pkg</td>
          <td className="px-4 py-2 text-center">
            <span className={`text-xs px-2 py-0.5 rounded-full ${v.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
              {v.is_active ? 'Active' : 'Inactive'}
            </span>
          </td>
          <td className="px-4 py-2"></td>
        </tr>
      ))}
    </>
  );
}

function AddProductModal({ onClose }: { onClose: () => void }) {
  const createProduct = useCreateProduct();
  const [form, setForm] = useState({ product_name: '', hs_code: '', item_type: 'finished_goods', description: '' });
  const submit = async () => {
    await createProduct.mutateAsync(form);
    onClose();
  };
  return (
    <Modal title="Add Product" onClose={onClose} onSubmit={submit} loading={createProduct.isPending}>
      <Field label="Product Name"><input className="input" value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} /></Field>
      <Field label="HS Code"><input className="input" value={form.hs_code} onChange={(e) => setForm({ ...form, hs_code: e.target.value })} /></Field>
      <Field label="Item Type">
        <select className="input" value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value })}>
          {ITEM_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
      </Field>
      <Field label="Description"><textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
    </Modal>
  );
}

function AddVariantModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const createVariant = useCreateVariant();
  const { data: pkgTypes = [] } = usePackagingTypes();
  const [form, setForm] = useState({ product_id: productId, grade: '', qty_per_pkg: '', pkg_id: '', full_description: '' });
  const submit = async () => {
    await createVariant.mutateAsync({ ...form, qty_per_pkg: form.qty_per_pkg ? parseInt(form.qty_per_pkg, 10) : null, pkg_id: form.pkg_id ? parseInt(form.pkg_id, 10) : null });
    onClose();
  };
  return (
    <Modal title="Add Variant" onClose={onClose} onSubmit={submit} loading={createVariant.isPending}>
      <Field label="Full Description"><input className="input" value={form.full_description} onChange={(e) => setForm({ ...form, full_description: e.target.value })} /></Field>
      <Field label="Grade"><input className="input" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></Field>
      <Field label="Qty per package (kg)"><input type="number" className="input" value={form.qty_per_pkg} onChange={(e) => setForm({ ...form, qty_per_pkg: e.target.value })} /></Field>
      <Field label="Packaging Type">
        <select className="input" value={form.pkg_id} onChange={(e) => setForm({ ...form, pkg_id: e.target.value })}>
          <option value="">None</option>
          {(pkgTypes as any[]).map((p: any) => <option key={p.pkg_id} value={p.pkg_id}>{p.pkg_name}</option>)}
        </select>
      </Field>
    </Modal>
  );
}

function EditProductModal({ product, onClose }: { product: any; onClose: () => void }) {
  const updateProduct = useUpdateProduct(product.product_id);
  const [form, setForm] = useState({ ...product });
  const submit = async () => {
    await updateProduct.mutateAsync(form);
    onClose();
  };
  return (
    <Modal title="Edit Product" onClose={onClose} onSubmit={submit} loading={updateProduct.isPending}>
      <Field label="Product Name"><input className="input" value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} /></Field>
      <Field label="HS Code"><input className="input" value={form.hs_code ?? ''} onChange={(e) => setForm({ ...form, hs_code: e.target.value })} /></Field>
      <Field label="Item Type">
        <select className="input" value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value })}>
          {ITEM_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
        Active
      </label>
    </Modal>
  );
}

function Modal({ title, children, onClose, onSubmit, loading }: { title: string; children: React.ReactNode; onClose: () => void; onSubmit: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 w-full max-w-md space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-gray-900">{title}</h2>
        <div className="space-y-3">{children}</div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-1.5 border border-gray-300 rounded text-sm">Cancel</button>
          <button onClick={onSubmit} disabled={loading} className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
