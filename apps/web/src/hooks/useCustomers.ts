import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { GlobalFilters } from '@/lib/api';

export function useCustomers(filters?: GlobalFilters, search?: string, page = 1) {
  return useQuery({
    queryKey: ['customers', filters, search, page],
    queryFn: () => api.fetchCustomers(filters, search, page),
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.fetchCustomer(id!),
    enabled: !!id,
  });
}

export function useCustomerOutstanding(id: string | undefined) {
  return useQuery({
    queryKey: ['customer-outstanding', id],
    queryFn: () => api.fetchCustomerOutstanding(id!),
    enabled: !!id,
  });
}

export function useCustomerOrders(id: string | undefined, filters?: GlobalFilters) {
  return useQuery({
    queryKey: ['customer-orders', id, filters],
    queryFn: () => api.fetchCustomerOrders(id!, filters),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createCustomer,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useUpdateCustomer(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.updateCustomer(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer', id] });
    },
  });
}
