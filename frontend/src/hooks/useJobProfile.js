import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useJobProfile(profileId) {
  return useQuery({
    queryKey: ["job-profile", profileId],
    queryFn: () => api.get(`/jd/profiles/${profileId}`),
    enabled: !!profileId,
  });
}

function useInvalidateProfile(profileId) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["job-profile", profileId] });
    // Criteria counts shown on the list page can change too.
    queryClient.invalidateQueries({ queryKey: ["job-profiles"] });
  };
}

export function useAddCriterion(profileId) {
  const invalidate = useInvalidateProfile(profileId);
  return useMutation({
    mutationFn: (payload) => api.post(`/jd/profiles/${profileId}/criteria`, payload),
    onSuccess: invalidate,
  });
}

export function useUpdateCriterion(profileId) {
  const invalidate = useInvalidateProfile(profileId);
  return useMutation({
    mutationFn: ({ criterionId, payload }) =>
      api.patch(`/jd/profiles/${profileId}/criteria/${criterionId}`, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteCriterion(profileId) {
  const invalidate = useInvalidateProfile(profileId);
  return useMutation({
    mutationFn: (criterionId) => api.delete(`/jd/profiles/${profileId}/criteria/${criterionId}`),
    onSuccess: invalidate,
  });
}
