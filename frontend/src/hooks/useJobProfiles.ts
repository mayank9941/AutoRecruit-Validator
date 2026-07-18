import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { JDUploadResponse, JobProfile } from '../types';

export function useJobProfiles() {
  return useQuery<JobProfile[]>({
    queryKey: ['job-profiles'],
    queryFn: () => api.get('/jd/profiles'),
  });
}

export function useUploadJD() {
  const queryClient = useQueryClient();

  return useMutation<JDUploadResponse, Error, File>({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post('/jd/upload', formData, { isFormData: true });
    },
    onSuccess: () => {
      // The new profile(s) should show up in the list immediately, no
      // manual refresh needed.
      queryClient.invalidateQueries({ queryKey: ['job-profiles'] });
    },
  });
}
