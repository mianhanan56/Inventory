import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { NavLink, useLocation } from 'react-router-dom';
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
  ChevronLeft,
  ChevronUp,
  LayoutGrid,
  Contact,
  Wallet,
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

// Bottom-nav dropdown groups (mobile only) — 3 routes per dropdown.
const navGroups = [
  { label: 'Overview', icon: LayoutGrid, items: navItems.slice(0, 3) },
  { label: 'Contacts', icon: Contact, items: navItems.slice(3, 6) },
  { label: 'Billing', icon: Wallet, items: navItems.slice(6, 9) },
];

export default function Sidebar() {
  const { profile, signOut } = useAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroup, setOpenGroup] = useState<number | 'profile' | null>(null);

  const roleColors: Record<string, string> = {
    admin: 'bg-gold-500/20 text-gold-400',
    manager: 'bg-blue-500/20 text-blue-600',
    staff: 'bg-green-500/20 text-green-600',
  };

  return (
    <>
      {/* Sidebar — web & tablet (>= 768px) */}
      <div className={`hidden md:flex flex-col fixed top-0 left-0 bottom-0 z-30 bg-navy-800/80 backdrop-blur-xl border-r border-navy-700/50 transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'}`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-navy-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gold-500/10 border border-gold-500/20 rounded-xl flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-gold-500" />
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <h1 className="text-black font-bold text-lg leading-tight truncate">ON TARGET</h1>
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
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-gold-500/10 text-gold-400 border border-gold-500/20'
                      : 'text-navy-300 hover:text-black hover:bg-navy-700/50'
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
                <div className="w-9 h-9 bg-navy-600 rounded-full flex items-center justify-center text-black font-semibold text-sm shrink-0">
                  {profile.full_name?.charAt(0)?.toUpperCase() || profile.email.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-black text-sm font-medium truncate">{profile.full_name || profile.email}</p>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${roleColors[profile.role] || roleColors.staff}`}>
                    {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                  </span>
                </div>
              </div>
            )}
            <button
              onClick={signOut}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-navy-300 hover:text-red-600 hover:bg-red-500/10 transition ${collapsed ? 'justify-center' : ''}`}
            >
              <LogOut className="w-5 h-5 shrink-0" />
              {!collapsed && <span>Sign Out</span>}
            </button>
          </div>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-8 w-6 h-6 bg-navy-700 border border-navy-600 rounded-full flex items-center justify-center text-navy-300 hover:text-black hover:bg-navy-600 transition"
        >
          <ChevronLeft className={`w-3 h-3 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Mobile bottom navigation with dropdowns (< 768px) */}
      {openGroup !== null && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setOpenGroup(null)} />
      )}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-navy-800/95 backdrop-blur-xl border-t border-navy-700/50">
        <div className="flex">
          {navGroups.map((group, i) => {
            const activeItem = group.items.find((item) =>
              item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
            );
            const active = !!activeItem;
            const displayItem = activeItem || group.items[0];
            const TriggerIcon = displayItem.icon;
            const triggerLabel = displayItem.label;
            const isOpen = openGroup === i;
            const alignRight = i === navGroups.length - 1;
            return (
              <div key={group.label} className="relative flex-1">
                {/* Dropdown panel */}
                {isOpen && (
                  <div
                    className={`absolute bottom-full mb-2 w-max min-w-[180px] max-w-[80vw] rounded-xl bg-navy-800 border border-navy-700/50 shadow-xl overflow-hidden ${
                      alignRight ? 'right-1' : 'left-1'
                    }`}
                  >
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        onClick={() => setOpenGroup(null)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                            isActive
                              ? 'bg-gold-500/10 text-gold-400'
                              : 'text-navy-300 hover:text-black hover:bg-navy-700/50'
                          }`
                        }
                      >
                        <item.icon className="w-5 h-5 shrink-0" />
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}

                {/* Group trigger */}
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : i)}
                  className={`flex flex-col items-center justify-center gap-1 w-full py-2 text-[11px] font-medium whitespace-nowrap transition-colors ${
                    active || isOpen ? 'text-gold-400' : 'text-navy-400 hover:text-black'
                  }`}
                >
                  <TriggerIcon className="w-5 h-5 shrink-0" />
                  <div className="flex items-center gap-1">
                    <span className="truncate max-w-[70px]">{triggerLabel}</span>
                    <ChevronUp
                      className={`w-3 h-3 shrink-0 transition-transform duration-200 ${isOpen ? '' : 'rotate-180'}`}
                    />
                  </div>
                </button>
              </div>
            );
          })}

          {/* Profile dropdown */}
          <div className="relative flex-1">
            {openGroup === 'profile' && (
              <div className="absolute bottom-full right-1 mb-2 w-max min-w-[200px] max-w-[80vw] rounded-xl bg-navy-800 border border-navy-700/50 shadow-xl overflow-hidden">
                {profile && (
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-navy-700/50">
                    <div className="w-9 h-9 bg-navy-600 rounded-full flex items-center justify-center text-black font-semibold text-sm shrink-0">
                      {profile.full_name?.charAt(0)?.toUpperCase() || profile.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-black text-sm font-medium truncate">{profile.full_name || profile.email}</p>
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${roleColors[profile.role] || roleColors.staff}`}>
                        {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                      </span>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => { setOpenGroup(null); signOut(); }}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-navy-300 hover:text-red-600 hover:bg-red-500/10 transition-colors whitespace-nowrap"
                >
                  <LogOut className="w-5 h-5 shrink-0" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setOpenGroup(openGroup === 'profile' ? null : 'profile')}
              className={`flex flex-col items-center justify-center gap-1 w-full py-2 text-[11px] font-medium whitespace-nowrap transition-colors ${
                openGroup === 'profile' ? 'text-gold-400' : 'text-navy-400 hover:text-black'
              }`}
            >
              <div className="w-5 h-5 bg-navy-600 rounded-full flex items-center justify-center text-black font-semibold text-[10px] shrink-0">
                {profile?.full_name?.charAt(0)?.toUpperCase() || profile?.email?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="flex items-center gap-1">
                <span>Profile</span>
                <ChevronUp
                  className={`w-3 h-3 transition-transform duration-200 ${openGroup === 'profile' ? '' : 'rotate-180'}`}
                />
              </div>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
