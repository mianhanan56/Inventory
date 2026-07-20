export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'manager' | 'staff';
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  vat_number?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  category_id?: string;
  supplier_id?: string;
  cost_price: number;
  selling_price: number;
  total_stock?: number; // derived: current_stock + total sold (not a stored column)
  current_stock: number;
  min_stock_level: number;
  max_stock_level?: number;
  unit: string;
  vat_rate: number;
  is_active: boolean;
  image_url?: string;
  created_at: string;
  updated_at: string;
  category?: Category;
  supplier?: Supplier;
}

export interface StockMovement {
  id: string;
  product_id: string;
  type: 'in' | 'out' | 'adjustment' | 'return';
  quantity: number;
  reference?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  product?: Product;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  vat_number?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  invoice_number: string;
  customer_id?: string;
  subtotal: number;
  vat_total: number;
  discount_total: number;
  total: number;
  payment_method: 'cash' | 'card' | 'eft' | 'credit';
  status: 'draft' | 'completed' | 'cancelled' | 'refunded';
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  sale_items?: SaleItem[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  discount: number;
  line_total: number;
  created_at: string;
}

export type DiscountType = 'percentage' | 'fixed';

export interface CartItem {
  product: Product;
  quantity: number;
  discount: number;
  discount_type: DiscountType;
}

export type UserRole = 'admin' | 'manager' | 'staff';
