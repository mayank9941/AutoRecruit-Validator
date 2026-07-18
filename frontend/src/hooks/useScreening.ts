import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
// useQueryClient is used by useStartScreening and useEvaluateCandidate
import { api } from '../lib/api';
import type { CandidateEvaluationResult, ScreeningRun } from '../types';

export function useStartScreening(profileId?: string) {
  const queryClient = useQueryClient();

  return useMutation<ScreeningRun, Error, boolean | undefined>({
    mutationFn: (force?: boolean) =>
      api.post(`/jd/profiles/${profileId}/screen${force ? '?force=true' : ''}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates', profileId] });
    },
  });
}

/**
 * Polls a screening run's progress every 1.5s while it's still running,
 * and stops polling once it's completed. Pass `runId: null` to disable.
 *
 * Invalidation after completion is handled by a useEffect in the
 * consuming component — NOT here. select() runs on every render and is
 * a data transformer, not a side-effect hook; putting invalidateQueries
 * inside it causes it to fire repeatedly and unreliably.
 */
export function useScreeningRun(profileId?: string, runId?: string | null) {
  return useQuery<ScreeningRun>({
    queryKey: ['screening-run', profileId, runId],
    queryFn: () => api.get(`/jd/profiles/${profileId}/screening-runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 1500 : false),
  });
}

export function useEvaluateCandidate(profileId?: string) {
  const queryClient = useQueryClient();
  return useMutation<CandidateEvaluationResult, Error, string>({
    mutationFn: (candidateId: string) =>
      api.post(`/jd/profiles/${profileId}/candidates/${candidateId}/evaluate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates', profileId] });
      queryClient.invalidateQueries({ queryKey: ['candidate-review', profileId] });
    },
  });
}
