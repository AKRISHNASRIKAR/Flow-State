import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { Action, Trigger } from '@flowstate/api-types';
import { ACTION_META } from './action-meta';
import { truncate } from '../../lib/format';

export const NODE_WIDTH = 320;

// Per-type accent so a long chain is scannable by color before it is read.
// Falls back to plain gray for a type the frontend doesn't know yet.
const ACTION_ACCENT: Record<string, { border: string; chip: string }> = {
  LOG_MESSAGE: { border: 'border-l-neutral-500', chip: 'bg-neutral-500/15' },
  DELAY: { border: 'border-l-amber-500', chip: 'bg-amber-500/15' },
  HTTP_REQUEST: { border: 'border-l-blue-500', chip: 'bg-blue-500/15' },
  SEND_EMAIL: { border: 'border-l-emerald-500', chip: 'bg-emerald-500/15' },
  TELEGRAM_NOTIFY: { border: 'border-l-sky-400', chip: 'bg-sky-400/15' },
};
const DEFAULT_ACCENT = { border: 'border-l-neutral-600', chip: 'bg-neutral-500/15' };

const BOLT_PATH = 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z';
const PLUS_PATH = 'M12 4.5v15m7.5-7.5h-15';

const triggerSummaries: Record<string, (t: Trigger) => string> = {
  WEBHOOK: () => 'Runs when the webhook URL receives a signed request',
  MANUAL: () => 'Runs only via the "Test workflow" button',
  SCHEDULED: (t) => {
    const interval = (t.configuration as { interval?: number }).interval;
    const endpoint = (t.configuration as { endpoint?: string }).endpoint;
    return `Polls ${endpoint ?? '(no endpoint)'} every ${interval ?? '?'}s`;
  },
};

export interface TriggerNodeData {
  trigger: Trigger;
  onEdit: () => void;
  [key: string]: unknown;
}

export function TriggerNode({ data }: NodeProps) {
  const { trigger, onEdit } = data as TriggerNodeData;
  return (
    <button
      type="button"
      onClick={onEdit}
      style={{ width: NODE_WIDTH }}
      className="cursor-pointer rounded-xl bg-indigo-950 p-4 text-left text-white shadow-[0_0_20px_-5px_rgba(99,102,241,0.4)] ring-1 ring-indigo-500/50 transition hover:bg-indigo-900"
      title="Open trigger configuration"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden className="size-4">
            <path strokeLinecap="round" strokeLinejoin="round" d={BOLT_PATH} />
          </svg>
        </span>
        <span className="rounded-md bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-300">
          Trigger
        </span>
        <span className="text-sm font-semibold">{trigger.type}</span>
      </div>
      <p className="mt-2 text-xs text-indigo-200/70">
        {(triggerSummaries[trigger.type] ?? (() => ''))(trigger)}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-400" />
    </button>
  );
}

export interface ActionNodeData {
  action: Action;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  [key: string]: unknown;
}

export function ActionNode({ data, dragging }: NodeProps) {
  const { action, index, onEdit, onDelete } = data as ActionNodeData;
  const meta = ACTION_META[action.type as keyof typeof ACTION_META];
  const accent = ACTION_ACCENT[action.type] ?? DEFAULT_ACCENT;
  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={`group rounded-xl border-l-4 bg-neutral-900 p-4 shadow-lg ring-1 transition ${accent.border} ${
        dragging ? 'shadow-2xl ring-indigo-500/60' : 'ring-neutral-700 hover:ring-indigo-500/50'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-neutral-600" />
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-xs font-bold text-neutral-200 ring-1 ring-neutral-700">
          {index + 1}
        </span>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 cursor-pointer text-left" title="Edit action">
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <span className={`flex size-6 shrink-0 items-center justify-center rounded-md text-xs ${accent.chip}`}>
              {meta?.icon ?? '⚙️'}
            </span>
            {meta?.label ?? action.type}
          </p>
          <p className="mt-1 truncate text-xs text-neutral-300">
            {meta ? truncate(meta.summarize(action.configuration), 60) : ''}
          </p>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete action"
          className="cursor-pointer rounded-md p-1 text-neutral-500 opacity-0 transition group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
            <path
              fillRule="evenodd"
              d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482 41.03 41.03 0 0 0-2.365-.298V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-neutral-600" />
    </div>
  );
}

export interface AddNodeData {
  onAdd: () => void;
  isFirst: boolean;
  [key: string]: unknown;
}

export function AddActionNode({ data }: NodeProps) {
  const { onAdd, isFirst } = data as AddNodeData;
  return (
    <div style={{ width: NODE_WIDTH }} className="flex justify-center">
      <Handle type="target" position={Position.Top} className="!bg-neutral-600" />
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-900/50 py-4 text-sm font-medium text-neutral-300 transition-all hover:border-indigo-500/50 hover:bg-neutral-800 hover:text-indigo-400"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className="size-4">
          <path strokeLinecap="round" strokeLinejoin="round" d={PLUS_PATH} />
        </svg>
        {isFirst ? 'Add your first action' : 'Add action'}
      </button>
    </div>
  );
}
