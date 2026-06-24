import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  Truck,
  Users,
  ShoppingCart,
  FileText,
  CreditCard,
  LogOut,
  Menu,
  X,
  ChevronLeft,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/products', icon: Package, label: 'Products' },
  { to: '/inventory', icon: ArrowLeftRight, label: 'Inventory' },
  { to: '/suppliers', icon: Truck, label: 'Suppliers' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/sales', icon: ShoppingCart, label: 'Sales & POS' },
  { to: '/invoices', icon: FileText, label: 'Invoices' },
  { to: '/payment', icon: CreditCard, label: 'Payment' },
];

export default function Sidebar() {
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const roleColors: Record<string, string> = {
    admin: 'bg-gold-500/20 text-gold-400',
    manager: 'bg-blue-500/20 text-blue-400',
    staff: 'bg-green-500/20 text-green-400',
  };

  function SidebarContent() {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-navy-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gold-500/10 border border-gold-500/20 rounded-xl flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-gold-500" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-white font-bold text-lg leading-tight truncate">ON TARGET</h1>
                <p className="text-navy-400 text-xs">UNITED</p>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gold-500/10 text-gold-400 border border-gold-500/20'
                    : 'text-navy-300 hover:text-white hover:bg-navy-700/50'
                } ${collapsed ? 'justify-center' : ''}`
              }
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-navy-700/50">
          {!collapsed && profile && (
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <div className="w-9 h-9 bg-navy-600 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0">
                {profile.full_name?.charAt(0)?.toUpperCase() || profile.email.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium truncate">{profile.full_name || profile.email}</p>
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${roleColors[profile.role] || roleColors.staff}`}>
                  {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                </span>
              </div>
            </div>
          )}
          <button
            onClick={signOut}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-navy-300 hover:text-red-400 hover:bg-red-500/10 transition ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-navy-800/90 backdrop-blur-xl border-b border-navy-700/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gold-500/10 border border-gold-500/20 rounded-lg flex items-center justify-center">
            <Package className="w-4 h-4 text-gold-500" />
          </div>
          <span className="text-white font-bold">ON TARGET UNITED</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-navy-300 hover:text-white">
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <div className={`lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-navy-800/95 backdrop-blur-xl border-r border-navy-700/50 transform transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </div>

      {/* Desktop sidebar */}
      <div className={`hidden lg:flex flex-col fixed top-0 left-0 bottom-0 z-30 bg-navy-800/80 backdrop-blur-xl border-r border-navy-700/50 transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'}`}>
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-8 w-6 h-6 bg-navy-700 border border-navy-600 rounded-full flex items-center justify-center text-navy-300 hover:text-white hover:bg-navy-600 transition"
        >
          <ChevronLeft className={`w-3 h-3 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </>
  );
}
