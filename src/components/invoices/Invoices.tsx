import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchAllRows } from '../../lib/fetchAll';
import { reportError } from '../../lib/errors';
import { usePersistentState } from '../../hooks/usePersistentState';
import { Sale, SaleItem, Customer } from '../../types';
import GlassCard from '../ui/GlassCard';
import StatusBadge from '../ui/StatusBadge';
import Modal from '../ui/Modal';
import { useToast } from '../ui/Toast';
import InvoicePreviewModal from './InvoicePreviewModal';
import { Search, FileText, Printer, Plus } from 'lucide-react';

interface ManualInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  date: string;
  product_name: string;
  quantity: number;
  tax: number;
  discount: number;
  price: number;
  payment: 'cash' | 'card' | 'eft' | 'credit';
}

const STORAGE_KEY = 'manual_invoices';

export default function Invoices() {
  const toast = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<SaleItem[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    customer_name: '', date: '', product_name: '',
    quantity: '1', tax: '0', discount: '0', price: '', payment: 'cash',
  });
  // Via usePersistentState rather than a hand-rolled read + write-on-change
  // pair. That pair wrote back on the very first render, so a read that threw
  // (corrupt JSON, private-mode storage) fell back to [] and then immediately
  // persisted that [] — destroying every manual invoice on the machine. The
  // hook skips the first write for exactly this reason, and its write is
  // wrapped against quota/availability errors.
  const [manualInvoices, setManualInvoices] = usePersistentState<ManualInvoice[]>(STORAGE_KEY, []);

  useEffect(() => { loadSales(); }, []);

  function openCreate() {
    setForm({
      customer_name: '', date: new Date().toISOString().slice(0, 10),
      product_name: '', quantity: '1', tax: '0', discount: '0', price: '', payment: 'cash',
    });
    setCreateOpen(true);
  }

  // Next MAN- sequence = one past the highest ever issued, read back off the
  // existing numbers. Counting the list (length + 1) reused a number as soon as
  // one was deleted, so two different invoices could go out identically
  // numbered — the one thing an invoice number may never do.
  function nextManualNumber(): string {
    const highest = manualInvoices.reduce((max, m) => {
      const seq = parseInt(String(m.invoice_number).replace(/^MAN-/, ''), 10);
      return Number.isNaN(seq) ? max : Math.max(max, seq);
    }, 0);
    return `MAN-${String(highest + 1).padStart(4, '0')}`;
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_name || !form.product_name || !form.price) return;

    // A discount larger than the line itself would produce a negative invoice.
    const gross = Number(form.price) * Number(form.quantity);
    if (Number(form.discount) > gross) {
      toast.error('Discount is too large', `It cannot be more than the ${fmt(gross)} line total.`);
      return;
    }

    const invoice: ManualInvoice = {
      id: `${Date.now()}`,
      invoice_number: nextManualNumber(),
      customer_name: form.customer_name,
      date: form.date,
      product_name: form.product_name,
      quantity: Number(form.quantity),
      tax: Number(form.tax),
      discount: Number(form.discount),
      price: Number(form.price),
      payment: form.payment as ManualInvoice['payment'],
    };
    setManualInvoices([invoice, ...manualInvoices]);
    toast.success('Invoice created', `${invoice.invoice_number} — ${invoice.customer_name}`);
    setCreateOpen(false);
  }


  // Total for a manual invoice: (price x qty) + tax - discount.
  const manualTotal = (m: ManualInvoice) => m.price * m.quantity + m.tax - m.discount;

  // Adapt a manual invoice to the Sale/SaleItem shape so it can reuse the
  // existing invoice generator for view / download / print.
  //
  // The adaptation has to match the POS's convention, because both feed the same
  // receipt template: there, a discount is given by editing the unit price down,
  // so `subtotal` is already net of it and `discount_total` is a record of how
  // much was given, not a term still to be subtracted. A manual invoice captures
  // price and discount separately, so fold the discount into the unit price the
  // same way. Without this the one template printed two different arithmetics.
  function buildManualSale(m: ManualInvoice): { sale: Sale; items: SaleItem[] } {
    const subtotal = m.price * m.quantity - m.discount;
    const effectiveUnitPrice = m.quantity > 0 ? subtotal / m.quantity : subtotal;
    const sale = {
      id: m.id,
      invoice_number: m.invoice_number,
      subtotal,
      vat_total: m.tax,
      discount_total: m.discount,
      total: manualTotal(m),
      payment_method: m.payment || 'cash',
      status: 'completed',
      created_at: m.date ? new Date(m.date).toISOString() : new Date().toISOString(),
      updated_at: '',
      customer: { name: m.customer_name } as Customer,
    } as Sale;
    const items = [{
      id: m.id,
      sale_id: m.id,
      product_id: '',
      product_name: m.product_name,
      quantity: m.quantity,
      unit_price: effectiveUnitPrice,
      vat_rate: 0,
      discount: m.discount,
      line_total: subtotal,
      created_at: '',
    }] as SaleItem[];
    return { sale, items };
  }

  function openManual(m: ManualInvoice) {
    const { sale, items } = buildManualSale(m);
    setSelectedSale(sale);
    setInvoiceItems(items);
  }

  async function loadSales() {
    setLoading(true);
    try {
      // Paged. This list is the only way to find an old invoice — the search box
      // filters it client-side — and an unpaged query stops at Supabase's 1000
      // row cap without saying so, which would quietly make every invoice past
      // the thousandth unfindable.
      const rows = await fetchAllRows<Sale>((from, to) =>
        supabase
          .from('sales')
          .select('*, customer:customers(*)')
          .order('created_at', { ascending: false })
          .range(from, to)
      );
      setSales(rows);
    } catch (err) {
      reportError('Invoices could not be loaded', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadSaleItems(sale: Sale) {
    const { data } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id);
    return data || [];
  }

  /**
   * Open the invoice in the preview modal - the only row action there is.
   * Printing and downloading are both confirmed from the preview, so a slip
   * can never reach the printer without someone having seen it first.
   */
  async function openInvoice(sale: Sale) {
    setActionLoading(sale.id);
    const items = await loadSaleItems(sale);
    setActionLoading(null);
    setSelectedSale(sale);
    setInvoiceItems(items);
  }

  const filtered = sales.filter(s =>
    s.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    (s.customer?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredManual = manualInvoices.filter(m =>
    m.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    m.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    m.product_name.toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (v: number) => `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black">Invoices</h1>
          <p className="text-navy-400 text-sm mt-1">Generate, print, and download professional invoices</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-black font-semibold rounded-xl transition text-sm">
          <Plus className="w-4 h-4" /> Create Invoice
        </button>
      </div>

      <GlassCard padding="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
          <input type="text" placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black placeholder-navy-400 text-sm focus:outline-none focus:border-gold-500/50 transition" />
        </div>
      </GlassCard>

      <GlassCard padding="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-navy-700/50">
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Invoice #</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Customer</th>
                <th className="text-right py-3 px-4 text-navy-400 font-medium">Amount</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Payment</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Status</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Date</th>
                <th className="text-right py-3 px-4 text-navy-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="text-center py-12 text-navy-400"><div className="animate-spin w-6 h-6 border-2 border-gold-500 border-t-transparent rounded-full mx-auto" /></td></tr>}
              {!loading && filtered.length === 0 && filteredManual.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-navy-400">No invoices found</td></tr>}
              {filteredManual.map(m => (
                <tr key={m.id} className="border-b border-navy-700/30 hover:bg-navy-700/20 transition">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gold-400" />
                      <div>
                        <span className="text-black font-medium font-mono">{m.invoice_number}</span>
                        <p className="text-navy-400 text-xs">{m.product_name} &times; {m.quantity}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-navy-300">{m.customer_name}</td>
                  <td className="py-3 px-4 text-black font-semibold text-right">{fmt(manualTotal(m))}</td>
                  <td className="py-3 px-4 text-navy-300">{(m.payment || 'cash').toUpperCase()}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status="completed" variant="success" />
                  </td>
                  <td className="py-3 px-4 text-navy-300">{m.date ? new Date(m.date).toLocaleDateString('en-ZA') : '—'}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openManual(m)} className="p-1.5 text-navy-400 hover:text-blue-600 hover:bg-blue-500/10 rounded-lg transition" title="Preview & print">
                        <Printer className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.map(sale => (
                <tr key={sale.id} className="border-b border-navy-700/30 hover:bg-navy-700/20 transition">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gold-400" />
                      <span className="text-black font-medium font-mono">{sale.invoice_number}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-navy-300">{sale.customer?.name || 'Walk-in'}</td>
                  <td className="py-3 px-4 text-black font-semibold text-right">{fmt(Number(sale.total))}</td>
                  <td className="py-3 px-4 text-navy-300">{sale.payment_method.toUpperCase()}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={sale.status} variant={sale.status === 'completed' ? 'success' : sale.status === 'cancelled' ? 'danger' : 'neutral'} />
                  </td>
                  <td className="py-3 px-4 text-navy-300">{new Date(sale.created_at).toLocaleDateString('en-ZA')}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      {actionLoading === sale.id ? (
                        <div className="animate-spin w-4 h-4 border-2 border-gold-500 border-t-transparent rounded-full" />
                      ) : (
                        <>
                          <button onClick={() => openInvoice(sale)} className="p-1.5 text-navy-400 hover:text-blue-600 hover:bg-blue-500/10 rounded-lg transition" title="Preview & print">
                            <Printer className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {selectedSale && (
        <InvoicePreviewModal
          sale={selectedSale}
          items={invoiceItems}
          onClose={() => setSelectedSale(null)}
        />
      )}

      {/* Create Invoice Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create Invoice" size="lg">
        <form onSubmit={handleCreate}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-navy-300 text-sm mb-1">Customer Name *</label>
              <input type="text" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" autoFocus required />
            </div>
            <div>
              <label className="block text-navy-300 text-sm mb-1">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-navy-300 text-sm mb-1">Product Name *</label>
              <input type="text" value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" required />
            </div>
            <div>
              <label className="block text-navy-300 text-sm mb-1">Quantity</label>
              <input type="number" min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
            </div>
            <div>
              <label className="block text-navy-300 text-sm mb-1">Price (ZAR) *</label>
              <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" required />
            </div>
            <div>
              <label className="block text-navy-300 text-sm mb-1">Tax (ZAR)</label>
              <input type="number" step="0.01" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
            </div>
            <div>
              <label className="block text-navy-300 text-sm mb-1">Discount (ZAR)</label>
              <input type="number" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50" />
            </div>
            <div>
              <label className="block text-navy-300 text-sm mb-1">Payment Method</label>
              <select value={form.payment} onChange={(e) => setForm({ ...form, payment: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50">
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="eft">EFT</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-navy-700/50">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-navy-300 hover:text-black transition text-sm">Cancel</button>
            <button type="submit" disabled={!form.customer_name || !form.product_name || !form.price} className="px-6 py-2 bg-gold-500 hover:bg-gold-600 text-black font-semibold rounded-xl text-sm transition disabled:opacity-50">
              Create Invoice
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
