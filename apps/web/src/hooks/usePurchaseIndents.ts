import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';

export function usePurchaseIndents(params?: { fyKey?: number; status?: string[]; page?: number }) {
  return useQuery({
    queryKey: ['purchase-indents', params],
    queryFn: () => api.fetchPurchaseIndents(params),
  });
}

export function usePurchaseIndent(id: string | undefined) {
  return useQuery({
    queryKey: ['purchase-indent', id],
    queryFn: () => api.fetchPurchaseIndent(id!),
    enabled: !!id,
  });
}

export function useCreatePurchaseIndent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createPurchaseIndent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-indents'] }),
  });
}

export function useUpdatePurchaseIndent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.updatePurchaseIndent(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-indents'] });
      qc.invalidateQueries({ queryKey: ['purchase-indent', id] });
    },
  });
}

export function useUpdatePurchaseIndentStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) => api.updatePurchaseIndentStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-indents'] });
      qc.invalidateQueries({ queryKey: ['purchase-indent', id] });
    },
  });
}
