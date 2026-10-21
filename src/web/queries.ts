import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WebSettingsPatch } from '@shared/web/api';
import { api } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

export const keys = {
  status: ['web-status'] as const,
  settings: ['web-settings'] as const,
};

export function useStatus() {
  return useQuery({
    queryKey: keys.status,
    queryFn: () => api.status(),
    refetchInterval: 2_000,
    retry: false,
  });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: () => api.settings() });
}

export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: WebSettingsPatch) => api.updateSettings(patch),
    onSuccess: (settings) => client.setQueryData(keys.settings, settings),
  });
}
