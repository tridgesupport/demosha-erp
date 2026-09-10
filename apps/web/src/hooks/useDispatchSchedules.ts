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
