import { CartItem, Product, StagedOrder, StagedOrderLine } from '../types';

/**
 * The POS keeps its in-progress sale in localStorage (see usePersistentState),
 * which is also how the Customers tab hands a re-order over to it. These are the
 * only places that know the key names.
 */
export const POS_KEYS = {
  cart: 'pos.cart',
  customer: 'pos.customer',
  notes: 'pos.notes',
  stagedOrder: 'pos.stagedOrder',
} as const;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable (private mode) — persistence is best-effort.
  }
}

/**
 * Empty the cart the way the POS's own "Clear" button does. Any pending
 * re-order is dropped too — otherwise a staged order left behind by a
 * navigation that never reached the POS would silently refill a cart the
 * user just asked to start fresh.
 */
export function clearPosCart(): void {
  write(POS_KEYS.cart, []);
  write(POS_KEYS.notes, '');
  clearStagedOrder();
}

export function setPosCustomer(customerId: string): void {
  write(POS_KEYS.customer, customerId);
}

export function stageOrder(order: StagedOrder): void {
  write(POS_KEYS.stagedOrder, order);
  setPosCustomer(order.customer_id);
}

export function readStagedOrder(): StagedOrder | null {
  const staged = read<StagedOrder>(POS_KEYS.stagedOrder);
  if (!staged || !Array.isArray(staged.lines)) return null;
  return staged;
}

export function clearStagedOrder(): void {
  try {
    localStorage.removeItem(POS_KEYS.stagedOrder);
  } catch {
    // ignore
  }
}

export interface ResolvedStagedOrder {
  items: CartItem[];
  /** Lines that could not be added at all — discontinued or out of stock. */
  unavailable: string[];
  /** Lines added with a smaller quantity than requested, because of stock. */
  clamped: { name: string; requested: number; added: number }[];
}

/**
 * Turn staged lines into real cart items against the currently loaded products.
 *
 * Prices always come from the product's current selling_price, never the price
 * recorded on the historical sale, so a re-order can't silently undercharge.
 * The POS only loads active products with stock, so an unmatched product_id
 * means the item can no longer be sold.
 */
export function resolveStagedOrder(
  lines: StagedOrderLine[],
  products: Product[],
  alreadyInCart: (productId: string) => number = () => 0
): ResolvedStagedOrder {
  const items: CartItem[] = [];
  const unavailable: string[] = [];
  const clamped: ResolvedStagedOrder['clamped'] = [];
  // Quantities taken by earlier lines of this same order, so two lines for one
  // product (a sale that recorded it twice) can't add up to more than stock.
  const taken = new Map<string, number>();

  for (const line of lines) {
    const product = products.find(p => p.id === line.product_id);
    if (!product) {
      unavailable.push(line.product_name);
      continue;
    }
    const used = alreadyInCart(product.id) + (taken.get(product.id) ?? 0);
    const room = Math.max(0, product.current_stock - used);
    const quantity = Math.min(Math.max(1, line.quantity), room);
    if (quantity <= 0) {
      unavailable.push(product.name);
      continue;
    }
    if (quantity < line.quantity) {
      clamped.push({ name: product.name, requested: line.quantity, added: quantity });
    }
    taken.set(product.id, used - alreadyInCart(product.id) + quantity);
    items.push({ product, quantity, unit_price: product.selling_price });
  }

  return { items, unavailable, clamped };
}
