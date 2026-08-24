import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { clearPosCart, setPosCustomer, stageOrder } from '../../lib/posCart';
import { Customer, Sale, StagedOrderLine } from '../../types';
import {
  X, ShoppingCart, RotateCcw, Receipt, ChevronDown, ChevronRight,
  Check, Sparkles, Plus,
} from 'lucide-react';

const fmt = (v: number) =>
  `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  customer: Customer;
  onClose: () => void;
}

export default function CustomerHistoryPanel({ customer, onClose }: Props) {
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, StagedOrderLine>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelected({});
    setExpanded(null);
    (async () => {
      const { data } = await supabase
        .from('sales')
        .select('*, sale_items(*)')
        .eq('customer_id', customer.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(20);
      if (cancelled) return;
      const rows = data || [];
      setSales(rows);
      // Open the most recent purchase by default — it is what gets re-ordered
      // most often, so it should not need a second click to see.
      setExpanded(rows[0]?.id ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [customer.id]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Items this customer buys most, rolled up across every purchase. Quantity
  // defaults to what they took the last (most recent) time.
  const frequent = useMemo(() => {
    const map = new Map<string, { line: StagedOrderLine; times: number }>();
    for (const sale of sales) {
      for (const item of sale.sale_items || []) {
        const existing = map.get(item.product_id);
        if (existing) {
          existing.times += 1;
        } else {
          // sales are newest-first, so the first sighting is the latest quantity
          map.set(item.product_id, {
            times: 1,
            line: { product_id: item.product_id, product_name: item.product_name, quantity: item.quantity },
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => b.times - a.times).slice(0, 12);
  }, [sales]);

  // `sales` is capped at the 20 most recent purchases (that is all this panel
  // needs for re-ordering), so this is the spend across those, not lifetime
  // spend. The header says so — it used to read "N purchases · R x spent",
  // which stopped being true at the customer's 21st order and understated a
  // long-standing customer's value. Lifetime figures are on the Customers card.
  const RECENT_LIMIT = 20;
  const cappedAtLimit = sales.length === RECENT_LIMIT;
  const totalSpent = sales.reduce((sum, s) => sum + Number(s.total), 0);
  const selectedLines = Object.values(selected);

  function toggleItem(line: StagedOrderLine) {
    setSelected(prev => {
      const next = { ...prev };
      if (next[line.product_id]) delete next[line.product_id];
      else next[line.product_id] = line;
      return next;
    });
  }

  // Re-ordered items are always added to whatever is in the POS cart — nothing
  // an unfinished sale already holds is thrown away. The POS's own Clear button
  // and the re-order banner are there for starting over.
  function reorder(lines: StagedOrderLine[], source: string) {
    if (lines.length === 0) return;
    stageOrder({
      customer_id: customer.id,
      customer_name: customer.name,
      source,
      mode: 'merge',
      lines,
    });
    navigate('/sales');
  }

  // "New Purchase" is the deliberate start-over: the cart is emptied so the
  // user picks fresh items, with this customer already selected.
  function startNewPurchase() {
    clearPosCart();
    setPosCustomer(customer.id);
    navigate('/sales');
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-xl bg-navy-800 border-l border-navy-600/30 shadow-2xl flex flex-col h-full">
        <div className="flex items-start justify-between px-6 py-4 border-b border-navy-700/50">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-black truncate">{customer.name}</h2>
            <p className="text-navy-400 text-sm mt-0.5">
              {loading
                ? 'Loading purchases…'
                : cappedAtLimit
                  ? `Last ${RECENT_LIMIT} purchases · ${fmt(totalSpent)}`
                  : `${sales.length} purchase${sales.length === 1 ? '' : 's'} · ${fmt(totalSpent)} spent`}
            </p>
          </div>
          <button onClick={onClose} className="text-navy-400 hover:text-black transition p-1 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* The fork between the two flows lives at the top, always visible. */}
        <div className="px-6 py-3 border-b border-navy-700/50">
          <button
            onClick={startNewPurchase}
            className="flex items-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-600 text-black font-semibold rounded-xl text-sm transition"
          >
            <Plus className="w-4 h-4" /> New Purchase
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full" />
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="w-10 h-10 text-navy-500 mx-auto mb-3" />
              <p className="text-black font-medium">No purchases yet</p>
              <p className="text-navy-400 text-sm mt-1">Start this customer's first order with New Purchase.</p>
            </div>
          ) : (
            <>
              <section>
                {/* Selection actions sit with the items they act on, not at the
                    top of the panel — the count is the feedback for tapping. */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="flex items-center gap-2 text-black font-semibold text-sm min-w-0">
                    <Sparkles className="w-4 h-4 text-gold-400 shrink-0" /> Frequently bought
                    <span className="text-navy-400 font-normal truncate">— tap to select</span>
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedLines.length > 0 && (
                      <button onClick={() => setSelected({})} className="text-navy-400 hover:text-black text-xs px-1 py-1 transition">
                        Clear
                      </button>
                    )}
                    <button
                      onClick={() => reorder(selectedLines, 'purchase history')}
                      disabled={selectedLines.length === 0}
                      className="flex items-center gap-2 px-3 py-1.5 bg-navy-700/50 border border-navy-600/30 text-black font-medium rounded-xl text-xs transition hover:border-gold-500/40 disabled:opacity-40 disabled:hover:border-navy-600/30"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      Add selected{selectedLines.length > 0 ? ` (${selectedLines.length})` : ''}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {frequent.map(({ line }) => {
                    const isSelected = !!selected[line.product_id];
                    return (
                      <button
                        key={line.product_id}
                        onClick={() => toggleItem(line)}
                        aria-pressed={isSelected}
                        title={isSelected ? 'Remove from selection' : 'Add to selection'}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition border-2 ${
                          isSelected
                            ? 'bg-gold-500/10 border-gold-500 text-black'
                            : 'bg-navy-700/30 border-navy-600/30 text-navy-300 hover:border-gold-500/40'
                        }`}
                      >
                        {isSelected
                          ? <span className="flex items-center justify-center w-4 h-4 bg-gold-500 text-black rounded-full shrink-0"><Check className="w-2.5 h-2.5" /></span>
                          : <Plus className="w-3.5 h-3.5 shrink-0" />}
                        <span className="truncate max-w-[200px]">{line.product_name}</span>
                        {/* Selected chips carry an explicit remove affordance. The
                            whole chip is the click target, so this stays an icon
                            rather than a nested button. */}
                        {isSelected && (
                          <X className="w-3.5 h-3.5 shrink-0 text-navy-400 hover:text-red-600 transition" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="flex items-center gap-2 text-black font-semibold text-sm mb-3">
                  <Receipt className="w-4 h-4 text-gold-400" /> Past purchases
                </h3>
                <div className="space-y-2">
                  {sales.map(sale => {
                    const items = sale.sale_items || [];
                    const isOpen = expanded === sale.id;
                    const lines: StagedOrderLine[] = items.map(i => ({
                      product_id: i.product_id,
                      product_name: i.product_name,
                      quantity: i.quantity,
                    }));
                    return (
                      <div key={sale.id} className="bg-navy-700/30 border border-navy-600/30 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <button
                            onClick={() => setExpanded(isOpen ? null : sale.id)}
                            className="flex items-center gap-2 min-w-0 flex-1 text-left"
                          >
                            {isOpen ? <ChevronDown className="w-4 h-4 text-navy-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-navy-400 shrink-0" />}
                            <div className="min-w-0">
                              <p className="text-black text-sm font-medium font-mono truncate">{sale.invoice_number}</p>
                              <p className="text-navy-400 text-xs">
                                {new Date(sale.created_at).toLocaleDateString('en-ZA')} · {items.length} item{items.length === 1 ? '' : 's'} · {fmt(Number(sale.total))}
                              </p>
                            </div>
                          </button>
                          <button
                            onClick={() => reorder(lines, sale.invoice_number)}
                            disabled={lines.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gold-400 bg-gold-500/10 border border-gold-500/20 rounded-lg hover:bg-gold-500/20 transition shrink-0 disabled:opacity-40"
                            title="Load every item from this invoice into the POS"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Reorder all
                          </button>
                        </div>

                        {isOpen && (
                          <div className="border-t border-navy-600/30 divide-y divide-navy-600/20">
                            {items.length === 0 && <p className="text-navy-400 text-xs px-3 py-3">No items recorded on this sale.</p>}
                            {items.map(item => {
                              const isSelected = !!selected[item.product_id];
                              return (
                                <button
                                  key={item.id}
                                  onClick={() => toggleItem({ product_id: item.product_id, product_name: item.product_name, quantity: item.quantity })}
                                  aria-pressed={isSelected}
                                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition ${
                                    isSelected ? 'bg-gold-500/10' : 'hover:bg-navy-600/20'
                                  }`}
                                >
                                  <span className={`flex items-center justify-center w-4 h-4 rounded-full shrink-0 border ${
                                    isSelected ? 'bg-gold-500 border-gold-500 text-black' : 'border-navy-500'
                                  }`}>
                                    {isSelected && <Check className="w-2.5 h-2.5" />}
                                  </span>
                                  <span className="text-black text-sm truncate flex-1">{item.product_name}</span>
                                  <span className="text-navy-400 text-xs shrink-0">×{item.quantity}</span>
                                  <span className="text-navy-300 text-xs shrink-0 w-20 text-right">{fmt(Number(item.line_total))}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
