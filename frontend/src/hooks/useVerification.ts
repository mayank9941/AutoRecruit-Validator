import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CandidateVerificationSummary, BatchVerificationResult } from '../types';

export function useVerification(profileId?: string, candidateId?: string) {
  return useQuery<CandidateVerificationSummary>({
    queryKey: ['verification', profileId, candidateId],
    queryFn: () => api.get(`/jd/profiles/${profileId}/candidates/${candidateId}/verification`),
    enabled: !!profileId && !!candidateId,
  });
}

export function useRunVerification(profileId?: string, candidateId?: string) {
  const queryClient = useQueryClient();
  return useMutation<CandidateVerificationSummary, Error, void>({
    mutationFn: () => api.post(`/jd/profiles/${profileId}/candidates/${candidateId}/verify`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification', profileId, candidateId] });
    },
  });
}

export function useVerificationDecision(profileId?: string, candidateId?: string) {
  const queryClient = useQueryClient();
  return useMutation<any, Error, { verificationId: string; decision: string; notes?: string }>({
    mutationFn: ({ verificationId, decision, notes }) =>
      api.patch(
        `/jd/profiles/${profileId}/candidates/${candidateId}/verification/${verificationId}/decision`,
        { decision, notes }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification', profileId, candidateId] });
    },
  });
}

export function useBatchVerification(profileId?: string) {
  const queryClient = useQueryClient();
  return useMutation<BatchVerificationResult, Error, void>({
    mutationFn: () => api.post(`/jd/profiles/${profileId}/verify-all`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates', profileId] });
    },
  });
}
