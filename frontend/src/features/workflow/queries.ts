import { useQuery } from '@tanstack/react-query';
import type { Trigger } from '@flowstate/api-types';
import { actionsApi, executionsApi, triggersApi } from '../../lib/api';
import { ApiError } from '../../lib/api-client';

// Shared by the canvas, the setup checklist, and the trigger panel so they
// read one cache entry each instead of three copies with three query fns.

export function useTrigger(workflowId: string) {
  return useQuery<Trigger | null>({
    queryKey: ['trigger', workflowId],
    queryFn: async () => {
      try {
        return await triggersApi.get(workflowId);
      } catch (err) {
        // 404 means "no trigger chosen yet" — a normal state, not an error.
        if (err instanceof ApiError && err.statusCode === 404) return null;
        throw err;
      }
    },
    meta: { errorContext: 'Couldn’t load how this workflow starts' },
  });
}

export function useActions(workflowId: string) {
  return useQuery({
    queryKey: ['actions', workflowId],
    queryFn: () => actionsApi.list(workflowId),
    meta: { errorContext: 'Couldn’t load this workflow’s steps' },
  });
}

/** Whether the workflow has ever run — the checklist's "send a test run" step. */
export function useHasRun(workflowId: string) {
  return useQuery({
    queryKey: ['executions', { workflowId, status: undefined, page: 1 }, 'has-run'],
    queryFn: async () => (await executionsApi.list({ page: 1, limit: 1, workflowId })).meta.total > 0,
    meta: { errorContext: 'Couldn’t check this workflow’s runs' },
  });
}
