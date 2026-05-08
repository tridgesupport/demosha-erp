import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';

export function useProducts(search?: string) {
  return useQuery({
    queryKey: ['products', search],
    queryFn: () => api.fetchProducts(search),
  });
}

export function useVariants(productId: string | undefined) {
  return useQuery({
    queryKey: ['variants', productId],
    queryFn: () => api.fetchVariants(productId!),
    enabled: !!productId,
  });
}

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: api.fetchAgents,
  });
}

export function useFinancialYears() {
  return useQuery({
    queryKey: ['financial-years'],
    queryFn: api.fetchFinancialYears,
  });
}

export function useStates() {
  return useQuery({
    queryKey: ['states'],
    queryFn: api.fetchStates,
  });
}

export function usePackagingTypes() {
  return useQuery({
    queryKey: ['packaging-types'],
    queryFn: api.fetchPackagingTypes,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createProduct,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.updateProduct(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useCreateVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createVariant,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['variants'] }),
  });
}

export function useUpdateVariant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.updateVariant(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['variants'] }),
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createAgent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}

export function useUpdateAgent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.updateAgent(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });
}
