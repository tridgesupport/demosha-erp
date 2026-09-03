// Sub-tab (nav link) set for each top-level tab, used by the link-level
// permission system (role_link_permissions). Kept in sync by hand with
// TAB_CONFIG in apps/web/src/App.tsx — same duplication the tab list
// itself already has between here and VALID_TABS in routes/auth.ts.
export const TAB_LINKS: Record<string, string[]> = {
  sales: ['/', '/orders', '/customers', '/sales/debtors'],
  purchase: ['/purchase/indents', '/purchase/orders', '/purchase/vendors', '/purchase/stock-levels', '/purchase/creditors', '/catalog/products'],
  management: ['/dispatch/schedules'],
  analytics: ['/analytics/sales', '/analytics/purchase', '/analytics/outstanding', '/analytics/pnl', '/analytics/balance-sheet', '/analytics/cash-flow', '/analytics/inventory'],
  production: ['/production/shs', '/production/analytical-register'],
  inventory: ['/inventory'],
};
