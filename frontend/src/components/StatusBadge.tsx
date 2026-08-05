import type { ExecutionStatus, WorkflowStatus } from '@flowstate/api-types';

const BADGE_BASE =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset';

/** Leading dot. Decorative only — the status word beside it carries the meaning. */
function Dot({ className }: { className: string }) {
  return <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${className}`} />;
}

// Dark-mode badges: a 15% color wash behind a 300-weight label and a 30% ring.
// The saturated text is what carries contrast against the neutral-900 cards.
const workflowStyles: Record<WorkflowStatus, string> = {
  DRAFT: 'bg-neutral-500/15 text-neutral-300 ring-neutral-500/30',
  ACTIVE: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  PAUSED: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  // Deliberately dimmer than DRAFT — archived is inert, not merely unstarted.
  ARCHIVED: 'bg-neutral-500/10 text-neutral-500 ring-neutral-500/20',
};

const workflowDots: Record<WorkflowStatus, string> = {
  DRAFT: 'bg-neutral-400',
  ACTIVE: 'bg-emerald-400',
  PAUSED: 'bg-amber-400',
  ARCHIVED: 'bg-neutral-500',
};

export function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  return (
    <span className={`${BADGE_BASE} ${workflowStyles[status]}`}>
      <Dot className={workflowDots[status]} />
      {status}
    </span>
  );
}

// Colors follow the execution state machine: PENDING gray, RUNNING blue
// (pulsing), SUCCEEDED green, FAILED red, CANCELLED gray strikethrough.
const executionStyles: Record<ExecutionStatus, string> = {
  PENDING: 'bg-neutral-500/15 text-neutral-300 ring-neutral-500/30',
  RUNNING: 'bg-blue-500/15 text-blue-300 ring-blue-500/30 animate-pulse',
  SUCCEEDED: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  FAILED: 'bg-red-500/15 text-red-300 ring-red-500/30',
  CANCELLED: 'bg-neutral-500/10 text-neutral-500 ring-neutral-500/20 line-through',
};

const executionDots: Record<ExecutionStatus, string> = {
  PENDING: 'bg-neutral-400',
  RUNNING: 'bg-blue-400',
  SUCCEEDED: 'bg-emerald-400',
  FAILED: 'bg-red-400',
  CANCELLED: 'bg-neutral-500',
};

export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  return (
    <span className={`${BADGE_BASE} ${executionStyles[status]}`}>
      <Dot className={executionDots[status]} />
      {status}
    </span>
  );
}

// Webhook event statuses: RECEIVED gray, PROCESSED/MANUAL green, SKIPPED_*
// variants get distinct warning colors so rate-limit vs concurrency skips are
// distinguishable at a glance.
const webhookEventStyles: Record<string, string> = {
  RECEIVED: 'bg-neutral-500/15 text-neutral-300 ring-neutral-500/30',
  PROCESSED: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  MANUAL: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30',
  SKIPPED: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  SKIPPED_CONCURRENCY_LIMIT: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  SKIPPED_RATE_LIMIT: 'bg-red-500/15 text-red-300 ring-red-500/30',
};

export function WebhookEventStatusBadge({ status }: { status: string }) {
  const style = webhookEventStyles[status] ?? 'bg-neutral-500/15 text-neutral-300 ring-neutral-500/30';
  return <span className={`${BADGE_BASE} ${style}`}>{status.replaceAll('_', ' ')}</span>;
}
