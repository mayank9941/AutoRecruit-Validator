import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useResults(profileId, status) {
  const query = status ? `?status=${status}` : "";
  return useQuery({
    queryKey: ["results", profileId, status],
    queryFn: () => api.get(`/jd/profiles/${profileId}/results${query}`),
    enabled: !!profileId,
  });
}
