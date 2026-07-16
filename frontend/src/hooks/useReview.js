import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useCandidateReview(profileId, candidateId) {
  return useQuery({
    queryKey: ["candidate-review", profileId, candidateId],
    queryFn: () => api.get(`/jd/profiles/${profileId}/candidates/${candidateId}/review`),
    enabled: !!profileId && !!candidateId,
  });
}

export function useOverrideStatus(profileId, candidateId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => api.patch(`/jd/profiles/${profileId}/candidates/${candidateId}/override`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-review", profileId, candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidates", profileId] });
      queryClient.invalidateQueries({ queryKey: ["results", profileId] });
    },
  });
}
