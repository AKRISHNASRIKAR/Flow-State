import type {
  Action,
  AuthTokensResponse,
  CreateActionRequest,
  CreateWorkflowRequest,
  ExecutionDetail,
  ExecutionStats,
  ExecutionStatus,
  ExecutionSummary,
  FailedJob,
  FireTriggerRequest,
  GoogleExchangeRequest,
  HealthResponse,
  Paginated,
  PollingEvent,
  Trigger,
  UpdateActionRequest,
  UpdateWorkflowRequest,
  UpsertTriggerRequest,
  WebhookEvent,
  Workflow,
} from '@flowstate/api-types';
import { API_URL, api } from './api-client';
import { createSignInNonce, getStoredRefreshToken, takeSignInNonce, useAuthStore } from './auth-store';

export const authApi = {
  /**
   * Full-page navigation to the API, which redirects to Google. The nonce
   * stays in this tab's sessionStorage and must come back with the handoff
   * code — a sign-in link started anywhere else can't be completed here.
   */
  startGoogleSignIn(returnTo: string) {
    const nonce = createSignInNonce();
    const url = new URL(`${API_URL}/auth/google/start`);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('returnTo', returnTo);
    window.location.assign(url.toString());
  },
  async completeGoogleSignIn(code: string) {
    const nonce = takeSignInNonce();
    if (nonce === null) {
      throw new Error('This sign-in was started in a different tab or has already been used.');
    }
    const body: GoogleExchangeRequest = { code, nonce };
    const tokens = await api.public.post<AuthTokensResponse>('/auth/google/exchange', body);
    useAuthStore.getState().setTokens(tokens.accessToken, tokens.refreshToken);
    return tokens;
  },
  async logout() {
    const refreshToken = getStoredRefreshToken();
    try {
      if (refreshToken !== null) {
        await api.post<{ success: boolean }>('/auth/logout', { refreshToken });
      }
    } finally {
      useAuthStore.getState().clear();
    }
  },
};

export const workflowsApi = {
  list: (page: number, limit = 12) =>
    api.get<Paginated<Workflow>>('/workflows', { page, limit }),
  get: (id: string) => api.get<Workflow>(`/workflows/${id}`),
  create: (body: CreateWorkflowRequest) => api.post<Workflow>('/workflows', body),
  update: (id: string, body: UpdateWorkflowRequest) =>
    api.patch<Workflow>(`/workflows/${id}`, body),
  remove: (id: string) => api.delete<Workflow>(`/workflows/${id}`),
  pause: (id: string) => api.post<Workflow>(`/workflows/${id}/pause`),
  resume: (id: string) => api.post<Workflow>(`/workflows/${id}/resume`),
  clone: (id: string) => api.post<Workflow>(`/workflows/${id}/clone`),
  pollHistory: (id: string) => api.get<PollingEvent[]>(`/workflows/${id}/poll-history`),
};

export const actionsApi = {
  list: (workflowId: string) => api.get<Action[]>(`/workflows/${workflowId}/actions`),
  create: (workflowId: string, body: CreateActionRequest) =>
    api.post<Action>(`/workflows/${workflowId}/actions`, body),
  update: (workflowId: string, actionId: string, body: UpdateActionRequest) =>
    api.patch<Action>(`/workflows/${workflowId}/actions/${actionId}`, body),
  remove: (workflowId: string, actionId: string) =>
    api.delete<{ deleted: boolean }>(`/workflows/${workflowId}/actions/${actionId}`),
  reorder: (workflowId: string, orderedIds: string[]) =>
    api.post<Action[]>(`/workflows/${workflowId}/actions/reorder`, { orderedIds }),
};

export const triggersApi = {
  get: (workflowId: string) => api.get<Trigger>(`/workflows/${workflowId}/trigger`),
  upsert: (workflowId: string, body: UpsertTriggerRequest) =>
    api.post<Trigger>(`/workflows/${workflowId}/trigger`, body),
  remove: (workflowId: string) => api.delete<{ deleted: boolean }>(`/workflows/${workflowId}/trigger`),
  fire: (workflowId: string, body: FireTriggerRequest) =>
    api.post<{ fired: boolean; eventId: string }>(`/workflows/${workflowId}/trigger/fire`, body),
  webhookEvents: (workflowId: string, page = 1, limit = 20) =>
    api.get<Paginated<WebhookEvent>>(`/workflows/${workflowId}/webhook-events`, { page, limit }),
};

export const executionsApi = {
  list: (params: { page: number; limit?: number; status?: ExecutionStatus; workflowId?: string }) =>
    api.get<Paginated<ExecutionSummary>>('/executions', {
      page: params.page,
      limit: params.limit ?? 20,
      status: params.status,
      workflowId: params.workflowId,
    }),
  stats: () => api.get<ExecutionStats>('/executions/stats'),
  get: (id: string) => api.get<ExecutionDetail>(`/executions/${id}`),
  cancel: (id: string) => api.post<ExecutionDetail>(`/executions/${id}/cancel`),
};

export const healthApi = {
  get: () => api.public.get<HealthResponse>('/health'),
};

export const adminApi = {
  failedJobs: (secret: string) =>
    api.get<FailedJob[]>('/admin/failed-jobs', undefined, { 'X-Admin-Secret': secret }),
  retryFailedJob: (secret: string, jobId: string) =>
    api.post<{ requeued: boolean }>(`/admin/failed-jobs/${jobId}/retry`, undefined, {
      'X-Admin-Secret': secret,
    }),
};

export function webhookUrlFor(workflowId: string, apiUrl: string): string {
  return `${apiUrl}/webhooks/${workflowId}`;
}
