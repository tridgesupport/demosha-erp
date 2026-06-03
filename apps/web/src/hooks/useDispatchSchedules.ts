import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';

export function useDispatchSchedules(page = 1) {
  return useQuery({
    queryKey: ['dispatch-schedules', page],
    queryFn: () => api.fetchDispatchSchedules(page),
  });
}

export function useDispatchSchedule(id: string | undefined) {
  return useQuery({
    queryKey: ['dispatch-schedule', id],
    queryFn: () => api.fetchDispatchSchedule(id!),
    enabled: !!id,
  });
}

export function useEligibleOrders() {
  return useQuery({
    queryKey: ['dispatch-eligible-orders'],
    queryFn: api.fetchEligibleOrders,
  });
}

export function useCreateDispatchSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createDispatchSchedule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatch-schedules'] }),
  });
}

export function useUpdateDispatchSchedule(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.updateDispatchSchedule(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatch-schedules'] });
      qc.invalidateQueries({ queryKey: ['dispatch-schedule', id] });
    },
  });
}

export function useUpdateDispatchScheduleLine(scheduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, body }: { lineId: string; body: unknown }) =>
      api.updateDispatchScheduleLine(scheduleId, lineId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatch-schedule', scheduleId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useDeleteDispatchSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteDispatchSchedule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatch-schedules'] }),
  });
}
