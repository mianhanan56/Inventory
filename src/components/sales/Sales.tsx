import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Product, Customer, CartItem, Sale } from '../../types';
import GlassCard from '../ui/GlassCard';
import Modal from '../ui/Modal';
import StatusBadge from '../ui/StatusBadge';
import {
  Search, ShoppingCart, Plus, Minus, CreditCard,
  Banknote, Receipt, Eye, X, Package, Printer, Download,
} from 'lucide-react';

export default function Sales() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'eft' | 'credit'>('cash');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'pos' | 'history'>('pos');
  const [saleDetail, setSaleDetail] = useState<Sale | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [prodRes, custRes, salesRes] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).gt('current_stock', 0).order('name'),
      supabase.from('customers').select('*').eq('is_active', true).order('name'),
      supabase.from('sales').select('*, customer:customers(*)').order('created_at', { ascending: false }).limit(50),
    ]);
    setProducts(prodRes.data || []);
    setCustomers(custRes.data || []);
    setSales(salesRes.data || []);
    setLoading(false);
  }

  function addToCart(product: Product) {
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      if (existing.quantity >= product.current_stock) return;
      setCart(cart.map(item =>
        item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setCart([...cart, { product, quantity: 1, unit_price: product.selling_price }]);
    }
  }

  // Amount discounted on a line = how far its edited unit price sits below the
  // product's original selling price, times quantity. Never negative (raising the
  // price above the original is not treated as a discount).
  function itemDiscountAmount(item: CartItem): number {
    return Math.max(0, (item.product.selling_price - item.unit_price) * item.quantity);
  }

  function updateItemPrice(productId: string, unit_price: number) {
    setCart(cart.map(item =>
      item.product.id === productId ? { ...item, unit_price } : item
    ));
  }

  function updateQuantity(productId: string, qty: number) {
    if (qty <= 0) { removeFromCart(productId); return; }
    setCart(cart.map(item =>
      item.product.id === productId ? { ...item, quantity: qty } : item
    ));
  }

  function removeFromCart(productId: string) {
    setCart(cart.filter(item => item.product.id !== productId));
  }

  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  const vatTotal = cart.reduce((sum, item) => {
    const linePrice = item.unit_price * item.quantity;
    return sum + (linePrice * item.product.vat_rate / 100);
  }, 0);

  // Total discount given across the cart = sum of each line's reduction below its
  // original selling price. Recorded on the sale for reporting/receipts.
  const totalItemDiscount = cart.reduce((sum, item) => sum + itemDiscountAmount(item), 0);

  const total = subtotal + vatTotal;

  // Generate the next invoice number as INV-YYYYMM-NNNN by reading the highest
  // existing number for the current month and incrementing it. This replaces the
  // DB generate_invoice_number() function, which parsed the sequence from the
  // wrong character offset and always returned 0001 (causing duplicate-key errors).
  async function nextInvoiceNumber(): Promise<string> {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `INV-${datePart}-`;
    const { data } = await supabase
      .from('sales')
      .select('invoice_number')
      .like('invoice_number', `${prefix}%`)
      .order('invoice_number', { ascending: false })
      .limit(1);
    let seq = 1;
    if (data && data.length > 0) {
      const lastSeq = parseInt(String(data[0].invoice_number).slice(prefix.length), 10);
      if (!Number.isNaN(lastSeq)) seq = lastSeq + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  async function completeSale() {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;

      // Insert the sale, generating the invoice number on the client. We retry on
      // a unique-constraint collision (code 23505) so concurrent sales — or a stale
      // sequence — resolve to the next free number instead of failing the sale.
      let saleResult: { id: string } | null = null;
      let invoiceNumber = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        invoiceNumber = await nextInvoiceNumber();
        const saleData = {
          invoice_number: invoiceNumber,
          customer_id: selectedCustomer || null,
          subtotal,
          vat_total: vatTotal,
          discount_total: totalItemDiscount,
          total,
          payment_method: paymentMethod,
          status: 'completed' as const,
          notes: notes || null,
          created_by: user?.id,
        };
        const { data, error: saleError } = await supabase.from('sales').insert(saleData).select().single();
        if (!saleError) { saleResult = data; break; }
        if (saleError.code === '23505' && attempt < 4) continue;
        throw saleError;
      }
      if (!saleResult) throw new Error('Could not generate a unique invoice number. Please try again.');

      const saleItems = cart.map(item => {
        const itemDiscount = itemDiscountAmount(item);
        return {
          sale_id: saleResult.id,
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          vat_rate: item.product.vat_rate,
          discount: itemDiscount,
          line_total: item.unit_price * item.quantity,
        };
      });

      const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
      if (itemsError) throw itemsError;

      // Create stock out movements for each item (audit trail)
      const stockMovements = cart.map(item => ({
        product_id: item.product.id,
        type: 'out' as const,
        quantity: item.quantity,
        reference: invoiceNumber,
        notes: `Sale: ${invoiceNumber}`,
        created_by: user?.id,
      }));
      const { error: movementsError } = await supabase.from('stock_movements').insert(stockMovements);
      if (movementsError) throw movementsError;

      // Deduct sold quantity from each product's stock. We set an absolute
      // target value (loaded stock - qty sold) rather than a relative decrement,
      // so the result is correct and idempotent whether or not a DB trigger also
      // adjusts stock on the movement insert (no risk of double-deduction).
      const stockUpdates = await Promise.all(
        cart.map(item =>
          supabase
            .from('products')
            .update({ current_stock: Math.max(0, item.product.current_stock - item.quantity) })
            .eq('id', item.product.id)
        )
      );
      const stockUpdateError = stockUpdates.find(res => res.error)?.error;
      if (stockUpdateError) throw stockUpdateError;

      // Reset
      setCart([]);
      setSelectedCustomer('');
      setNotes('');
      loadData();
    } catch (err) {
      console.error('Sale error:', err);
      const e = err as { message?: string; code?: string; details?: string; hint?: string } | null;
      const parts = [
        e?.message,
        e?.code ? `code: ${e.code}` : null,
        e?.details ? `details: ${e.details}` : null,
        e?.hint ? `hint: ${e.hint}` : null,
      ].filter(Boolean);
      const msg = parts.length ? parts.join('\n') : (err instanceof Error ? err.message : JSON.stringify(err));
      alert(`Sale could not be completed:\n${msg || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode && p.barcode.toLowerCase().includes(search.toLowerCase()))
  );

  const fmt = (v: number) => `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const paymentIcons: Record<string, typeof Banknote> = { cash: Banknote, card: CreditCard, eft: CreditCard, credit: Receipt };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black">Sales & POS</h1>
          <p className="text-navy-400 text-sm mt-1">Point of sale and sales history</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setViewMode('pos')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${viewMode === 'pos' ? 'bg-gold-500/10 text-gold-400 border border-gold-500/20' : 'text-navy-300 hover:text-black'}`}>
            <ShoppingCart className="w-4 h-4 inline mr-1" />POS
          </button>
          <button onClick={() => setViewMode('history')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${viewMode === 'history' ? 'bg-gold-500/10 text-gold-400 border border-gold-500/20' : 'text-navy-300 hover:text-black'}`}>
            <Receipt className="w-4 h-4 inline mr-1" />History
          </button>
        </div>
      </div>

      {viewMode === 'pos' ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Product Search & List */}
          <div className="xl:col-span-2 space-y-4">
            <GlassCard padding="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
                <input
                  type="text"
                  placeholder="Scan barcode or search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black placeholder-navy-400 text-sm focus:outline-none focus:border-gold-500/50 transition"
                  autoFocus
                />
              </div>
            </GlassCard>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="text-left bg-navy-800/40 backdrop-blur-xl border border-navy-700/30 rounded-xl p-4 hover:border-gold-500/30 hover:bg-navy-800/60 transition group"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 bg-navy-600 rounded-lg flex items-center justify-center group-hover:bg-gold-500/10 transition">
                      <Package className="w-5 h-5 text-navy-300 group-hover:text-gold-400 transition" />
                    </div>
                    {product.current_stock <= product.min_stock_level && (
                      <span className="text-xs bg-red-500/15 text-red-600 px-2 py-0.5 rounded-full">Low</span>
                    )}
                  </div>
                  <h4 className="text-black font-medium text-sm mt-2 truncate">{product.name}</h4>
                  <p className="text-navy-400 text-xs">{product.sku}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-gold-400 font-semibold">{fmt(product.selling_price)}</span>
                    <span className="text-navy-400 text-xs">{product.current_stock} in stock</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Cart */}
          <div className="space-y-4">
            <GlassCard className="sticky top-4">
              <h3 className="text-black font-semibold flex items-center gap-2 mb-4">
                <ShoppingCart className="w-5 h-5 text-gold-400" />
                Cart ({cart.length} items)
              </h3>

              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {cart.length === 0 && (
                  <p className="text-navy-400 text-sm text-center py-8">Cart is empty</p>
                )}
                {cart.map(item => (
                  <div key={item.product.id} className="bg-navy-700/30 rounded-xl p-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-black text-sm font-medium truncate">{item.product.name}</p>
                        <p className="text-navy-400 text-xs">{fmt(item.product.selling_price)} each</p>
                      </div>
                      <button onClick={() => removeFromCart(item.product.id)} className="text-navy-400 hover:text-red-600 transition p-0.5">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="w-7 h-7 bg-navy-600 rounded-lg flex items-center justify-center text-black hover:bg-navy-500 transition">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-black font-medium text-sm w-8 text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="w-7 h-7 bg-navy-600 rounded-lg flex items-center justify-center text-black hover:bg-navy-500 transition">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-gold-400 font-semibold text-sm">
                        {fmt(item.unit_price * item.quantity)}
                      </span>
                    </div>
                    <div className="mt-2">
                      <label className="block text-navy-300 text-xs mb-1">Unit Price (R)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateItemPrice(item.product.id, Number(e.target.value))}
                          className="min-w-0 flex-1 px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50"
                        />
                        {item.unit_price !== item.product.selling_price && (
                          <button
                            onClick={() => updateItemPrice(item.product.id, item.product.selling_price)}
                            className="text-navy-400 hover:text-gold-400 text-xs whitespace-nowrap px-2 py-2 transition"
                            title="Reset to original price"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      {itemDiscountAmount(item) > 0 && (
                        <p className="text-red-600 text-xs mt-1">
                          -{fmt(itemDiscountAmount(item))} off ({fmt(item.product.selling_price)} each)
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {cart.length > 0 && (
                <div className="border-t border-navy-700/50 mt-4 pt-4 space-y-3">
                  <div>
                    <label className="block text-navy-300 text-xs mb-1">Customer</label>
                    <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)} className="w-full px-3 py-2 bg-navy-700/50 border border-navy-600/30 rounded-xl text-black text-sm focus:outline-none focus:border-gold-500/50">
                      <option value="">Walk-in Customer</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-navy-300 text-xs mb-1">Payment Method</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['cash', 'card', 'eft', 'credit'] as const).map(method => {
                        const Icon = paymentIcons[method];
                        return (
                          <button
                            key={method}
                            onClick={() => setPaymentMethod(method)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition ${
                              paymentMethod === method
                                ? 'bg-gold-500/10 text-gold-400 border border-gold-500/20'
                                : 'bg-navy-700/30 text-navy-300 border border-navy-600/30 hover:border-navy-500/50'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            {method.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-navy-300">
                      <span>Subtotal</span><span>{fmt(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-navy-300">
                      <span>VAT</span><span>{fmt(vatTotal)}</span>
                    </div>
                    {totalItemDiscount > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Discount</span><span>-{fmt(totalItemDiscount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-black font-bold text-lg pt-2 border-t border-navy-700/50">
                      <span>Total</span><span>{fmt(total)}</span>
                    </div>
                  </div>

                  <button
                    onClick={completeSale}
                    disabled={saving || cart.length === 0}
                    className="w-full py-3 bg-gold-500 hover:bg-gold-600 text-black font-bold rounded-xl transition disabled:opacity-50 text-sm"
                  >
                    {saving ? 'Processing...' : 'Complete Sale'}
                  </button>
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      ) : (
        /* Sales History */
        <GlassCard padding="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-navy-700/50">
                  <th className="text-left py-3 px-4 text-navy-400 font-medium">Invoice</th>
                  <th className="text-left py-3 px-4 text-navy-400 font-medium">Customer</th>
                  <th className="text-right py-3 px-4 text-navy-400 font-medium">Total</th>
                  <th className="text-left py-3 px-4 text-navy-400 font-medium">Payment</th>
                  <th className="text-left py-3 px-4 text-navy-400 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-navy-400 font-medium">Date</th>
                  <th className="text-right py-3 px-4 text-navy-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-navy-400">No sales recorded yet</td></tr>}
                {sales.map(sale => (
                  <tr key={sale.id} className="border-b border-navy-700/30 hover:bg-navy-700/20 transition">
                    <td className="py-3 px-4 text-black font-medium font-mono">{sale.invoice_number}</td>
                    <td className="py-3 px-4 text-navy-300">{sale.customer?.name || 'Walk-in'}</td>
                    <td className="py-3 px-4 text-black font-semibold text-right">{fmt(Number(sale.total))}</td>
                    <td className="py-3 px-4 text-navy-300">{sale.payment_method.toUpperCase()}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={sale.status} variant={sale.status === 'completed' ? 'success' : sale.status === 'cancelled' ? 'danger' : 'neutral'} />
                    </td>
                    <td className="py-3 px-4 text-navy-300">{new Date(sale.created_at).toLocaleDateString('en-ZA')}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={async () => {
                          const { data } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id);
                          setSaleDetail({ ...sale, sale_items: data || [] });
                        }} className="p-1.5 text-navy-400 hover:text-gold-400 hover:bg-gold-500/10 rounded-lg transition">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={async () => {
                          const { data } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id);
                          const items = data || [];
                          const { printInvoice } = await import('../../lib/invoices');
                          printInvoice({ ...sale, sale_items: items }, items);
                        }} className="p-1.5 text-navy-400 hover:text-blue-600 hover:bg-blue-500/10 rounded-lg transition" title="Print Invoice">
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Sale Detail Modal */}
      <Modal isOpen={!!saleDetail} onClose={() => setSaleDetail(null)} title={`Sale ${saleDetail?.invoice_number || ''}`} size="lg">
        {saleDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-navy-400">Customer:</span><span className="text-black ml-2">{saleDetail.customer?.name || 'Walk-in'}</span></div>
              <div><span className="text-navy-400">Payment:</span><span className="text-black ml-2">{saleDetail.payment_method.toUpperCase()}</span></div>
              <div><span className="text-navy-400">Date:</span><span className="text-black ml-2">{new Date(saleDetail.created_at).toLocaleDateString('en-ZA')}</span></div>
              <div><span className="text-navy-400">Status:</span><span className="ml-2"><StatusBadge status={saleDetail.status} variant={saleDetail.status === 'completed' ? 'success' : 'neutral'} /></span></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-navy-700/50">
                    <th className="text-left py-2 text-navy-400">Item</th>
                    <th className="text-right py-2 text-navy-400">Qty</th>
                    <th className="text-right py-2 text-navy-400">Price</th>
                    <th className="text-right py-2 text-navy-400">VAT</th>
                    <th className="text-right py-2 text-navy-400">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(saleDetail.sale_items || []).map(item => (
                    <tr key={item.id} className="border-b border-navy-700/30">
                      <td className="py-2 text-black">{item.product_name}</td>
                      <td className="py-2 text-navy-300 text-right">{item.quantity}</td>
                      <td className="py-2 text-navy-300 text-right">{fmt(item.unit_price)}</td>
                      <td className="py-2 text-navy-300 text-right">{item.vat_rate}%</td>
                      <td className="py-2 text-black text-right">{fmt(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-navy-700/50 pt-3 text-sm space-y-1">
              <div className="flex justify-between text-navy-300"><span>Subtotal</span><span>{fmt(Number(saleDetail.subtotal))}</span></div>
              <div className="flex justify-between text-navy-300"><span>VAT</span><span>{fmt(Number(saleDetail.vat_total))}</span></div>
              {Number(saleDetail.discount_total) > 0 && <div className="flex justify-between text-red-600"><span>Discount</span><span>-{fmt(Number(saleDetail.discount_total))}</span></div>}
              <div className="flex justify-between text-black font-bold text-lg pt-2 border-t border-navy-700/50"><span>Total</span><span>{fmt(Number(saleDetail.total))}</span></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
