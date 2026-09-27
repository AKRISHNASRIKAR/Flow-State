import type { ExecutionStatus, WorkflowStatus } from '@flowstate/api-types';

const BADGE_BASE =
  // Squared mono chips — the same shape as the canvas's state chips.
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] px-1.5 py-1 font-mono text-[11px] leading-none font-medium ring-1 ring-inset';

/** Leading dot. Decorative only — the status word beside it carries the meaning. */
function Dot({ className }: { className: string }) {
  return <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${className}`} />;
}

// Dark-mode badges: a 15% color wash behind a 300-weight label and a 30% ring.
// The saturated text is what carries contrast against the light card surfaces.
const workflowStyles: Record<WorkflowStatus, string> = {
  DRAFT: 'bg-rule text-graphite ring-faint/30',
  ACTIVE: 'bg-ok-soft text-ok ring-ok/30',
  PAUSED: 'bg-wait-soft text-wait ring-wait/30',
  // Deliberately dimmer than DRAFT — archived is inert, not merely unstarted.
  ARCHIVED: 'bg-rule text-faint ring-faint/20',
};

const workflowDots: Record<WorkflowStatus, string> = {
  DRAFT: 'bg-rule',
  ACTIVE: 'bg-ok',
  PAUSED: 'bg-wait',
  ARCHIVED: 'bg-rule',
};

// Plain words for what each state means to the user; the API's enum values
// stay as they are.
export const WORKFLOW_STATUS_LABEL: Record<WorkflowStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'On',
  PAUSED: 'Paused',
  ARCHIVED: 'Deleted',
};

export function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  return (
    <span className={`${BADGE_BASE} ${workflowStyles[status]}`}>
      <Dot className={workflowDots[status]} />
      {WORKFLOW_STATUS_LABEL[status]}
    </span>
  );
}

// Colors follow the execution state machine: PENDING gray, RUNNING blue
// (pulsing), SUCCEEDED green, FAILED red, CANCELLED gray strikethrough.
const executionStyles: Record<ExecutionStatus, string> = {
  PENDING: 'bg-rule text-graphite ring-faint/30',
  RUNNING: 'bg-signal-soft text-signal ring-signal/30 animate-pulse',
  SUCCEEDED: 'bg-ok-soft text-ok ring-ok/30',
  FAILED: 'bg-fail-soft text-fail ring-fail/30',
  CANCELLED: 'bg-rule text-faint ring-faint/20 line-through',
};

const executionDots: Record<ExecutionStatus, string> = {
  PENDING: 'bg-rule',
  RUNNING: 'bg-signal',
  SUCCEEDED: 'bg-ok',
  FAILED: 'bg-fail',
  CANCELLED: 'bg-rule',
};

export const EXECUTION_STATUS_LABEL: Record<ExecutionStatus, string> = {
  PENDING: 'Queued',
  RUNNING: 'Running',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  return (
    <span className={`${BADGE_BASE} ${executionStyles[status]}`}>
      <Dot className={executionDots[status]} />
      {EXECUTION_STATUS_LABEL[status]}
    </span>
  );
}

// Webhook event statuses: RECEIVED gray, PROCESSED/MANUAL green, SKIPPED_*
// variants get distinct warning colors so rate-limit vs concurrency skips are
// distinguishable at a glance.
const webhookEventStyles: Record<string, string> = {
  RECEIVED: 'bg-rule text-graphite ring-faint/30',
  PROCESSED: 'bg-ok-soft text-ok ring-ok/30',
  MANUAL: 'bg-signal-soft text-signal ring-signal/30',
  SKIPPED: 'bg-wait-soft text-wait ring-wait/30',
  SKIPPED_CONCURRENCY_LIMIT: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  SKIPPED_RATE_LIMIT: 'bg-fail-soft text-fail ring-fail/30',
};

const WEBHOOK_EVENT_LABEL: Record<string, string> = {
  RECEIVED: 'Received',
  PROCESSED: 'Ran',
  MANUAL: 'Test run',
  SKIPPED: 'Skipped — workflow off',
  SKIPPED_CONCURRENCY_LIMIT: 'Skipped — too many running',
  SKIPPED_RATE_LIMIT: 'Skipped — hourly limit',
};

export function WebhookEventStatusBadge({ status }: { status: string }) {
  const style = webhookEventStyles[status] ?? 'bg-rule text-graphite ring-faint/30';
  return <span className={`${BADGE_BASE} ${style}`}>{WEBHOOK_EVENT_LABEL[status] ?? status.replaceAll('_', ' ')}</span>;
}
