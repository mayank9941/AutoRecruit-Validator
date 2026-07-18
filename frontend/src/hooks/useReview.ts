import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CandidateReviewDetail, OverrideRequest } from '../types';

export function useCandidateReview(profileId?: string, candidateId?: string) {
  return useQuery<CandidateReviewDetail>({
    queryKey: ['candidate-review', profileId, candidateId],
    queryFn: () => api.get(`/jd/profiles/${profileId}/candidates/${candidateId}/review`),
    enabled: !!profileId && !!candidateId,
  });
}

export function useOverrideStatus(profileId?: string, candidateId?: string) {
  const queryClient = useQueryClient();

  return useMutation<CandidateReviewDetail, Error, OverrideRequest>({
    mutationFn: (payload) =>
      api.patch(`/jd/profiles/${profileId}/candidates/${candidateId}/override`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-review', profileId, candidateId] });
      queryClient.invalidateQueries({ queryKey: ['candidates', profileId] });
      queryClient.invalidateQueries({ queryKey: ['results', profileId] });
    },
  });
}
