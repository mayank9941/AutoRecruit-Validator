import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useJobProfiles() {
  return useQuery({
    queryKey: ["job-profiles"],
    queryFn: () => api.get("/jd/profiles"),
  });
}

export function useUploadJD() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.post("/jd/upload", formData, { isFormData: true });
    },
    onSuccess: () => {
      // The new profile(s) should show up in the list immediately, no
      // manual refresh needed -- matches the "no extra step" requirement.
      queryClient.invalidateQueries({ queryKey: ["job-profiles"] });
    },
  });
}
