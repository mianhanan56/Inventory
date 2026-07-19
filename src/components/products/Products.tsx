import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Product, Category, Supplier } from '../../types';
import GlassCard from '../ui/GlassCard';
import Modal from '../ui/Modal';
import StatusBadge from '../ui/StatusBadge';
import {
  Plus, Search, Edit2, Trash2, Package,
  Barcode, AlertTriangle, ShoppingCart,
} from 'lucide-react';

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<Product | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [saleProduct, setSaleProduct] = useState<Product | null>(null);
  const [saleQty, setSaleQty] = useState('');
  const [saleError, setSaleError] = useState('');
  const [selling, setSelling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', description: '', category_id: '',
    supplier_id: '', cost_price: '', selling_price: '', total_stock: '0',
    min_stock_level: '5', max_stock_level: '', unit: 'each', vat_rate: '15',
    is_active: true,
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [prodRes, catRes, supRes, moveRes] = await Promise.all([
      supabase.from('products').select('*, category:categories(*), supplier:suppliers(*)').eq('is_active', true).order('name'),
      supabase.from('categories').select('*').order('name'),
      supabase.from('suppliers').select('*').eq('is_active', true).order('name'),
      supabase.from('stock_movements').select('product_id, quantity').eq('type', 'out'),
    ]);

    // Derive each product's original Total Stock = remaining current_stock + everything sold.
    const soldByProduct = new Map<string, number>();
    (moveRes.data || []).forEach((m: { product_id: string; quantity: number }) => {
      soldByProduct.set(m.product_id, (soldByProduct.get(m.product_id) || 0) + m.quantity);
    });
    const products = (prodRes.data || []).map((p: Product) => ({
      ...p,
      total_stock: p.current_stock + (soldByProduct.get(p.id) || 0),
    }));

    setProducts(products);
    setCategories(catRes.data || []);
    setSuppliers(supRes.data || []);
    setLoading(false);
  }

  function openCreate() {
    setEditProduct(null);
    setForm({
      name: '', sku: '', barcode: '', description: '', category_id: '',
      supplier_id: '', cost_price: '', selling_price: '', total_stock: '0',
      min_stock_level: '5', max_stock_level: '', unit: 'each', vat_rate: '15',
      is_active: true,
    });
    setModalOpen(true);
  }

  function openEdit(product: Product) {
    setEditProduct(product);
    setForm({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || '',
      description: product.description || '',
      category_id: product.category_id || '',
      supplier_id: product.supplier_id || '',
      cost_price: String(product.cost_price),
      selling_price: String(product.selling_price),
      total_stock: String(product.total_stock ?? product.current_stock),
      min_stock_level: String(product.min_stock_level),
      max_stock_level: product.max_stock_level ? String(product.max_stock_level) : '',
      unit: product.unit,
      vat_rate: String(product.vat_rate),
      is_active: product.is_active,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const totalStock = Number(form.total_stock);
      const data = {
        name: form.name,
        sku: form.sku,
        barcode: form.barcode || null,
        description: form.description || null,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        cost_price: Number(form.cost_price),
        selling_price: Number(form.selling_price),
        min_stock_level: Number(form.min_stock_level),
        max_stock_level: form.max_stock_level ? Number(form.max_stock_level) : null,
        unit: form.unit,
        vat_rate: Number(form.vat_rate),
        is_active: form.is_active,
      };

      if (editProduct) {
        // Total Stock is derived (current + sold). Keep the already-sold quantity
        // intact: new current_stock = new total minus what was already sold.
        const sold = (editProduct.total_stock ?? editProduct.current_stock) - editProduct.current_stock;
        await supabase.from('products')
          .update({ ...data, current_stock: totalStock - sold })
          .eq('id', editProduct.id);
      } else {
        // New product: nothing sold yet, so current stock starts at the total.
        await supabase.from('products').insert({ ...data, current_stock: totalStock });
      }
      setModalOpen(false);
      loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(product: Product) {
    await supabase.from('products').update({ is_active: false }).eq('id', product.id);
    setDeleteModal(null);
    loadData();
  }

  function openSale(product: Product) {
    setSaleProduct(product);
    setSaleQty('');
    setSaleError('');
  }

  async function handleSale() {
    if (!saleProduct) return;
    const qty = Number(saleQty);
    if (!Number.isInteger(qty) || qty <= 0) {
      setSaleError('Enter a valid quantity greater than zero.');
      return;
    }
    if (qty > saleProduct.current_stock) {
      setSaleError(`Cannot sell ${qty} — only ${saleProduct.current_stock} ${saleProduct.unit} in stock.`);
      return;
    }
    setSelling(true);
    setSaleError('');
    try {
      const user = (await supabase.auth.getUser()).data.user;
      // Record an 'out' stock movement; a DB trigger deducts current_stock automatically.
      const { error } = await supabase.from('stock_movements').insert({
        product_id: saleProduct.id,
        type: 'out',
        quantity: qty,
        notes: 'Sale Stock',
        created_by: user?.id,
      });
      if (error) throw error;
      setSaleProduct(null);
      loadData();
    } catch (err) {
      console.error('Sale stock error:', err);
      setSaleError('Failed to record sale. Please try again.');
    } finally {
      setSelling(false);
    }
  }

  const filtered = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode && p.barcode.toLowerCase().includes(search.toLowerCase()));
    const matchesCat = !categoryFilter || p.category_id === categoryFilter;
    const matchesStock = !stockFilter ||
      (stockFilter === 'low' && p.current_stock <= p.min_stock_level) ||
      (stockFilter === 'ok' && p.current_stock > p.min_stock_level);
    return matchesSearch && matchesCat && matchesStock;
  });

  const fmt = (v: number) => `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black">Products</h1>
          <p className="text-navy-400 text-sm mt-1">{products.length} products in inventory</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-black font-semibold rounded-xl transition text-sm">
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {/* Filters */}
      <GlassCard padding="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
            <input
              type="text"
              placeholder="Search by name, SKU, or barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black placeholder-navy-400 text-sm focus:outline-none focus:border-gold-500/50 transition"
            />
          </div>
          <div className="flex gap-3">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2.5 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50"
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="px-3 py-2.5 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50"
            >
              <option value="">All Stock Levels</option>
              <option value="low">Low Stock</option>
              <option value="ok">In Stock</option>
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Products Table */}
      <GlassCard padding="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-navy-700/50">
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Product</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">SKU</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Category</th>
                <th className="text-right py-3 px-4 text-navy-400 font-medium">Cost</th>
                <th className="text-right py-3 px-4 text-navy-400 font-medium">Price</th>
                <th className="text-right py-3 px-4 text-navy-400 font-medium">Total Stock</th>
                <th className="text-right py-3 px-4 text-navy-400 font-medium">Current Stock</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Status</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Created</th>
                <th className="text-right py-3 px-4 text-navy-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} className="text-center py-12 text-navy-400"><div className="animate-spin w-6 h-6 border-2 border-gold-500 border-t-transparent rounded-full mx-auto" /></td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="text-center py-12 text-navy-400">No products found</td></tr>
              )}
              {filtered.map((product) => (
                <tr key={product.id} className="border-b border-navy-700/30 hover:bg-navy-700/20 transition">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-navy-600 rounded-lg flex items-center justify-center">
                        <Package className="w-4 h-4 text-navy-300" />
                      </div>
                      <div>
                        <p className="text-black font-medium">{product.name}</p>
                        {product.barcode && (
                          <p className="text-navy-400 text-xs flex items-center gap-1"><Barcode className="w-3 h-3" />{product.barcode}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-navy-300 font-mono text-xs">{product.sku}</td>
                  <td className="py-3 px-4 text-navy-300">{product.category?.name || '-'}</td>
                  <td className="py-3 px-4 text-navy-300 text-right">{fmt(product.cost_price)}</td>
                  <td className="py-3 px-4 text-black font-medium text-right">{fmt(product.selling_price)}</td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-navy-300">{product.total_stock ?? product.current_stock}</span>
                    <span className="text-navy-400 text-xs"> {product.unit}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={product.current_stock <= product.min_stock_level ? 'text-red-600 font-semibold' : 'text-black'}>
                      {product.current_stock}
                    </span>
                    <span className="text-navy-400 text-xs"> {product.unit}</span>
                  </td>
                  <td className="py-3 px-4">
                    {product.current_stock <= product.min_stock_level ? (
                      <StatusBadge status="Low Stock" variant="danger" />
                    ) : (
                      <StatusBadge status="In Stock" variant="success" />
                    )}
                  </td>
                  <td className="py-3 px-4 text-navy-300 text-xs whitespace-nowrap">
                    {new Date(product.created_at).toLocaleString('en-ZA', {
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openSale(product)}
                        disabled={product.current_stock <= 0}
                        title={product.current_stock <= 0 ? 'Out of stock' : 'Sale Stock'}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-emerald-600 hover:text-emerald-600 hover:bg-emerald-500/10 rounded-lg transition text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        <ShoppingCart className="w-4 h-4" /> Sale Stock
                      </button>
                      <button onClick={() => openEdit(product)} className="p-1.5 text-navy-400 hover:text-gold-400 hover:bg-gold-500/10 rounded-lg transition">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteModal(product)} className="p-1.5 text-navy-400 hover:text-red-600 hover:bg-red-500/10 rounded-lg transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Create/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editProduct ? 'Edit Product' : 'Add Product'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-navy-300 text-sm mb-1">Product Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" required />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">SKU *</label>
            <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" required />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Barcode</label>
            <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-navy-300 text-sm mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Category</label>
            <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50">
              <option value="">Select Category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Supplier</label>
            <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50">
              <option value="">Select Supplier</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Cost Price (ZAR) *</label>
            <input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" required />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Selling Price (ZAR) *</label>
            <input type="number" step="0.01" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" required />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Total Stock</label>
            <input type="number" value={form.total_stock} onChange={(e) => setForm({ ...form, total_stock: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Min Stock Level</label>
            <input type="number" value={form.min_stock_level} onChange={(e) => setForm({ ...form, min_stock_level: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Unit</label>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50">
              <option value="each">Each</option>
              <option value="kg">Kilogram</option>
              <option value="litre">Litre</option>
              <option value="pack">Pack</option>
              <option value="box">Box</option>
            </select>
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">VAT Rate (%)</label>
            <input type="number" step="0.01" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-navy-700/50">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-navy-300 hover:text-black transition text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name || !form.sku} className="px-6 py-2 bg-gold-500 hover:bg-gold-600 text-black font-semibold rounded-xl text-sm transition disabled:opacity-50">
            {saving ? 'Saving...' : editProduct ? 'Update Product' : 'Add Product'}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete Product" size="sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-black">Are you sure you want to delete <strong>{deleteModal?.name}</strong>?</p>
            <p className="text-navy-400 text-sm mt-1">This action will deactivate the product.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-navy-700/50">
          <button onClick={() => setDeleteModal(null)} className="px-4 py-2 text-navy-300 hover:text-black transition text-sm">Cancel</button>
          <button onClick={() => deleteModal && handleDelete(deleteModal)} className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl text-sm transition">
            Delete
          </button>
        </div>
      </Modal>

      {/* Sale Stock Modal */}
      <Modal isOpen={!!saleProduct} onClose={() => setSaleProduct(null)} title="Sale Stock" size="sm">
        {saleProduct && (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0">
                <ShoppingCart className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-black font-medium">{saleProduct.name}</p>
                <p className="text-navy-400 text-sm">
                  Available: <span className="text-black font-medium">{saleProduct.current_stock}</span> {saleProduct.unit}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-navy-300 text-sm mb-1">Quantity to Sell *</label>
              <input
                type="number"
                min="1"
                max={saleProduct.current_stock}
                step="1"
                value={saleQty}
                onChange={(e) => { setSaleQty(e.target.value); setSaleError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !selling) handleSale(); }}
                autoFocus
                className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50"
              />
              {saleError && <p className="text-red-600 text-sm mt-2">{saleError}</p>}
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-navy-700/50">
              <button onClick={() => setSaleProduct(null)} className="px-4 py-2 text-navy-300 hover:text-black transition text-sm">Cancel</button>
              <button onClick={handleSale} disabled={selling || !saleQty} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold rounded-xl text-sm transition disabled:opacity-50">
                {selling ? 'Processing...' : 'Confirm Sale'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
