import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';

export function usePurchaseOrders(params?: { fyKey?: number; status?: string[]; page?: number }) {
  return useQuery({
    queryKey: ['purchase-orders', params],
    queryFn: () => api.fetchPurchaseOrders(params),
  });
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => api.fetchPurchaseOrder(id!),
    enabled: !!id,
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createPurchaseOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });
}

export function useUpdatePurchaseOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.updatePurchaseOrder(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-order', id] });
    },
  });
}

export function useUpdatePurchaseOrderStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ status, grn_number }: { status: string; grn_number?: string }) =>
      api.updatePurchaseOrderStatus(id, status, grn_number),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-order', id] });
    },
  });
}
