import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { GlobalFilters } from '@/lib/api';

export function useOutstanding(partyType: string, filters?: GlobalFilters) {
  return useQuery({
    queryKey: ['outstanding', partyType, filters],
    queryFn: () => api.fetchOutstanding(partyType, filters),
  });
}

export function useOutstandingSummary(partyType: string) {
  return useQuery({
    queryKey: ['outstanding-summary', partyType],
    queryFn: () => api.fetchOutstandingSummary(partyType),
  });
}

export function useAlerts(acknowledged?: boolean, thresholdDays?: number) {
  return useQuery({
    queryKey: ['alerts', acknowledged, thresholdDays],
    queryFn: () => api.fetchAlerts(acknowledged, thresholdDays),
  });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, acknowledgedBy }: { id: string; acknowledgedBy: string }) =>
      api.acknowledgeAlert(id, acknowledgedBy),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}
