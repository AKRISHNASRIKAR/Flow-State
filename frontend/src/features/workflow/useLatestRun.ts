'use client';

import { useQuery } from '@tanstack/react-query';
import type { ActionExecution, ExecutionDetail, ExecutionSummary } from '@flowstate/api-types';
import type { RunTone } from '../../components/flow-visuals';
import { executionsApi } from '../../lib/api';
import { formatDuration } from '../../lib/format';

// The engine retries a failing step up to 3 attempts (per-step on Cloudflare,
// resumed-from-step on NestJS) — a FAILED attempt below this is "retrying",
// not "failed", while the run is still going.
const MAX_ATTEMPTS = 3;
// Live while a run is in flight: fast enough to watch steps light up in turn.
const LIVE_POLL_MS = 1200;

const inFlight = (status: string | undefined) => status === 'PENDING' || status === 'RUNNING';

export interface StepRunState {
  tone: RunTone;
  text: string;
  attempts: number;
}

export interface LatestRun {
  summary: ExecutionSummary | null;
  detail: ExecutionDetail | undefined;
  total: number;
  live: boolean;
  /** Per action id: how that step did in the latest run. */
  steps: Map<string, StepRunState>;
  /** The step running right now (for the packet on its incoming connection). */
  runningActionId: string | null;
}

function stepState(attempts: ActionExecution[], runLive: boolean): StepRunState {
  const last = attempts[attempts.length - 1];
  const n = attempts.length;
  switch (last.status) {
    case 'RUNNING':
      return { tone: 'running', text: n > 1 ? `attempt ${n} of ${MAX_ATTEMPTS}` : 'running', attempts: n };
    case 'PENDING':
      return { tone: 'queued', text: 'queued', attempts: n };
    case 'SUCCEEDED': {
      const d = formatDuration(last.startedAt, last.finishedAt);
      return { tone: n > 1 ? 'retry' : 'ok', text: n > 1 ? `${d} · try ${n}` : d, attempts: n };
    }
    case 'FAILED':
      return runLive && n < MAX_ATTEMPTS
        ? { tone: 'retry', text: `retrying · ${n + 1} of ${MAX_ATTEMPTS}`, attempts: n }
        : { tone: 'fail', text: n > 1 ? `failed · ${n} tries` : 'failed', attempts: n };
    default:
      return { tone: 'idle', text: 'cancelled', attempts: n };
  }
}

/**
 * The workflow's most recent run, polled quickly while it's in flight, and
 * mapped onto the canvas: each node shows how its step did last time, and the
 * running step is highlighted as it runs.
 */
export function useLatestRun(workflowId: string): LatestRun {
  const list = useQuery({
    // Under the ['executions'] prefix, so starting a test run (which
    // invalidates that prefix) wakes this up immediately.
    queryKey: ['executions', { workflowId, status: undefined, page: 1 }, 'latest'],
    queryFn: () => executionsApi.list({ page: 1, limit: 1, workflowId }),
    refetchInterval: (q) => (inFlight(q.state.data?.data[0]?.status) ? LIVE_POLL_MS : false),
    meta: { silent: true },
  });
  const summary = list.data?.data[0] ?? null;

  const detail = useQuery({
    queryKey: ['execution', summary?.id],
    queryFn: () => executionsApi.get(summary!.id),
    enabled: !!summary,
    refetchInterval: (q) => (inFlight(q.state.data?.status ?? summary?.status) ? LIVE_POLL_MS : false),
    meta: { silent: true },
  });

  const live = inFlight(detail.data?.status ?? summary?.status);
  const byAction = new Map<string, ActionExecution[]>();
  for (const ae of [...(detail.data?.actionExecutions ?? [])].sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''))) {
    byAction.set(ae.actionId, [...(byAction.get(ae.actionId) ?? []), ae]);
  }
  const steps = new Map<string, StepRunState>();
  let runningActionId: string | null = null;
  for (const [actionId, attempts] of byAction) {
    const state = stepState(attempts, live);
    steps.set(actionId, state);
    if (state.tone === 'running') runningActionId = actionId;
  }

  return { summary, detail: detail.data, total: list.data?.meta.total ?? 0, live, steps, runningActionId };
}
