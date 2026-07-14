import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useCandidates(profileId) {
  return useQuery({
    queryKey: ["candidates", profileId],
    queryFn: () => api.get(`/jd/profiles/${profileId}/candidates`),
    enabled: !!profileId,
  });
}

export function useUploadCandidates(profileId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ excelFile, masterZipFile }) => {
      const formData = new FormData();
      formData.append("excel_file", excelFile);
      formData.append("master_zip_file", masterZipFile);
      return api.post(`/jd/profiles/${profileId}/candidates/upload`, formData, { isFormData: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates", profileId] });
    },
  });
}
