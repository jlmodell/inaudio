import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ModelId } from '@shared/domain/models';
import type { Settings, SettingsPatch } from '@shared/domain/settings';
import type { UpdateStatus, ReleaseNotesResult } from '@shared/domain/update';
import { api } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1, networkMode: 'always' },
    mutations: { networkMode: 'always' },
  },
});

export const keys = {
  settings: ['settings'] as const,
  status: ['status'] as const,
  models: ['models'] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: () => withTimeout(api.settings.get(), 10_000, 'Settings request timed out'),
    staleTime: Infinity,
  });
}

export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => api.settings.update(patch),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: keys.settings });
      const previous = client.getQueryData<Settings>(keys.settings);
      if (previous) client.setQueryData(keys.settings, deepMerge(previous, patch));
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) client.setQueryData(keys.settings, context.previous);
    },
    onSuccess: (next) => client.setQueryData(keys.settings, next),
  });
}

export function useSystemStatus() {
  return useQuery({ queryKey: keys.status, queryFn: () => api.system.status(), refetchInterval: 15_000 });
}

export function useUpdateStatus() {
  return useQuery<UpdateStatus>({
    queryKey: ['update'],
    queryFn: () => api.updates.status(),
    refetchInterval: 10_000,
  });
}

/**
 * Release notes from GitHub. Fetched when a page that shows them opens (at most every five
 * minutes, in main), and only while automatic updates are on unless `load()` is pressed.
 */
export function useReleaseNotes(enabled = true) {
  const client = useQueryClient();
  const query = useQuery<ReleaseNotesResult>({
    queryKey: ['release-notes'],
    queryFn: () => api.updates.releaseNotes(false),
    enabled,
    // Live: asked for on every open and focus, and every few minutes while shown. Main answers
    // from its 30-second cache or with a conditional request, so this stays cheap.
    staleTime: 10_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: enabled ? 5 * 60_000 : false,
  });
  const load = useMutation({
    mutationFn: () => api.updates.releaseNotes(true),
    onSuccess: (result) => client.setQueryData(['release-notes'], result),
  });
  return { data: query.data, isLoading: query.isLoading, isFetching: query.isFetching, load };
}

export function useUpdateActions() {
  const client = useQueryClient();
  const refresh = (status: UpdateStatus) => {
    client.setQueryData(['update'], status);
    void client.invalidateQueries({ queryKey: keys.status });
  };
  return {
    check: useMutation({ mutationFn: () => api.updates.check(), onSuccess: refresh }),
    download: useMutation({ mutationFn: () => api.updates.download(), onSuccess: refresh }),
    install: useMutation({ mutationFn: () => api.updates.install() }),
  };
}

export function useModelAction() {
  const client = useQueryClient();
  const refresh = () => Promise.all([
    client.invalidateQueries({ queryKey: keys.status }),
    client.invalidateQueries({ queryKey: keys.models }),
    client.invalidateQueries({ queryKey: keys.settings }),
  ]);
  return {
    download: useMutation({ mutationFn: (id: ModelId) => api.models.download(id), onSettled: refresh }),
    cancel: useMutation({ mutationFn: (id: ModelId) => api.models.cancel(id), onSettled: refresh }),
    remove: useMutation({ mutationFn: (id: ModelId) => api.models.remove(id), onSettled: refresh }),
    load: useMutation({ mutationFn: (id: ModelId) => api.models.load(id), onSettled: refresh }),
    unload: useMutation({ mutationFn: (id: ModelId) => api.models.unload(id), onSettled: refresh }),
    activate: useMutation({ mutationFn: (id: ModelId) => api.models.activate(id), onSettled: refresh }),
    verify: useMutation({ mutationFn: (id: ModelId) => api.models.verify(id), onSettled: refresh }),
    reveal: useMutation({ mutationFn: (id: ModelId) => api.models.reveal(id) }),
  };
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return patch as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = deepMerge(out[key], value);
  }
  return out as T;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
