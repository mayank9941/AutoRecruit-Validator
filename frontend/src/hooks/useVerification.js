import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useVerification(profileId, candidateId) {
  return useQuery({
    queryKey: ["verification", profileId, candidateId],
    queryFn: () => api.get(`/jd/profiles/${profileId}/candidates/${candidateId}/verification`),
    enabled: !!profileId && !!candidateId,
  });
}

export function useRunVerification(profileId, candidateId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/jd/profiles/${profileId}/candidates/${candidateId}/verify`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["verification", profileId, candidateId] });
    },
  });
}

export function useVerificationDecision(profileId, candidateId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ verificationId, decision, notes }) =>
      api.patch(`/jd/profiles/${profileId}/candidates/${candidateId}/verification/${verificationId}/decision`, {
        decision,
        notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["verification", profileId, candidateId] });
    },
  });
}
