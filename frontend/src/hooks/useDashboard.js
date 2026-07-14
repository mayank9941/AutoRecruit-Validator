import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => api.get("/dashboard/summary"),
  });
}
