import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';

export function useDispatchSchedule() {
  return useQuery({
    queryKey: ['dispatch-schedule'],
    queryFn: api.fetchDispatchSchedule,
  });
}

export function useUpdateDispatchScheduleOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: unknown }) =>
      api.updateDispatchScheduleOrder(orderId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatch-schedule'] }),
  });
}

export function useDispatchScheduleSplits(orderId: string | undefined) {
  return useQuery({
    queryKey: ['dispatch-schedule-splits', orderId],
    queryFn: () => api.fetchDispatchScheduleSplits(orderId!),
    enabled: !!orderId,
  });
}

export function useCreateDispatchScheduleSplit(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.createDispatchScheduleSplit(orderId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatch-schedule-splits', orderId] });
      qc.invalidateQueries({ queryKey: ['dispatch-schedule'] });
    },
  });
}

export function useUpdateDispatchScheduleSplit(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ splitId, body }: { splitId: string; body: unknown }) =>
      api.updateDispatchScheduleSplit(orderId, splitId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatch-schedule-splits', orderId] }),
  });
}

export function useDeleteDispatchScheduleSplit(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (splitId: string) => api.deleteDispatchScheduleSplit(orderId, splitId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatch-schedule-splits', orderId] });
      qc.invalidateQueries({ queryKey: ['dispatch-schedule'] });
    },
  });
}
