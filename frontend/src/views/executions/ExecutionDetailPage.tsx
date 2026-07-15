'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Action, ActionExecution } from '@flowstate/api-types';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ExecutionStatusBadge } from '../../components/StatusBadge';
import { Button, EmptyState, Spinner } from '../../components/ui';
import { ACTION_META } from '../../features/flow/action-meta';
import { actionsApi, executionsApi } from '../../lib/api';
import { ApiError } from '../../lib/api-client';
import { formatDateTime, formatDuration, formatJson } from '../../lib/format';
import { toast } from '../../lib/toast';

export function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const executionId = id;
  const queryClient = useQueryClient();

  const { data: execution, isPending, isError } = useQuery({
    queryKey: ['execution', executionId],
    queryFn: () => executionsApi.get(executionId),
    // Keep the timeline live while the run is still in flight.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PENDING' || status === 'RUNNING' ? 2000 : false;
    },
  });

  const { data: actions } = useQuery({
    queryKey: ['actions', execution?.workflowId],
    queryFn: () => actionsApi.list(execution!.workflowId),
    enabled: !!execution?.workflowId,
  });

  const cancel = useMutation({
    mutationFn: () => executionsApi.cancel(executionId),
    onSuccess: () => {
      toast.success('Execution cancelled');
      void queryClient.invalidateQueries({ queryKey: ['execution', executionId] });
      void queryClient.invalidateQueries({ queryKey: ['executions'] });
    },
    onError: (err) => {
      // Real race, observed in backend testing: a worker can claim the job in
      // <200ms, at which point cancel returns 400. That's information, not an
      // error state.
      if (err instanceof ApiError && err.statusCode === 400) {
        toast.info('This run already started — only PENDING executions can be cancelled.');
        void queryClient.invalidateQueries({ queryKey: ['execution', executionId] });
      } else {
        toast.error(err.message);
      }
    },
  });

  if (isPending) return <Spinner label="Loading execution…" />;
  if (isError || !execution) {
    return <EmptyState title="Execution not found" body="It may belong to another account, or the ID is wrong." />;
  }

  const attempts = groupIntoAttempts(execution.actionExecutions);
  const actionById = new Map((actions ?? []).map((a) => [a.id, a]));

  return (
    <div>
      <div className="mb-1 text-sm">
        <Link href="/executions" className="text-indigo-600 hover:text-indigo-500">
          ← All executions
        </Link>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">
          {execution.workflowName ?? 'Execution'}{' '}
          <span className="font-mono text-sm font-normal text-slate-400">{execution.id.slice(0, 8)}</span>
        </h1>
        <ExecutionStatusBadge status={execution.status} />
        {execution.status === 'PENDING' && (
          <Button size="sm" variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            Cancel run
          </Button>
        )}
        <Link
          href={`/workflows/${execution.workflowId}?tab=runs`}
          className="ml-auto text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          View workflow →
        </Link>
      </div>

      <div className="mb-6 grid gap-4 rounded-xl bg-white p-5 text-sm shadow-sm ring-1 ring-slate-200 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Started</p>
          <p className="mt-0.5 text-slate-700">{formatDateTime(execution.startedAt)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Finished</p>
          <p className="mt-0.5 text-slate-700">{formatDateTime(execution.finishedAt)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Duration</p>
          <p className="mt-0.5 tabular-nums text-slate-700">{formatDuration(execution.startedAt, execution.finishedAt)}</p>
        </div>
        {execution.error && (
          <div className="sm:col-span-3">
            <p className="text-xs font-medium uppercase tracking-wide text-red-400">Error</p>
            <p className="mt-0.5 whitespace-pre-wrap font-mono text-xs text-red-700">{execution.error}</p>
          </div>
        )}
      </div>

      {attempts.length === 0 ? (
        <EmptyState title="No action steps recorded" body="This run hasn't executed any actions yet." />
      ) : (
        <div className="space-y-6">
          {attempts.map((attempt, i) => (
            <section key={i}>
              {attempts.length > 1 && (
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Attempt {i + 1} of {attempts.length}
                  {i < attempts.length - 1 && ' — retried from the first action'}
                </h2>
              )}
              <ol className="space-y-3">
                {attempt.map((ae, stepIndex) => (
                  <ActionStep key={ae.id} actionExecution={ae} action={actionById.get(ae.actionId)} index={stepIndex} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The engine is at-least-once: a retried execution re-runs from action #1, so
 * actionExecutions can hold several entries for the same actionId (one per
 * attempt). Group into attempts — a repeat of an already-seen actionId starts
 * the next attempt — instead of showing a flat list that reads like N distinct
 * actions ran.
 */
function groupIntoAttempts(actionExecutions: ActionExecution[]): ActionExecution[][] {
  const sorted = [...actionExecutions].sort((a, b) => {
    const ta = a.startedAt ?? '';
    const tb = b.startedAt ?? '';
    return ta.localeCompare(tb);
  });
  const attempts: ActionExecution[][] = [];
  let current: ActionExecution[] = [];
  let seen = new Set<string>();
  for (const ae of sorted) {
    if (seen.has(ae.actionId)) {
      attempts.push(current);
      current = [];
      seen = new Set();
    }
    current.push(ae);
    seen.add(ae.actionId);
  }
  if (current.length > 0) attempts.push(current);
  return attempts;
}

function ActionStep({
  actionExecution: ae,
  action,
  index,
}: {
  actionExecution: ActionExecution;
  action: Action | undefined;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const meta = action ? ACTION_META[action.type as keyof typeof ACTION_META] : undefined;
  const label = meta?.label ?? action?.type ?? `Action ${ae.actionId.slice(0, 8)}…`;

  return (
    <li className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 p-4 text-left"
        aria-expanded={open}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
          {index + 1}
        </span>
        <span className="text-lg">{meta?.icon ?? '⚙️'}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-900">{label}</span>
          {ae.error && <span className="block truncate text-xs text-red-600">{ae.error}</span>}
        </span>
        <span className="hidden text-xs tabular-nums text-slate-400 sm:block">
          {formatDuration(ae.startedAt, ae.finishedAt)}
        </span>
        <ExecutionStatusBadge status={ae.status} />
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`size-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-slate-100 p-4 lg:grid-cols-2">
          <JsonBlock label="Input" value={ae.input} />
          <JsonBlock label="Output" value={ae.output} />
          {ae.error && (
            <div className="lg:col-span-2">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-red-400">Error</p>
              <pre className="overflow-auto rounded-md bg-red-50 p-3 font-mono text-xs text-red-700 ring-1 ring-red-100">
                {ae.error}
              </pre>
            </div>
          )}
          <p className="text-xs text-slate-400 lg:col-span-2">
            {formatDateTime(ae.startedAt)} → {formatDateTime(ae.finishedAt)}
          </p>
        </div>
      )}
    </li>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <pre className="max-h-56 overflow-auto rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-700 ring-1 ring-slate-200">
        {value == null ? 'null' : formatJson(value)}
      </pre>
    </div>
  );
}
