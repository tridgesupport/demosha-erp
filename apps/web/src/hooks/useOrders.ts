import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { GlobalFilters } from '@/lib/api';

export function useOrders(filters?: GlobalFilters, page = 1) {
  return useQuery({
    queryKey: ['orders', filters, page],
    queryFn: () => api.fetchOrders(filters, page),
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => api.fetchOrder(id!),
    enabled: !!id,
  });
}

export function useNextPiNumber(fyKey: number | null) {
  return useQuery({
    queryKey: ['pi-next-number', fyKey],
    queryFn: () => api.fetchNextPiNumber(fyKey!),
    enabled: fyKey != null,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useUpdateOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.updateOrder(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order', id] });
    },
  });
}

export function useUpdateOrderStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) => api.updateOrderStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order', id] });
    },
  });
}

export function useReviseOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.reviseOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}
