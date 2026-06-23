import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Sale, SaleItem } from '../../types';
import { generateInvoiceHTML, printInvoice } from '../../lib/invoices';
import GlassCard from '../ui/GlassCard';
import StatusBadge from '../ui/StatusBadge';
import { Search, FileText, Download, Printer, Eye } from 'lucide-react';

export default function Invoices() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<SaleItem[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => { loadSales(); }, []);

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

  async function handleDownload(sale: Sale) {
    setActionLoading(sale.id);
    const items = await loadSaleItems(sale);
    setActionLoading(null);
    const html = generateInvoiceHTML(sale, items);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sale.invoice_number}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = sales.filter(s =>
    s.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    (s.customer?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (v: number) => `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Invoices</h1>
          <p className="text-navy-400 text-sm mt-1">Generate, print, and download professional invoices</p>
        </div>
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
              {!loading && filtered.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-navy-400">No invoices found</td></tr>}
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
                <button onClick={() => handleDownload(selectedSale)} className="flex items-center gap-2 px-3 py-1.5 bg-gold-500 hover:bg-gold-600 text-navy-900 rounded-lg text-sm font-medium transition">
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
    </div>
  );
}
