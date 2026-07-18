import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Criterion, CriterionCreate, CriterionUpdate, JobProfile } from '../types';

export function useJobProfile(profileId?: string) {
  return useQuery<JobProfile>({
    queryKey: ['job-profile', profileId],
    queryFn: () => api.get(`/jd/profiles/${profileId}`),
    enabled: !!profileId,
  });
}

function useInvalidateProfile(profileId?: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['job-profile', profileId] });
    // Criteria counts shown on the list page can change too.
    queryClient.invalidateQueries({ queryKey: ['job-profiles'] });
  };
}

export function useAddCriterion(profileId?: string) {
  const invalidate = useInvalidateProfile(profileId);
  return useMutation<Criterion, Error, CriterionCreate>({
    mutationFn: (payload) => api.post(`/jd/profiles/${profileId}/criteria`, payload),
    onSuccess: invalidate,
  });
}

export function useUpdateCriterion(profileId?: string) {
  const invalidate = useInvalidateProfile(profileId);
  return useMutation<Criterion, Error, { criterionId: string; payload: CriterionUpdate }>({
    mutationFn: ({ criterionId, payload }) =>
      api.patch(`/jd/profiles/${profileId}/criteria/${criterionId}`, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteCriterion(profileId?: string) {
  const invalidate = useInvalidateProfile(profileId);
  return useMutation<null, Error, string>({
    mutationFn: (criterionId) => api.delete(`/jd/profiles/${profileId}/criteria/${criterionId}`),
    onSuccess: invalidate,
  });
}
