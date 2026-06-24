import { useState, useEffect } from 'react';
import GlassCard from '../ui/GlassCard';
import StatusBadge from '../ui/StatusBadge';
import Modal from '../ui/Modal';
import { CreditCard, Trash2, User, Plus } from 'lucide-react';

interface PaymentRecord {
  id: string;
  name: string;
  phone: string;
  status: 'Paid' | 'Unpaid';
  createdAt?: number;
}

const STORAGE_KEY = 'payment_records';

export default function Payment() {
  const [form, setForm] = useState({ name: '', phone: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [records, setRecords] = useState<PaymentRecord[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }, [records]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.phone) return;
    const now = Date.now();
    setRecords([
      { id: `${now}`, name: form.name, phone: form.phone, status: 'Unpaid', createdAt: now },
      ...records,
    ]);
    setForm({ name: '', phone: '' });
    setModalOpen(false);
  }

  function toggleStatus(id: string) {
    setRecords(records.map(r =>
      r.id === id ? { ...r, status: r.status === 'Paid' ? 'Unpaid' : 'Paid' } : r
    ));
  }

  function removeRecord(id: string) {
    setRecords(records.filter(r => r.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Payment</h1>
          <p className="text-navy-400 text-sm mt-1">Enter customer payment details</p>
        </div>
        <button
          onClick={() => { setForm({ name: '', phone: '' }); setModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold rounded-xl transition text-sm"
        >
          <Plus className="w-4 h-4" /> Add Payment
        </button>
      </div>

      {/* Customer Payment Details */}
      <GlassCard padding="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-700/50">
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Customer</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Phone</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Status</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Created</th>
                <th className="text-right py-3 px-4 text-navy-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12 text-navy-400">No payment records yet</td></tr>
              )}
              {records.map((record) => (
                <tr key={record.id} className="border-b border-navy-700/30 hover:bg-navy-700/20 transition">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-navy-600 rounded-lg flex items-center justify-center">
                        <User className="w-4 h-4 text-navy-300" />
                      </div>
                      <span className="text-white font-medium">{record.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-navy-300">{record.phone}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={record.status} variant={record.status === 'Paid' ? 'success' : 'danger'} />
                  </td>
                  <td className="py-3 px-4 text-navy-300 text-xs whitespace-nowrap">
                    {new Date(record.createdAt ?? Number(record.id)).toLocaleString('en-ZA', {
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleStatus(record.id)}
                        className="px-3 py-1.5 text-xs font-medium text-gold-400 hover:text-gold-300 hover:bg-gold-500/10 rounded-lg transition"
                      >
                        Mark as {record.status === 'Paid' ? 'Unpaid' : 'Paid'}
                      </button>
                      <button
                        onClick={() => removeRecord(record.id)}
                        className="p-1.5 text-navy-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                      >
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

      {/* Add Payment Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add Payment" size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-navy-300 text-sm mb-1">Customer Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-navy-300 text-sm mb-1">Phone Number *</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50"
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-navy-700/50">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-navy-300 hover:text-white transition text-sm">Cancel</button>
            <button
              type="submit"
              disabled={!form.name || !form.phone}
              className="flex items-center gap-2 px-6 py-2 bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold rounded-xl text-sm transition disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" /> Submit Payment
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
