import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { AnalyticsParams } from '@/lib/api';

// Refresh the materialized views, then invalidate every analytics query so
// the whole tab re-fetches with the new data — no manual page reload needed.
export const useRefreshAnalyticsData = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.refreshAnalyticsData(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analytics'] }),
  });
};

// Sales
export const useSalesSummary = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'sales', 'summary', p], queryFn: () => api.fetchSalesSummary(p) });
export const useSalesTrend = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'sales', 'trend', p], queryFn: () => api.fetchSalesTrend(p) });
export const useSalesBreakdown = (by: string, p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'sales', 'breakdown', by, p], queryFn: () => api.fetchSalesBreakdown(by, p) });
export const useSalesRows = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'sales', 'rows', p], queryFn: () => api.fetchSalesRows(p) });

// Purchase
export const usePurchaseSummary = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'purchase', 'summary', p], queryFn: () => api.fetchPurchaseSummary(p) });
export const usePurchaseTrend = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'purchase', 'trend', p], queryFn: () => api.fetchPurchaseTrend(p) });
export const usePurchaseBreakdown = (by: string, p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'purchase', 'breakdown', by, p], queryFn: () => api.fetchPurchaseBreakdown(by, p) });
export const usePurchaseRows = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'purchase', 'rows', p], queryFn: () => api.fetchPurchaseRows(p) });

// Outstanding
export const useArSummary = () =>
  useQuery({ queryKey: ['analytics', 'ar', 'summary'], queryFn: () => api.fetchArSummary() });
export const useArBills = (customer?: string) =>
  useQuery({ queryKey: ['analytics', 'ar', 'bills', customer], queryFn: () => api.fetchArBills(customer), enabled: !!customer });
export const useApSummary = () =>
  useQuery({ queryKey: ['analytics', 'ap', 'summary'], queryFn: () => api.fetchApSummary() });
export const useApBills = (vendor?: string) =>
  useQuery({ queryKey: ['analytics', 'ap', 'bills', vendor], queryFn: () => api.fetchApBills(vendor), enabled: !!vendor });

// Profit & Loss
export const usePnlSummary = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'pnl', 'summary', p], queryFn: () => api.fetchPnlSummary(p) });
export const usePnlTrend = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'pnl', 'trend', p], queryFn: () => api.fetchPnlTrend(p) });
export const usePnlBreakdown = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'pnl', 'breakdown', p], queryFn: () => api.fetchPnlBreakdown(p), enabled: !!p?.period });

// Balance Sheet
export const useBalanceSheetCurrent = () =>
  useQuery({ queryKey: ['analytics', 'balance-sheet', 'current'], queryFn: () => api.fetchBalanceSheetCurrent() });
export const useBalanceSheetTrend = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'balance-sheet', 'trend', p], queryFn: () => api.fetchBalanceSheetTrend(p), enabled: !!p?.primaryGroup });
export const useBalanceSheetBreakdown = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'balance-sheet', 'breakdown', p], queryFn: () => api.fetchBalanceSheetBreakdown(p) });

// Cash Flow
export const useCashFlowSummary = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'cashflow', 'summary', p], queryFn: () => api.fetchCashFlowSummary(p), enabled: !!p?.period });
export const useCashFlowTrend = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'cashflow', 'trend', p], queryFn: () => api.fetchCashFlowTrend(p) });

// Inventory
export const useInventoryCurrent = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'inventory', 'current', p], queryFn: () => api.fetchInventoryCurrent(p) });
export const useInventoryByGroup = () =>
  useQuery({ queryKey: ['analytics', 'inventory', 'by-group'], queryFn: () => api.fetchInventoryByGroup() });
export const useInventoryTrend = (p?: AnalyticsParams) =>
  useQuery({ queryKey: ['analytics', 'inventory', 'trend', p], queryFn: () => api.fetchInventoryTrend(p), enabled: !!p?.item });

// Shared
export const useAnalyticsFilterOptions = (dimension: string) =>
  useQuery({ queryKey: ['analytics', 'filters', dimension], queryFn: () => api.fetchAnalyticsFilterOptions(dimension), staleTime: 5 * 60 * 1000 });
export const useAnalyticsPeriods = () =>
  useQuery({ queryKey: ['analytics', 'periods'], queryFn: () => api.fetchAnalyticsPeriods(), staleTime: 5 * 60 * 1000 });
