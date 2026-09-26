'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Action, ActionExecution, ExecutionStatus } from '@flowstate/api-types';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ExecutionStatusBadge } from '../../components/StatusBadge';
import { Button, EmptyState, Spinner } from '../../components/ui';
import { ACTION_META } from '../../features/flow/action-meta';
import { actionsApi, executionsApi } from '../../lib/api';
import { ApiError } from '../../lib/api-client';
import { toastError } from '../../lib/errors';
import { formatDateTime, formatDuration, formatJson } from '../../lib/format';
import { toast } from '../../lib/toast';

export function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const executionId = id;
  const queryClient = useQueryClient();

  const { data: execution, isPending, isError, refetch } = useQuery({
    queryKey: ['execution', executionId],
    queryFn: () => executionsApi.get(executionId),
    // Keep the timeline live while the run is still in flight.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PENDING' || status === 'RUNNING' ? 2000 : false;
    },
    meta: { errorContext: 'Couldn’t load this run' },
  });

  const { data: actions } = useQuery({
    queryKey: ['actions', execution?.workflowId],
    queryFn: () => actionsApi.list(execution!.workflowId),
    enabled: !!execution?.workflowId,
    // Only used to label steps with their names; the run still reads fine
    // without them, so a failure here isn't worth a second toast.
    meta: { silent: true },
  });

  const cancel = useMutation({
    mutationFn: () => executionsApi.cancel(executionId),
    // Handles its own errors: a 400 here is an expected race, not a failure.
    meta: { silent: true },
    onSuccess: () => {
      toast.success('Run cancelled');
      void queryClient.invalidateQueries({ queryKey: ['execution', executionId] });
      void queryClient.invalidateQueries({ queryKey: ['executions'] });
    },
    onError: (err) => {
      // Real race, observed in backend testing: a worker can claim the job in
      // <200ms, at which point cancel returns 400. That's information, not an
      // error state.
      if (err instanceof ApiError && err.statusCode === 400) {
        toast.info('Too late to cancel', { description: 'This run already started — only queued runs can be cancelled.' });
        void queryClient.invalidateQueries({ queryKey: ['execution', executionId] });
      } else {
        toastError(err, 'Couldn’t cancel the run');
      }
    },
  });

  if (isPending) return <Spinner label="Loading run…" />;
  if (isError || !execution) {
    return (
      <EmptyState
        title="Couldn’t show this run"
        body="It may have been deleted or belong to another account — the notification has the details."
        action={<Button onClick={() => void refetch()}>Try again</Button>}
      />
    );
  }

  const attempts = groupIntoAttempts(execution.actionExecutions);
  const actionById = new Map((actions ?? []).map((a) => [a.id, a]));
  // Number steps by their place in the chain (the list comes back in chain
  // order), not their place in the attempt — a resumed attempt starts mid-chain.
  const stepIndexById = new Map((actions ?? []).map((a, i) => [a.id, i]));

  return (
    <div>
      <div className="mb-1 text-sm">
        <Link href="/executions" className="text-indigo-400 hover:text-indigo-300">
          ← All runs
        </Link>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-white">
          {execution.workflowName ?? 'Run'}{' '}
          <span className="font-mono text-sm font-normal text-neutral-400">{execution.id.slice(0, 8)}</span>
        </h1>
        <ExecutionStatusBadge status={execution.status} />
        {execution.status === 'PENDING' && (
          <Button size="sm" variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            Cancel run
          </Button>
        )}
        <Link
          href={`/workflows/${execution.workflowId}?tab=runs`}
          className="ml-auto text-sm font-medium text-indigo-400 hover:text-indigo-300"
        >
          View workflow →
        </Link>
      </div>

      <div className="mb-6 grid gap-4 rounded-2xl bg-neutral-900 p-5 text-sm shadow-xl ring-1 ring-neutral-800 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Started</p>
          <p className="mt-0.5 text-neutral-100">{formatDateTime(execution.startedAt)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Finished</p>
          <p className="mt-0.5 text-neutral-100">{formatDateTime(execution.finishedAt)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Duration</p>
          <p className="mt-0.5 tabular-nums text-neutral-100">{formatDuration(execution.startedAt, execution.finishedAt)}</p>
        </div>
        {execution.error && (
          <div className="sm:col-span-3">
            <p className="text-xs font-medium uppercase tracking-wide text-red-400">Error</p>
            <p className="mt-0.5 whitespace-pre-wrap font-mono text-xs text-red-300">{execution.error}</p>
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
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Attempt {i + 1} of {attempts.length}
                  {i < attempts.length - 1 && ' — retried from the failed step'}
                </h2>
              )}
              {/* The rail is drawn on the wrapper, not between items, so it stays
                  continuous when a step is expanded. */}
              <div className="relative pl-14 before:absolute before:bottom-7 before:left-[27px] before:top-7 before:w-0.5 before:bg-neutral-800">
                <ol className="space-y-3">
                  {attempt.map((ae, stepIndex) => (
                    <ActionStep
                      key={ae.id}
                      actionExecution={ae}
                      action={actionById.get(ae.actionId)}
                      index={stepIndexById.get(ae.actionId) ?? stepIndex}
                    />
                  ))}
                </ol>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A retry resumes at the step that failed (earlier steps already succeeded
 * and are skipped), so actionExecutions can hold several entries for the
 * failing actionId — one per attempt. Group into attempts — a repeat of an
 * already-seen actionId starts the next attempt — instead of showing a flat
 * list that reads like N distinct actions ran.
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

// Marker colors on the timeline rail. PENDING/RUNNING normally render a
// spinner instead — their entries here only cover the exhaustive Record.
const STEP_DOT: Record<ExecutionStatus, string> = {
  PENDING: 'bg-neutral-600',
  RUNNING: 'bg-blue-500',
  SUCCEEDED: 'bg-emerald-500',
  FAILED: 'bg-red-500',
  CANCELLED: 'bg-neutral-600',
};

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

  const inFlight = ae.status === 'PENDING' || ae.status === 'RUNNING';

  return (
    <li className="relative rounded-xl bg-neutral-900 shadow-lg ring-1 ring-neutral-800">
      {/* Rail marker, centred on the rail at x=28px. Decorative — the row's
          status badge carries the state. */}
      <span aria-hidden className="absolute -left-9 top-5">
        {inFlight ? (
          <span className="block size-4 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-400 ring-4 ring-black" />
        ) : (
          <span className={`block size-4 rounded-full ring-4 ring-black ${STEP_DOT[ae.status]}`} />
        )}
      </span>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 p-4 text-left"
        aria-expanded={open}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-200 ring-1 ring-neutral-700">
          {index + 1}
        </span>
        <span className="text-lg">{meta?.icon ?? '⚙️'}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-white">{label}</span>
          {ae.error && <span className="block truncate text-xs text-red-400">{ae.error}</span>}
        </span>
        <span className="hidden text-xs tabular-nums text-neutral-400 sm:block">
          {formatDuration(ae.startedAt, ae.finishedAt)}
        </span>
        <ExecutionStatusBadge status={ae.status} />
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`size-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-neutral-800 p-4 lg:grid-cols-2">
          <JsonBlock label="Input" value={ae.input} />
          <JsonBlock label="Output" value={ae.output} />
          {ae.error && (
            <div className="lg:col-span-2">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-red-400">Error</p>
              <pre className="overflow-auto rounded-lg bg-red-500/10 p-4 font-mono text-xs text-red-300 ring-1 ring-red-500/20">
                {ae.error}
              </pre>
            </div>
          )}
          <p className="text-xs text-neutral-400 lg:col-span-2">
            {formatDateTime(ae.startedAt)} → {formatDateTime(ae.finishedAt)}
          </p>
        </div>
      )}
    </li>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex min-w-0 flex-col">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <pre className="max-h-56 flex-1 overflow-auto rounded-lg bg-black p-4 font-mono text-xs text-emerald-400 ring-1 ring-neutral-800">
        {value == null ? 'null' : formatJson(value)}
      </pre>
    </div>
  );
}
