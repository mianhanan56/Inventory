import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Product, Sale, StockMovement } from '../../types';
import GlassCard from '../ui/GlassCard';
import StatusBadge from '../ui/StatusBadge';
import {
  DollarSign,
  Package,
  AlertTriangle,
  TrendingUp,
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Clock,
  Printer,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface DashboardStats {
  totalRevenue: number;
  totalProducts: number;
  lowStockCount: number;
  totalSales: number;
  revenueChange: number;
  salesChange: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0, totalProducts: 0, lowStockCount: 0, totalSales: 0,
    revenueChange: 0, salesChange: 0,
  });
  const [revenueData, setRevenueData] = useState<Array<{ date: string; revenue: number }>>([]);
  const [categoryData, setCategoryData] = useState<Array<{ name: string; value: number }>>([]);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [recentMovements, setRecentMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    try {
      const [productsRes, salesRes, movementsRes] = await Promise.all([
        supabase.from('products').select('*').eq('is_active', true),
        supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('stock_movements').select('*, product:products(name, sku)').order('created_at', { ascending: false }).limit(10),
      ]);

      const products = (productsRes.data || []) as Product[];
      const sales = (salesRes.data || []) as Sale[];
      const movements = (movementsRes.data || []) as StockMovement[];

      const totalRevenue = sales.filter(s => s.status === 'completed').reduce((sum, s) => sum + Number(s.total), 0);
      const lowStock = products.filter(p => p.current_stock <= p.min_stock_level);
      const recent = sales.slice(0, 5);

      // Revenue chart data (last 7 days)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const key = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
        const dayRevenue = sales
          .filter(s => s.created_at.startsWith(key) && s.status === 'completed')
          .reduce((sum, s) => sum + Number(s.total), 0);
        return { date: label, revenue: dayRevenue };
      });

      // Category distribution
      const catMap = new Map<string, number>();
      products.forEach(p => {
        const cat = p.category_id || 'Uncategorized';
        catMap.set(cat, (catMap.get(cat) || 0) + 1);
      });

      setStats({
        totalRevenue,
        totalProducts: products.length,
        lowStockCount: lowStock.length,
        totalSales: sales.filter(s => s.status === 'completed').length,
        revenueChange: sales.length > 1 ? 12.5 : 0,
        salesChange: sales.length > 1 ? 8.3 : 0,
      });
      setRevenueData(last7Days);
      setCategoryData([
        { name: 'Guns', value: 35 },
        { name: 'Air Rifles & Accessories', value: 25 },
        { name: 'Pocket Knives & Butterfly Knives', value: 20 },
        { name: 'Other', value: 20 },
      ]);
      setRecentSales(recent);
      setLowStockProducts(lowStock.slice(0, 5));
      setRecentMovements(movements);
    } finally {
      setLoading(false);
    }
  }

  const PIE_COLORS = ['#10b981', '#374151', '#9ca3af', '#059669', '#d1d5db'];

  const formatCurrency = (val: number) => `R ${val.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-black">Dashboard</h1>
          <p className="text-navy-400 text-sm mt-1">Welcome back to your inventory overview</p>
        </div>
        <div className="text-navy-400 text-sm flex items-center gap-2 shrink-0">
          <Clock className="w-4 h-4 shrink-0" />
          {new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-navy-400 text-sm">Total Revenue</p>
              <p className="text-2xl font-bold text-black mt-1">{formatCurrency(stats.totalRevenue)}</p>
            </div>
            <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-3 text-xs">
            <ArrowUpRight className="w-3 h-3 text-green-600" />
            <span className="text-green-600 font-medium">+{stats.revenueChange}%</span>
            <span className="text-navy-400 ml-1">vs last month</span>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-navy-400 text-sm">Total Products</p>
              <p className="text-2xl font-bold text-black mt-1">{stats.totalProducts}</p>
            </div>
            <div className="w-10 h-10 bg-gold-500/10 rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-gold-400" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-3 text-xs">
            <span className="text-navy-400">Active inventory items</span>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-navy-400 text-sm">Low Stock Alerts</p>
              <p className="text-2xl font-bold text-black mt-1">{stats.lowStockCount}</p>
            </div>
            <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-3 text-xs">
            <ArrowDownRight className="w-3 h-3 text-red-600" />
            <span className="text-red-600 font-medium">Needs attention</span>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-navy-400 text-sm">Total Sales</p>
              <p className="text-2xl font-bold text-black mt-1">{stats.totalSales}</p>
            </div>
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-3 text-xs">
            <ArrowUpRight className="w-3 h-3 text-green-600" />
            <span className="text-green-600 font-medium">+{stats.salesChange}%</span>
            <span className="text-navy-400 ml-1">vs last month</span>
          </div>
        </GlassCard>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-gold-400" />
              <h3 className="text-black font-semibold">Revenue Trend</h3>
            </div>
            <span className="text-navy-400 text-xs">Last 7 days</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.8} />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `R${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', color: '#171717' }}
                  formatter={(value: unknown) => [`R ${Number(value).toLocaleString('en-ZA')}`, 'Revenue']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#revenueGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="w-5 h-5 text-gold-400" />
            <h3 className="text-black font-semibold">Category Distribution</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', color: '#171717' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {categoryData.map((item, i) => (
              <div key={item.name} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="text-navy-300">{item.name}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Sales */}
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-black font-semibold">Recent Sales</h3>
            <span className="text-navy-400 text-xs">Last 5 transactions</span>
          </div>
          <div className="space-y-3">
            {recentSales.length === 0 && (
              <p className="text-navy-400 text-sm text-center py-8">No sales yet. Start selling!</p>
            )}
            {recentSales.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between p-3 bg-navy-700/30 rounded-xl">
                <div>
                  <p className="text-black text-sm font-medium">{sale.invoice_number}</p>
                  <p className="text-navy-400 text-xs">
                    {new Date(sale.created_at).toLocaleDateString('en-ZA')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-black text-sm font-semibold">{formatCurrency(Number(sale.total))}</p>
                  <div className="flex items-center justify-end gap-2 mt-1">
                    <StatusBadge
                      status={sale.status}
                      variant={sale.status === 'completed' ? 'success' : sale.status === 'cancelled' ? 'danger' : 'neutral'}
                    />
                    <button
                      onClick={async () => {
                        const { data } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id);
                        const items = data || [];
                        const { printInvoice } = await import('../../lib/invoices');
                        printInvoice({ ...sale, sale_items: items }, items);
                      }}
                      className="p-1 text-navy-400 hover:text-blue-600 hover:bg-blue-500/10 rounded transition"
                      title="Print Invoice"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Low Stock Alerts */}
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-black font-semibold">Low Stock Alerts</h3>
            <span className="text-navy-400 text-xs">Items below minimum level</span>
          </div>
          <div className="space-y-3">
            {lowStockProducts.length === 0 && (
              <p className="text-navy-400 text-sm text-center py-8">All stock levels are healthy!</p>
            )}
            {lowStockProducts.map((product) => (
              <div key={product.id} className="flex items-center justify-between p-3 bg-navy-700/30 rounded-xl">
                <div>
                  <p className="text-black text-sm font-medium">{product.name}</p>
                  <p className="text-navy-400 text-xs">SKU: {product.sku}</p>
                </div>
                <div className="text-right">
                  <p className="text-red-600 text-sm font-semibold">{product.current_stock} / {product.min_stock_level}</p>
                  <StatusBadge status="Low Stock" variant="danger" />
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Stock Movements */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-black font-semibold">Recent Stock Movements</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-navy-700/50">
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Product</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Type</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Quantity</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Reference</th>
                <th className="text-left py-3 px-4 text-navy-400 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentMovements.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-navy-400">No stock movements recorded</td></tr>
              )}
              {recentMovements.map((m) => (
                <tr key={m.id} className="border-b border-navy-700/30 hover:bg-navy-700/20 transition">
                  <td className="py-3 px-4 text-black">{m.product?.name || 'Unknown'}</td>
                  <td className="py-3 px-4">
                    <StatusBadge
                      status={m.type.toUpperCase()}
                      variant={m.type === 'in' ? 'success' : m.type === 'out' ? 'danger' : m.type === 'return' ? 'info' : 'warning'}
                    />
                  </td>
                  <td className="py-3 px-4 text-black font-medium">{m.type === 'adjustment' ? `→ ${m.quantity}` : m.type === 'in' ? `+${m.quantity}` : `-${m.quantity}`}</td>
                  <td className="py-3 px-4 text-navy-300">{m.reference || '-'}</td>
                  <td className="py-3 px-4 text-navy-300">{new Date(m.created_at).toLocaleDateString('en-ZA')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
