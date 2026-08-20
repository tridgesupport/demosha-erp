import { lazy, Suspense } from 'react';
import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';
import { Toaster } from '@/components/ui/toaster';
import { FiltersProvider } from '@/context/FiltersContext';
import { useAuth } from '@/context/AuthContext';
import FilterBar from '@/components/FilterBar';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ChangePassword from '@/pages/ChangePassword';
import OrdersList from '@/pages/orders/OrdersList';
import NewOrder from '@/pages/orders/NewOrder';
import OrderDetail from '@/pages/orders/OrderDetail';
import CustomersList from '@/pages/customers/CustomersList';
import CustomerDetail from '@/pages/customers/CustomerDetail';
import Products from '@/pages/catalog/Products';
import Settings from '@/pages/Settings';
import SundryDebtors from '@/pages/finance/SundryDebtors';
import SundryCreditors from '@/pages/finance/SundryCreditors';
import IndentsList from '@/pages/purchase/IndentsList';
import NewIndent from '@/pages/purchase/NewIndent';
import IndentDetail from '@/pages/purchase/IndentDetail';
import PurchaseOrdersList from '@/pages/purchase/PurchaseOrdersList';
import NewPurchaseOrder from '@/pages/purchase/NewPurchaseOrder';
import PurchaseOrderDetail from '@/pages/purchase/PurchaseOrderDetail';
import StockLevels from '@/pages/purchase/StockLevels';
import VendorsList from '@/pages/purchase/VendorsList';
import LogsheetList from '@/pages/production/LogsheetList';
import NewLogsheet from '@/pages/production/NewLogsheet';
import LogsheetDetail from '@/pages/production/LogsheetDetail';
import AnalyticalRegister from '@/pages/production/AnalyticalRegister';
import DispatchSchedulesList from '@/pages/dispatch/DispatchSchedulesList';
import NewDispatchSchedule from '@/pages/dispatch/NewDispatchSchedule';
import DispatchScheduleDetail from '@/pages/dispatch/DispatchScheduleDetail';
import RefreshDataButton from '@/components/analytics/RefreshDataButton';

// Lazy-loaded: the Analytics tab is restricted to admin/manager and most
// users never open it, so its code shouldn't be in everyone else's initial
// bundle — each of these only downloads the first time someone actually
// navigates to /analytics/*.
const SalesAnalysis = lazy(() => import('@/pages/analytics/SalesAnalysis'));
const PurchaseAnalysis = lazy(() => import('@/pages/analytics/PurchaseAnalysis'));
const AnalyticsOutstanding = lazy(() => import('@/pages/analytics/Outstanding'));
const ProfitAndLoss = lazy(() => import('@/pages/analytics/ProfitAndLoss'));
const BalanceSheet = lazy(() => import('@/pages/analytics/BalanceSheet'));
const CashFlow = lazy(() => import('@/pages/analytics/CashFlow'));
const AnalyticsInventory = lazy(() => import('@/pages/analytics/Inventory'));

function AnalyticsPageLoading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-200 rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  );
}

const TAB_CONFIG: Record<string, { label: string; links: { to: string; label: string; exact?: boolean }[] }> = {
  sales: {
    label: 'Sales',
    links: [
      { to: '/', label: 'Dashboard', exact: true },
      { to: '/orders', label: 'Orders' },
      { to: '/customers', label: 'Customers' },
      { to: '/sales/debtors', label: 'Sundry Debtors' },
    ],
  },
  purchase: {
    label: 'Purchase',
    links: [
      { to: '/purchase/indents', label: 'Indents' },
      { to: '/purchase/orders', label: 'Purchase Orders' },
      { to: '/purchase/vendors', label: 'Vendors' },
      { to: '/purchase/stock-levels', label: 'Stock Levels' },
      { to: '/purchase/creditors', label: 'Sundry Creditors' },
      { to: '/catalog/products', label: 'Catalog' },
    ],
  },
  management: {
    label: 'Management',
    links: [
      { to: '/dispatch/schedules', label: 'Dispatch Schedules' },
    ],
  },
  analytics: {
    label: 'Analytics',
    links: [
      { to: '/analytics/sales', label: 'Sales' },
      { to: '/analytics/purchase', label: 'Purchase' },
      { to: '/analytics/outstanding', label: 'Outstanding' },
      { to: '/analytics/pnl', label: 'Profit & Loss' },
      { to: '/analytics/balance-sheet', label: 'Balance Sheet' },
      { to: '/analytics/cash-flow', label: 'Cash Flow' },
      { to: '/analytics/inventory', label: 'Inventory' },
    ],
  },
  production: {
    label: 'Production',
    links: [
      { to: '/production/shs', label: 'SHS' },
      { to: '/production/analytical-register', label: 'SHS Analytical Register' },
    ],
  },
  inventory: {
    label: 'Inventory',
    links: [
      { to: '/inventory', label: 'Inventory' },
    ],
  },
};

