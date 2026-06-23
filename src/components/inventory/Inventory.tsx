import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { StockMovement, Product } from '../../types';
import GlassCard from '../ui/GlassCard';
import Modal from '../ui/Modal';
import StatusBadge from '../ui/StatusBadge';
import { Plus, Search, ArrowDown, ArrowUp, RotateCcw, Sliders, Package } from 'lucide-react';

export default function Inventory() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    product_id: '', type: 'in' as 'in' | 'out' | 'adjustment' | 'return',
    quantity: '', reference: '', notes: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [movRes, prodRes] = await Promise.all([
      supabase.from('stock_movements').select('*, product:products(*)').order('created_at', { ascending: false }).limit(100),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
    ]);
    setMovements(movRes.data || []);
    setProducts(prodRes.data || []);
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      await supabase.from('stock_movements').insert({
        product_id: form.product_id,
        type: form.type,
        quantity: Number(form.quantity),
        reference: form.reference || null,
        notes: form.notes || null,
        created_by: user?.id,
      });
      setModalOpen(false);
      setForm({ product_id: '', type: 'in', quantity: '', reference: '', notes: '' });
      loadData();
    } finally {
      setSaving(false);
    }
  }

  const filtered = movements.filter(m => {
    const matchesSearch = (m.product?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (m.reference || '').toLowerCase().includes(search.toLowerCase());
    const matchesType = !typeFilter || m.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const typeIcons: Record<string, typeof ArrowDown> = { in: ArrowDown, out: ArrowUp, adjustment: Sliders, return: RotateCcw };
  const typeVariants: Record<string, 'success' | 'danger' | 'warning' | 'info'> = { in: 'success', out: 'danger', adjustment: 'warning', return: 'info' };


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-navy-400 text-sm mt-1">Track stock movements and adjustments</p>
        </div>
        <button onClick={() => { setForm({ product_id: '', type: 'in', quantity: '', reference: '', notes: '' }); setModalOpen(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold rounded-xl transition text-sm">
          <Plus className="w-4 h-4" /> New Movement
        </button>
      </div>

      {/* Stock Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
              <ArrowDown className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-navy-400 text-sm">Stock In</p>
              <p className="text-white font-semibold">{movements.filter(m => m.type === 'in').reduce((s, m) => s + m.quantity, 0)} units</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
              <ArrowUp className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-navy-400 text-sm">Stock Out</p>
              <p className="text-white font-semibold">{movements.filter(m => m.type === 'out').reduce((s, m) => s + m.quantity, 0)} units</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gold-500/10 rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-gold-400" />
            </div>
            <div>
              <p className="text-navy-400 text-sm">Total Products</p>
              <p className="text-white font-semibold">{products.length} items</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Filters */}
      <GlassCard padding="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
            <input type="text" placeholder="Search movements..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white placeholder-navy-400 text-sm focus:outline-none focus:border-gold-500/50 transition" />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2.5 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50">
            <option value="">All Types</option>
            <option value="in">Stock In</option>
            <option value="out">Stock Out</option>
            <option value="adjustment">Adjustment</option>
            <option value="return">Return</option>
          </select>
        </div>
      </GlassCard>

      {/* Movements Table */}
      <GlassCard padding="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-700/50">
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Product</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Type</th>
                <th className="text-right py-3 px-4 text-navy-400 font-medium">Quantity</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Reference</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Notes</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="text-center py-12 text-navy-400"><div className="animate-spin w-6 h-6 border-2 border-gold-500 border-t-transparent rounded-full mx-auto" /></td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-navy-400">No movements found</td></tr>}
              {filtered.map((m) => {
                const Icon = typeIcons[m.type] || ArrowDown;
                return (
                  <tr key={m.id} className="border-b border-navy-700/30 hover:bg-navy-700/20 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-navy-600 rounded-lg flex items-center justify-center">
                          <Icon className="w-4 h-4 text-navy-300" />
                        </div>
                        <div>
                          <p className="text-white font-medium">{m.product?.name || 'Unknown'}</p>
                          <p className="text-navy-400 text-xs">{m.product?.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4"><StatusBadge status={m.type.toUpperCase()} variant={typeVariants[m.type]} /></td>
                    <td className="py-3 px-4 text-right text-white font-medium">{m.type === 'adjustment' ? `→ ${m.quantity}` : m.type === 'in' ? `+${m.quantity}` : `-${m.quantity}`}</td>
                    <td className="py-3 px-4 text-navy-300">{m.reference || '-'}</td>
                    <td className="py-3 px-4 text-navy-300 max-w-xs truncate">{m.notes || '-'}</td>
                    <td className="py-3 px-4 text-navy-300">{new Date(m.created_at).toLocaleDateString('en-ZA')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* New Movement Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Stock Movement" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-navy-300 text-sm mb-1">Product *</label>
            <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50">
              <option value="">Select Product</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku}) - Stock: {p.current_stock}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-navy-300 text-sm mb-1">Type *</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50">
                <option value="in">Stock In</option>
                <option value="out">Stock Out</option>
                <option value="adjustment">Adjustment</option>
                <option value="return">Return</option>
              </select>
            </div>
            <div>
              <label className="block text-navy-300 text-sm mb-1">Quantity *</label>
              <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
            </div>
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Reference</label>
            <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="PO number, GRN, etc." className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-navy-700/50">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-navy-300 hover:text-white transition text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.product_id || !form.quantity} className="px-6 py-2 bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold rounded-xl text-sm transition disabled:opacity-50">
            {saving ? 'Saving...' : 'Record Movement'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
