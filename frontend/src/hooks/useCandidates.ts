import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Candidate, CandidateUploadSummary } from '../types';

export function useCandidates(profileId?: string) {
  return useQuery<Candidate[]>({
    queryKey: ['candidates', profileId],
    queryFn: () => api.get(`/jd/profiles/${profileId}/candidates`),
    enabled: !!profileId,
  });
}

export function useUploadCandidates(profileId?: string) {
  const queryClient = useQueryClient();

  return useMutation<CandidateUploadSummary, Error, { excelFile: File; masterZipFile: File }>({
    mutationFn: ({ excelFile, masterZipFile }) => {
      const formData = new FormData();
      formData.append('excel_file', excelFile);
      formData.append('master_zip_file', masterZipFile);
      return api.post(`/jd/profiles/${profileId}/candidates/upload`, formData, { isFormData: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates', profileId] });
    },
  });
}

export function useResetCandidates(profileId?: string) {
  const queryClient = useQueryClient();

  return useMutation<{ deleted: number }, Error, void>({
    mutationFn: () => api.delete(`/jd/profiles/${profileId}/candidates`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates', profileId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}