function getActiveTab(pathname: string): string {
  for (const [tab, config] of Object.entries(TAB_CONFIG)) {
    if (config.links.some(l => l.exact ? pathname === l.to : pathname.startsWith(l.to))) {
      return tab;
    }
  }
  return '';
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  // Force password change before accessing anything else
  if (user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}

function TabGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return null;

  const activeTab = getActiveTab(location.pathname);
  const allowed = user.allowed_tabs ?? [];

  // Settings (/settings) is always allowed — it's not in TAB_CONFIG so activeTab = ''
  if (activeTab && !allowed.includes(activeTab)) {
    const firstAllowed = Object.keys(TAB_CONFIG).find(t => allowed.includes(t));
    const defaultTo = firstAllowed ? TAB_CONFIG[firstAllowed].links[0].to : '/';
    return <Navigate to={defaultTo} replace />;
  }
  return <>{children}</>;
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-gray-400">
      <p className="text-2xl font-semibold text-gray-300">{label}</p>
      <p className="text-sm mt-2">Coming soon</p>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const { user, logout } = useAuth();

  // Public routes rendered without the app shell
  if (['/login', '/forgot-password', '/reset-password'].some(p => location.pathname.startsWith(p))) {
    return (
      <>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
        <Toaster />
      </>
    );
  }

  // Force-change password page: in shell but no nav (user must act first)
  if (location.pathname === '/change-password') {
    return (
      <RequireAuth>
        <ChangePassword />
        <Toaster />
      </RequireAuth>
    );
  }

  const hideFilterBar = location.pathname.startsWith('/settings') ||
    location.pathname === '/orders/new' ||
    location.pathname.match(/^\/orders\/.+\/edit$/) ||
    location.pathname === '/purchase/indents/new' ||
    location.pathname === '/purchase/orders/new' ||
    location.pathname === '/purchase/stock-levels' ||
    location.pathname === '/purchase/vendors' ||
    location.pathname.startsWith('/production') ||
    location.pathname.startsWith('/analytics') ||
    location.pathname === '/dispatch/schedules/new' ||
    location.pathname.startsWith('/dispatch/schedules/');

  const ROLE_DEFAULTS: Record<string, string[]> = {
    admin:          ['sales', 'purchase', 'management', 'production', 'analytics'],
    manager:        ['sales', 'purchase', 'management', 'production', 'analytics'],
    salesperson:    ['sales'],
    factory:        ['purchase', 'management', 'production'],
    plant_incharge: ['production'],
  };
  const allowed = (user?.allowed_tabs?.length ? user.allowed_tabs : (user?.role ? ROLE_DEFAULTS[user.role] ?? [] : []));
  const activeTab = getActiveTab(location.pathname);
  const subLinks = (activeTab && allowed.includes(activeTab)) ? TAB_CONFIG[activeTab]?.links ?? [] : [];
  const isSettingsActive = location.pathname.startsWith('/settings');

  return (
    <RequireAuth>
      <FiltersProvider>
        <div className="min-h-screen bg-gray-50">
          <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
            {/* Top row: logo + tabs + settings + user */}
            <div className="max-w-screen-2xl mx-auto px-4 flex items-center gap-1 h-12 border-b border-gray-100">
              <span className="font-bold text-blue-700 mr-6 text-lg tracking-tight">Demosha ERP</span>
              <div className="flex items-center gap-0.5 flex-1">
                {Object.entries(TAB_CONFIG)
                  .filter(([tab]) => allowed.includes(tab))
                  .map(([tab, config]) => (
                    <NavLink
                      key={tab}
                      to={config.links[0].to}
                      className={() =>
                        `px-4 py-2 text-sm font-semibold rounded-t transition-colors ${
                          activeTab === tab
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`
                      }
                    >
                      {config.label}
                    </NavLink>
                  ))}
              </div>
              <div className="ml-auto flex items-center gap-3">
                {/* Settings — always visible regardless of tab permissions */}
                <NavLink
                  to="/settings"
                  className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    isSettingsActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                  }`}
                >
                  <SettingsIcon className="w-4 h-4" />
                  Settings
                </NavLink>
                <span className="text-xs text-gray-500">
                  {user?.name}{' '}
                  <span className="capitalize bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                    {user?.role}
                  </span>
                </span>
                <button onClick={logout} className="text-xs text-gray-500 hover:text-red-600">
                  Sign out
                </button>
              </div>
            </div>

            {/* Sub-nav row */}
            {subLinks.length > 0 && (
              <div className="max-w-screen-2xl mx-auto px-4 flex items-center justify-between gap-1 h-10">
                <div className="flex items-center gap-1">
                  {subLinks.map(({ to, label, exact }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={exact}
                      className={({ isActive }) =>
                        `px-3 py-1 rounded text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                        }`
                      }
                    >
                      {label}
                    </NavLink>
                  ))}
                </div>
                {activeTab === 'analytics' && <RefreshDataButton />}
              </div>
            )}
          </nav>

          {!hideFilterBar && <FilterBar />}

          <main className="max-w-screen-2xl mx-auto px-4 py-6">
            <TabGuard>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/orders" element={<OrdersList />} />
                <Route path="/orders/new" element={<NewOrder />} />
                <Route path="/orders/:id" element={<OrderDetail />} />
                <Route path="/customers" element={<CustomersList />} />
                <Route path="/customers/:id" element={<CustomerDetail />} />
                <Route path="/catalog/products" element={<Products />} />
                {/* Retired in favor of the live Analytics -> Outstanding page; redirect keeps old links/bookmarks working. */}
                <Route path="/finance/outstanding" element={<Navigate to="/analytics/outstanding" replace />} />
                <Route path="/analytics/sales" element={<Suspense fallback={<AnalyticsPageLoading />}><SalesAnalysis /></Suspense>} />
                <Route path="/analytics/purchase" element={<Suspense fallback={<AnalyticsPageLoading />}><PurchaseAnalysis /></Suspense>} />
                <Route path="/analytics/outstanding" element={<Suspense fallback={<AnalyticsPageLoading />}><AnalyticsOutstanding /></Suspense>} />
                <Route path="/analytics/pnl" element={<Suspense fallback={<AnalyticsPageLoading />}><ProfitAndLoss /></Suspense>} />
                <Route path="/analytics/balance-sheet" element={<Suspense fallback={<AnalyticsPageLoading />}><BalanceSheet /></Suspense>} />
                <Route path="/analytics/cash-flow" element={<Suspense fallback={<AnalyticsPageLoading />}><CashFlow /></Suspense>} />
                <Route path="/analytics/inventory" element={<Suspense fallback={<AnalyticsPageLoading />}><AnalyticsInventory /></Suspense>} />
                <Route path="/sales/debtors" element={<SundryDebtors />} />
                <Route path="/purchase/creditors" element={<SundryCreditors />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/purchase/indents" element={<IndentsList />} />
                <Route path="/purchase/indents/new" element={<NewIndent />} />
                <Route path="/purchase/indents/:id" element={<IndentDetail />} />
                <Route path="/purchase/orders" element={<PurchaseOrdersList />} />
                <Route path="/purchase/orders/new" element={<NewPurchaseOrder />} />
                <Route path="/purchase/orders/:id" element={<PurchaseOrderDetail />} />
                <Route path="/purchase/vendors" element={<VendorsList />} />
                <Route path="/purchase/stock-levels" element={<StockLevels />} />
                <Route path="/production/analytical-register" element={<AnalyticalRegister />} />
                <Route path="/production/:productCode/new" element={<NewLogsheet />} />
                <Route path="/production/:productCode/:id" element={<LogsheetDetail />} />
                <Route path="/production/:productCode" element={<LogsheetList />} />
                <Route path="/dispatch/schedules" element={<DispatchSchedulesList />} />
                <Route path="/dispatch/schedules/new" element={<NewDispatchSchedule />} />
                <Route path="/dispatch/schedules/:id" element={<DispatchScheduleDetail />} />
                <Route path="/inventory" element={<ComingSoon label="Inventory" />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </TabGuard>
          </main>

          <Toaster />
        </div>
      </FiltersProvider>
    </RequireAuth>
  );
}
