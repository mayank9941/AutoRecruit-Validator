import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ResultsResponse } from '../types';

export function useResults(profileId?: string, status?: string) {
  const query = status ? `?status=${status}` : '';
  return useQuery<ResultsResponse>({
    queryKey: ['results', profileId, status],
    queryFn: () => api.get(`/jd/profiles/${profileId}/results${query}`),
    enabled: !!profileId,
  });
}
