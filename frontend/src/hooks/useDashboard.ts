import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { DashboardSummary } from '../types';

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get('/dashboard/summary'),
  });
}
