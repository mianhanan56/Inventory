import { useState } from 'react';
import GlassCard from '../ui/GlassCard';
import { CreditCard } from 'lucide-react';

export default function Payment() {
  const [form, setForm] = useState({ name: '', phone: '' });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setForm({ name: '', phone: '' });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Payment</h1>
        <p className="text-navy-400 text-sm mt-1">Enter customer payment details</p>
      </div>

      <GlassCard padding="p-6" className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-navy-300 text-sm mb-1">Customer Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50"
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
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={!form.name || !form.phone}
              className="flex items-center gap-2 px-6 py-2 bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold rounded-xl text-sm transition disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" /> Submit Payment
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
