import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Customer } from '../../types';
import GlassCard from '../ui/GlassCard';
import Modal from '../ui/Modal';
import { Plus, Search, Edit2, Trash2, Users, Phone, Mail, MapPin, AlertTriangle } from 'lucide-react';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<Customer | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '', city: '', province: '',
    postal_code: '', vat_number: '', notes: '', is_active: true,
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from('customers').select('*').eq('is_active', true).order('name');
    setCustomers(data || []);
    setLoading(false);
  }

  function openCreate() {
    setEditCustomer(null);
    setForm({ name: '', email: '', phone: '', address: '', city: '', province: '', postal_code: '', vat_number: '', notes: '', is_active: true });
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditCustomer(c);
    setForm({
      name: c.name, email: c.email || '', phone: c.phone || '', address: c.address || '',
      city: c.city || '', province: c.province || '', postal_code: c.postal_code || '',
      vat_number: c.vat_number || '', notes: c.notes || '', is_active: c.is_active,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const data = {
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        city: form.city || null,
        province: form.province || null,
        postal_code: form.postal_code || null,
        vat_number: form.vat_number || null,
        notes: form.notes || null,
        is_active: form.is_active,
      };
      if (editCustomer) {
        await supabase.from('customers').update(data).eq('id', editCustomer.id);
      } else {
        await supabase.from('customers').insert(data);
      }
      setModalOpen(false);
      loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Customer) {
    await supabase.from('customers').update({ is_active: false }).eq('id', c.id);
    setDeleteModal(null);
    loadData();
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  );

  const provinces = ['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black">Customers</h1>
          <p className="text-navy-400 text-sm mt-1">{customers.length} active customers</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-black font-semibold rounded-xl transition text-sm">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      <GlassCard padding="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
          <input type="text" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black placeholder-navy-400 text-sm focus:outline-none focus:border-gold-500/50 transition" />
        </div>
      </GlassCard>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.length === 0 && <p className="text-navy-400 text-sm col-span-full text-center py-12">No customers found</p>}
          {filtered.map(c => (
            <GlassCard key={c.id} className="hover:border-navy-600/50 transition">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-black font-semibold">{c.name}</h3>
                    {c.vat_number && <p className="text-navy-400 text-xs">VAT: {c.vat_number}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(c)} className="p-1.5 text-navy-400 hover:text-gold-400 hover:bg-gold-500/10 rounded-lg transition"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => setDeleteModal(c)} className="p-1.5 text-navy-400 hover:text-red-600 hover:bg-red-500/10 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {c.email && <div className="flex items-center gap-2 text-navy-300"><Mail className="w-4 h-4 text-navy-500" />{c.email}</div>}
                {c.phone && <div className="flex items-center gap-2 text-navy-300"><Phone className="w-4 h-4 text-navy-500" />{c.phone}</div>}
                {(c.city || c.province) && <div className="flex items-center gap-2 text-navy-300"><MapPin className="w-4 h-4 text-navy-500" />{[c.city, c.province].filter(Boolean).join(', ')}</div>}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editCustomer ? 'Edit Customer' : 'Add Customer'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-navy-300 text-sm mb-1">Customer Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" required />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">VAT Number</label>
            <input value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-navy-300 text-sm mb-1">Address</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">City</label>
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Province</label>
            <select value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50">
              <option value="">Select Province</option>
              {provinces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Postal Code</label>
            <input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-navy-300 text-sm mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-navy-700/50">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-navy-300 hover:text-black transition text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name} className="px-6 py-2 bg-gold-500 hover:bg-gold-600 text-black font-semibold rounded-xl text-sm transition disabled:opacity-50">
            {saving ? 'Saving...' : editCustomer ? 'Update Customer' : 'Add Customer'}
          </button>
        </div>
      </Modal>

      <Modal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete Customer" size="sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
          <div>
            <p className="text-black">Are you sure you want to delete <strong>{deleteModal?.name}</strong>?</p>
            <p className="text-navy-400 text-sm mt-1">The customer will be deactivated.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-navy-700/50">
          <button onClick={() => setDeleteModal(null)} className="px-4 py-2 text-navy-300 hover:text-black transition text-sm">Cancel</button>
          <button onClick={() => deleteModal && handleDelete(deleteModal)} className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl text-sm transition">Delete</button>
        </div>
      </Modal>
    </div>
  );
}
