import { useQuery } from '@tanstack/react-query';
import type { ModelStatus } from '@shared/domain/models';
import { api } from '@renderer/lib/api';
import { keys } from '@renderer/lib/queries';

/** Progress events drive updates; polling is only a fallback while a job is running. */
export function useModels() {
  return useQuery({
    queryKey: keys.models,
    queryFn: () => api.models.list(),
    refetchInterval: (query) =>
      query.state.data?.some((model) => model.state === 'downloading' || model.state === 'verifying')
        ? 5_000
        : false,
  });
}

export function useModelStatuses(): ModelStatus[] {
  return useModels().data ?? [];
}
