import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchProductionProducts, fetchLogsheets, fetchLogsheet,
  createLogsheet, updateLogsheetSection, updateLogsheetStatus,
  bulkApproveLogsheets,
  fetchSfsAnalyticalRegister, uploadSfsAnalyticalReport, fetchSfsUploadStatus,
  SfsAnalyticalRegisterFilters,
  fetchProductionReport, uploadProductionReport, fetchProductionUploadStatus,
  ProductReportKey, ProductionReportFilters,
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

// ─── SFS Analytical Report ─────────────────────────────────────────────────────

export function useSfsAnalyticalRegister(params?: SfsAnalyticalRegisterFilters) {
  return useQuery({
    queryKey: ['sfs-analytical-register', params],
    queryFn: () => fetchSfsAnalyticalRegister(params) as Promise<{ data: any[]; total: number; page: number; limit: number }>,
  });
}

export function useUploadSfsAnalyticalReport() {
  return useMutation({
    mutationFn: (file: File) => uploadSfsAnalyticalReport(file),
  });
}

// Polls an upload's extraction status every 4s while it's still pending —
// extraction runs as a GitHub Actions job (see production-extraction/), not
// inline, so this is how the UI finds out when it's actually done.
export function useSfsUploadStatus(uploadId: string | null) {
  return useQuery({
    queryKey: ['sfs-upload-status', uploadId],
    queryFn: () => fetchSfsUploadStatus(uploadId!) as Promise<{ status: string; rows_upserted: number | null; error_message: string | null }>,
    enabled: !!uploadId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' || status === 'processing' ? 4000 : false;
    },
  });
}

// ─── SHS / ZFS / ZnO daily reports ─────────────────────────────────────────────

export function useProductionReport(product: ProductReportKey, params?: ProductionReportFilters) {
  return useQuery({
    queryKey: ['production-report', product, params],
    queryFn: () => fetchProductionReport(product, params) as Promise<{ data: any[]; total: number; page: number; limit: number }>,
  });
}

export function useUploadProductionReport(product: ProductReportKey) {
  return useMutation({
    mutationFn: (file: File) => uploadProductionReport(product, file),
  });
}

// Polls the extraction job's status every 4s while it is still pending (see useSfsUploadStatus).
export function useProductionUploadStatus(product: ProductReportKey, uploadId: string | null) {
  return useQuery({
    queryKey: ['production-upload-status', product, uploadId],
    queryFn: () => fetchProductionUploadStatus(product, uploadId!) as Promise<{ status: string; rows_upserted: number | null; error_message: string | null }>,
    enabled: !!uploadId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' || status === 'processing' ? 4000 : false;
    },
  });
}
