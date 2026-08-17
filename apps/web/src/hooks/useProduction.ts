import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchProductionProducts, fetchLogsheets, fetchLogsheet,
  createLogsheet, updateLogsheetSection, updateLogsheetStatus,
  bulkApproveLogsheets, fetchAnalyticalRegister, uploadAnalyticalRegister,
  fetchAnalyticalRegisterSummary, AnalyticalRegisterFilters,
} from '@/lib/api';

export function useProductionProducts() {
  return useQuery({
    queryKey: ['production-products'],
    queryFn: () => fetchProductionProducts() as Promise<any[]>,
    staleTime: 10 * 60 * 1000,
  });
}

export function useLogsheets(params?: { productCode?: string; status?: string; dateFrom?: string; dateTo?: string; page?: number }) {
  return useQuery({
    queryKey: ['logsheets', params],
    queryFn: () => fetchLogsheets(params) as Promise<{ data: any[]; total: number; page: number; limit: number }>,
  });
}

export function useLogsheet(id: string | undefined) {
  return useQuery({
    queryKey: ['logsheet', id],
    queryFn: () => fetchLogsheet(id!) as Promise<any>,
    enabled: !!id,
  });
}

export function useCreateLogsheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => createLogsheet(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['logsheets'] }),
  });
}

export function useUpdateLogsheetSection(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ section_key, data }: { section_key: string; data: Record<string, unknown> }) =>
      updateLogsheetSection(id, section_key, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['logsheet', id] }),
  });
}

export function useUpdateLogsheetStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) => updateLogsheetStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['logsheet', id] });
      qc.invalidateQueries({ queryKey: ['logsheets'] });
    },
  });
}

export function useBulkApproveLogsheets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => bulkApproveLogsheets(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['logsheets'] }),
  });
}

export function useAnalyticalRegister(params?: AnalyticalRegisterFilters) {
  return useQuery({
    queryKey: ['analytical-register', params],
    queryFn: () => fetchAnalyticalRegister(params) as Promise<{ data: any[]; total: number; page: number; limit: number }>,
  });
}

export function useAnalyticalRegisterSummary(params?: Omit<AnalyticalRegisterFilters, 'page'>) {
  return useQuery({
    queryKey: ['analytical-register-summary', params],
    queryFn: () => fetchAnalyticalRegisterSummary(params) as Promise<{ totals: any; byDate: any[]; byDateGrade: any[]; byGrade: any[] }>,
  });
}

export function useUploadAnalyticalRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadAnalyticalRegister(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analytical-register'] }),
  });
}
