import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Sale, SaleItem, Customer } from '../../types';
import { generateInvoiceHTML, printInvoice } from '../../lib/invoices';
import GlassCard from '../ui/GlassCard';
import StatusBadge from '../ui/StatusBadge';
import Modal from '../ui/Modal';
import { Search, FileText, Download, Printer, Eye, Plus, Trash2 } from 'lucide-react';

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
  const [manualInvoices, setManualInvoices] = useState<ManualInvoice[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => { loadSales(); }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(manualInvoices));
  }, [manualInvoices]);

  function openCreate() {
    setForm({
      customer_name: '', date: new Date().toISOString().slice(0, 10),
      product_name: '', quantity: '1', tax: '0', discount: '0', price: '', payment: 'cash',
    });
    setCreateOpen(true);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_name || !form.product_name || !form.price) return;
    const seq = manualInvoices.length + 1;
    const invoice: ManualInvoice = {
      id: `${Date.now()}`,
      invoice_number: `MAN-${String(seq).padStart(4, '0')}`,
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
    setCreateOpen(false);
  }

  function removeManual(id: string) {
    setManualInvoices(manualInvoices.filter(m => m.id !== id));
  }

  // Total for a manual invoice: (price x qty) + tax - discount.
  const manualTotal = (m: ManualInvoice) => m.price * m.quantity + m.tax - m.discount;

  // Adapt a manual invoice to the Sale/SaleItem shape so it can reuse the
  // existing invoice generator for view / download / print.
  function buildManualSale(m: ManualInvoice): { sale: Sale; items: SaleItem[] } {
    const subtotal = m.price * m.quantity;
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
      unit_price: m.price,
      vat_rate: 0,
      discount: m.discount,
      line_total: subtotal,
      created_at: '',
    }] as SaleItem[];
    return { sale, items };
  }

  function viewManual(m: ManualInvoice) {
    const { sale, items } = buildManualSale(m);
    setSelectedSale(sale);
    setInvoiceItems(items);
  }

  function printManual(m: ManualInvoice) {
    const { sale, items } = buildManualSale(m);
    printInvoice(sale, items);
  }

  function downloadManual(m: ManualInvoice) {
    const { sale, items } = buildManualSale(m);
    downloadHtml(sale, items);
  }

  async function loadSales() {
    setLoading(true);
    const { data } = await supabase.from('sales').select('*, customer:customers(*)').order('created_at', { ascending: false });
    setSales(data || []);
    setLoading(false);
  }

  async function loadSaleItems(sale: Sale) {
    const { data } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id);
    return data || [];
  }

  async function viewInvoice(sale: Sale) {
    const items = await loadSaleItems(sale);
    setSelectedSale(sale);
    setInvoiceItems(items);
  }

  async function handlePrint(sale: Sale) {
    setActionLoading(sale.id);
    const items = await loadSaleItems(sale);
    setActionLoading(null);
    printInvoice(sale, items);
  }

  function downloadHtml(sale: Sale, items: SaleItem[]) {
    const html = generateInvoiceHTML(sale, items);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sale.invoice_number}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownload(sale: Sale) {
    setActionLoading(sale.id);
    const items = await loadSaleItems(sale);
    setActionLoading(null);
    downloadHtml(sale, items);
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
          <h1 className="text-2xl font-bold text-white">Invoices</h1>
          <p className="text-navy-400 text-sm mt-1">Generate, print, and download professional invoices</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold rounded-xl transition text-sm">
          <Plus className="w-4 h-4" /> Create Invoice
        </button>
      </div>

      <GlassCard padding="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
          <input type="text" placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white placeholder-navy-400 text-sm focus:outline-none focus:border-gold-500/50 transition" />
        </div>
      </GlassCard>

      <GlassCard padding="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
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
                        <span className="text-white font-medium font-mono">{m.invoice_number}</span>
                        <p className="text-navy-400 text-xs">{m.product_name} &times; {m.quantity}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-navy-300">{m.customer_name}</td>
                  <td className="py-3 px-4 text-white font-semibold text-right">{fmt(manualTotal(m))}</td>
                  <td className="py-3 px-4 text-navy-300">{(m.payment || 'cash').toUpperCase()}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status="completed" variant="success" />
                  </td>
                  <td className="py-3 px-4 text-navy-300">{m.date ? new Date(m.date).toLocaleDateString('en-ZA') : '—'}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => viewManual(m)} className="p-1.5 text-navy-400 hover:text-gold-400 hover:bg-gold-500/10 rounded-lg transition" title="View">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => downloadManual(m)} className="p-1.5 text-navy-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition" title="Download HTML">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => printManual(m)} className="p-1.5 text-navy-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition" title="Print">
                        <Printer className="w-4 h-4" />
                      </button>
                      <button onClick={() => removeManual(m.id)} className="p-1.5 text-navy-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition" title="Delete">
                        <Trash2 className="w-4 h-4" />
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
                      <span className="text-white font-medium font-mono">{sale.invoice_number}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-navy-300">{sale.customer?.name || 'Walk-in'}</td>
                  <td className="py-3 px-4 text-white font-semibold text-right">{fmt(Number(sale.total))}</td>
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
                          <button onClick={() => viewInvoice(sale)} className="p-1.5 text-navy-400 hover:text-gold-400 hover:bg-gold-500/10 rounded-lg transition" title="View">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDownload(sale)} className="p-1.5 text-navy-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition" title="Download HTML">
                            <Download className="w-4 h-4" />
                          </button>
                          <button onClick={() => handlePrint(sale)} className="p-1.5 text-navy-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition" title="Print">
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

      {/* Invoice Preview Modal */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSale(null)} />
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 bg-navy-800 text-white">
              <h2 className="text-lg font-semibold">Invoice {selectedSale.invoice_number}</h2>
              <div className="flex gap-2">
                <button onClick={() => downloadHtml(selectedSale, invoiceItems)} className="flex items-center gap-2 px-3 py-1.5 bg-gold-500 hover:bg-gold-600 text-navy-900 rounded-lg text-sm font-medium transition">
                  <Download className="w-4 h-4" /> Download
                </button>
                <button onClick={() => printInvoice(selectedSale, invoiceItems)} className="flex items-center gap-2 px-3 py-1.5 bg-navy-600 hover:bg-navy-500 rounded-lg text-sm font-medium transition">
                  <Printer className="w-4 h-4" /> Print
                </button>
                <button onClick={() => setSelectedSale(null)} className="p-1.5 hover:bg-navy-600 rounded-lg transition">X</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <iframe
                srcDoc={generateInvoiceHTML(selectedSale, invoiceItems)}
                className="w-full h-full min-h-[600px]"
                title="Invoice Preview"
              />
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create Invoice" size="lg">
        <form onSubmit={handleCreate}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-navy-300 text-sm mb-1">Customer Name *</label>
              <input type="text" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" autoFocus required />
            </div>
            <div>
              <label className="block text-navy-300 text-sm mb-1">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-navy-300 text-sm mb-1">Product Name *</label>
              <input type="text" value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" required />
            </div>
            <div>
              <label className="block text-navy-300 text-sm mb-1">Quantity</label>
              <input type="number" min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
            </div>
            <div>
              <label className="block text-navy-300 text-sm mb-1">Price (ZAR) *</label>
              <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" required />
            </div>
            <div>
              <label className="block text-navy-300 text-sm mb-1">Tax (ZAR)</label>
              <input type="number" step="0.01" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
            </div>
            <div>
              <label className="block text-navy-300 text-sm mb-1">Discount (ZAR)</label>
              <input type="number" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50" />
            </div>
            <div>
              <label className="block text-navy-300 text-sm mb-1">Payment Method</label>
              <select value={form.payment} onChange={(e) => setForm({ ...form, payment: e.target.value })} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-white text-sm focus:outline-none focus:border-gold-500/50">
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="eft">EFT</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-navy-700/50">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-navy-300 hover:text-white transition text-sm">Cancel</button>
            <button type="submit" disabled={!form.customer_name || !form.product_name || !form.price} className="px-6 py-2 bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold rounded-xl text-sm transition disabled:opacity-50">
              Create Invoice
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
