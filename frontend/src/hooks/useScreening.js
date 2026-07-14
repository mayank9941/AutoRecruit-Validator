import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useStartScreening(profileId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (force = false) => api.post(`/jd/profiles/${profileId}/screen${force ? "?force=true" : ""}`),
    onSuccess: () => {
      // Candidate statuses will change once the run completes -- this
      // invalidation mostly matters for the *next* poll-driven refetch,
      // but doesn't hurt to trigger here too.
      queryClient.invalidateQueries({ queryKey: ["candidates", profileId] });
    },
  });
}

/**
 * Polls a screening run's progress every 1.5s while it's still running,
 * and stops polling once it's completed. Pass `runId: null` to disable.
 */
export function useScreeningRun(profileId, runId) {
  return useQuery({
    queryKey: ["screening-run", profileId, runId],
    queryFn: () => api.get(`/jd/profiles/${profileId}/screening-runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 1500 : false),
  });
}
