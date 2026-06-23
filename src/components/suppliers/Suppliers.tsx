import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Supplier } from '../../types';
import GlassCard from '../ui/GlassCard';
import Modal from '../ui/Modal';
import { Plus, Search, Edit2, Trash2, Truck, Phone, Mail, MapPin, AlertTriangle } from 'lucide-react';

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<Supplier | null>(null);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', contact_person: '', email: '', phone: '', address: '',
    city: '', province: '', postal_code: '', vat_number: '', notes: '', is_active: true,
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*').eq('is_active', true).order('name');
    setSuppliers(data || []);
    setLoading(false);
  }

  function openCreate() {
    setEditSupplier(null);
    setForm({ name: '', contact_person: '', email: '', phone: '', address: '', city: '', province: '', postal_code: '', vat_number: '', notes: '', is_active: true });
    setModalOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditSupplier(s);
    setForm({
      name: s.name, contact_person: s.contact_person || '', email: s.email || '',
      phone: s.phone || '', address: s.address || '', city: s.city || '',
      province: s.province || '', postal_code: s.postal_code || '',
      vat_number: s.vat_number || '', notes: s.notes || '', is_active: s.is_active,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const data = {
        name: form.name,
        contact_person: form.contact_person || null,
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
      if (editSupplier) {
        await supabase.from('suppliers').update(data).eq('id', editSupplier.id);
      } else {
        await supabase.from('suppliers').insert(data);
      }
      setModalOpen(false);
      loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(s: Supplier) {
    await supabase.from('suppliers').update({ is_active: false }).eq('id', s.id);
    setDeleteModal(null);
    loadData();
  }

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.contact_person || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const provinces = ['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Suppliers</h1>
          <p className="text-navy-400 text-sm mt-1">{suppliers.length} active suppliers</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold rounded-xl transition text-sm">
          <Plus className="w-4 h-4" /> Add Supplier
        </button>
      </div>

      {/* Search */}
      <GlassCard padding="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
          <input type="text" placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white placeholder-navy-400 text-sm focus:outline-none focus:border-gold-500/50 transition" />
        </div>
      </GlassCard>

      {/* Supplier Cards */}
      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.length === 0 && <p className="text-navy-400 text-sm col-span-full text-center py-12">No suppliers found</p>}
          {filtered.map(s => (
            <GlassCard key={s.id} className="hover:border-navy-600/50 transition">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gold-500/10 border border-gold-500/20 rounded-xl flex items-center justify-center">
                    <Truck className="w-5 h-5 text-gold-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">{s.name}</h3>
                    <p className="text-navy-400 text-xs">{s.contact_person || 'No contact'}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} className="p-1.5 text-navy-400 hover:text-gold-400 hover:bg-gold-500/10 rounded-lg transition"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => setDeleteModal(s)} className="p-1.5 text-navy-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {s.email && <div className="flex items-center gap-2 text-navy-300"><Mail className="w-4 h-4 text-navy-500" />{s.email}</div>}
                {s.phone && <div className="flex items-center gap-2 text-navy-300"><Phone className="w-4 h-4 text-navy-500" />{s.phone}</div>}
                {(s.city || s.province) && <div className="flex items-center gap-2 text-navy-300"><MapPin className="w-4 h-4 text-navy-500" />{[s.city, s.province].filter(Boolean).join(', ')}</div>}
                {s.vat_number && <div className="text-navy-400 text-xs">VAT: {s.vat_number}</div>}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editSupplier ? 'Edit Supplier' : 'Add Supplier'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-navy-300 text-sm mb-1">Company Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" required />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Contact Person</label>
            <input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">VAT Number</label>
            <input value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-navy-300 text-sm mb-1">Address</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">City</label>
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Province</label>
            <select value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50">
              <option value="">Select Province</option>
              {provinces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Postal Code</label>
            <input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-navy-300 text-sm mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-navy-700/50">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-navy-300 hover:text-white transition text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name} className="px-6 py-2 bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold rounded-xl text-sm transition disabled:opacity-50">
            {saving ? 'Saving...' : editSupplier ? 'Update Supplier' : 'Add Supplier'}
          </button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete Supplier" size="sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="text-white">Are you sure you want to delete <strong>{deleteModal?.name}</strong>?</p>
            <p className="text-navy-400 text-sm mt-1">The supplier will be deactivated.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-navy-700/50">
          <button onClick={() => setDeleteModal(null)} className="px-4 py-2 text-navy-300 hover:text-white transition text-sm">Cancel</button>
          <button onClick={() => deleteModal && handleDelete(deleteModal)} className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl text-sm transition">Delete</button>
        </div>
      </Modal>
    </div>
  );
}
