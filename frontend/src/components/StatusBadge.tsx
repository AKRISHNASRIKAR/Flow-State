import type { ExecutionStatus, WorkflowStatus } from '@flowstate/api-types';

const workflowStyles: Record<WorkflowStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-300',
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-300',
  PAUSED: 'bg-amber-50 text-amber-700 ring-amber-300',
  ARCHIVED: 'bg-slate-100 text-slate-400 ring-slate-200',
};

export function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${workflowStyles[status]}`}
    >
      {status}
    </span>
  );
}

// Colors follow the execution state machine: PENDING gray, RUNNING blue
// (pulsing), SUCCEEDED green, FAILED red, CANCELLED gray strikethrough.
const executionStyles: Record<ExecutionStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-600 ring-slate-300',
  RUNNING: 'bg-blue-50 text-blue-700 ring-blue-300 animate-pulse',
  SUCCEEDED: 'bg-emerald-50 text-emerald-700 ring-emerald-300',
  FAILED: 'bg-red-50 text-red-700 ring-red-300',
  CANCELLED: 'bg-slate-100 text-slate-400 ring-slate-200 line-through',
};

export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${executionStyles[status]}`}
    >
      {status}
    </span>
  );
}

// Webhook event statuses: RECEIVED gray, PROCESSED/MANUAL green, SKIPPED_*
// variants get distinct warning colors so rate-limit vs concurrency skips are
// distinguishable at a glance.
const webhookEventStyles: Record<string, string> = {
  RECEIVED: 'bg-slate-100 text-slate-600 ring-slate-300',
  PROCESSED: 'bg-emerald-50 text-emerald-700 ring-emerald-300',
  MANUAL: 'bg-indigo-50 text-indigo-700 ring-indigo-300',
  SKIPPED: 'bg-amber-50 text-amber-700 ring-amber-300',
  SKIPPED_CONCURRENCY_LIMIT: 'bg-orange-50 text-orange-700 ring-orange-300',
  SKIPPED_RATE_LIMIT: 'bg-red-50 text-red-700 ring-red-300',
};

export function WebhookEventStatusBadge({ status }: { status: string }) {
  const style = webhookEventStyles[status] ?? 'bg-slate-100 text-slate-600 ring-slate-300';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}
