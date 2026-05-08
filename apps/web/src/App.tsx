import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { FiltersProvider } from '@/context/FiltersContext';
import { useAuth } from '@/context/AuthContext';
import FilterBar from '@/components/FilterBar';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import OrdersList from '@/pages/orders/OrdersList';
import NewOrder from '@/pages/orders/NewOrder';
import OrderDetail from '@/pages/orders/OrderDetail';
import CustomersList from '@/pages/customers/CustomersList';
import CustomerDetail from '@/pages/customers/CustomerDetail';
import Products from '@/pages/catalog/Products';
import Outstanding from '@/pages/finance/Outstanding';
import Settings from '@/pages/Settings';

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', exact: true },
  { to: '/orders', label: 'Orders' },
  { to: '/customers', label: 'Customers' },
  { to: '/catalog/products', label: 'Catalog' },
  { to: '/finance/outstanding', label: 'Finance' },
  { to: '/settings', label: 'Settings' },
];

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const location = useLocation();
  const { user, logout } = useAuth();

  const hideFilterBar = location.pathname.startsWith('/settings') ||
    location.pathname === '/orders/new' ||
    location.pathname.match(/^\/orders\/.+\/edit$/) ||
    location.pathname === '/login';

  if (location.pathname === '/login') {
    return (
      <>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
        <Toaster />
      </>
    );
  }

  return (
    <RequireAuth>
      <FiltersProvider>
        <div className="min-h-screen bg-gray-50">
          <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
            <div className="max-w-screen-2xl mx-auto px-4 flex items-center gap-1 h-14">
              <span className="font-bold text-blue-700 mr-6 text-lg tracking-tight">Demosha ERP</span>
              {NAV_LINKS.map(({ to, label, exact }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={exact}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {user?.name} <span className="capitalize bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{user?.role}</span>
                </span>
                <button onClick={logout} className="text-xs text-gray-500 hover:text-red-600">Sign out</button>
              </div>
            </div>
          </nav>

          {!hideFilterBar && <FilterBar />}

          <main className="max-w-screen-2xl mx-auto px-4 py-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/orders" element={<OrdersList />} />
              <Route path="/orders/new" element={<NewOrder />} />
              <Route path="/orders/:id" element={<OrderDetail />} />
              <Route path="/customers" element={<CustomersList />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/catalog/products" element={<Products />} />
              <Route path="/finance/outstanding" element={<Outstanding />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          <Toaster />
        </div>
      </FiltersProvider>
    </RequireAuth>
  );
}
