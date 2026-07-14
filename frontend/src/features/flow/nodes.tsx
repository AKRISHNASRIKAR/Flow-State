import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { Action, Trigger } from '@flowstate/api-types';
import { ACTION_META } from './action-meta';
import { truncate } from '../../lib/format';

export const NODE_WIDTH = 320;

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
      className="rounded-xl bg-indigo-600 p-4 text-left text-white shadow-md ring-1 ring-indigo-700 transition hover:bg-indigo-500"
      title="Open trigger configuration"
    >
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
          Trigger
        </span>
        <span className="text-sm font-semibold">{trigger.type}</span>
      </div>
      <p className="mt-1.5 text-xs text-indigo-100">
        {(triggerSummaries[trigger.type] ?? (() => ''))(trigger)}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-300" />
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
  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={`group rounded-xl bg-white p-4 shadow-sm ring-1 transition ${
        dragging ? 'shadow-xl ring-indigo-400' : 'ring-slate-200 hover:ring-indigo-300'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-300" />
      <div className="flex items-start gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
          {index + 1}
        </span>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 cursor-pointer text-left" title="Edit action">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <span>{meta?.icon ?? '⚙️'}</span>
            {meta?.label ?? action.type}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {meta ? truncate(meta.summarize(action.configuration), 60) : ''}
          </p>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete action"
          className="rounded-md p-1 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
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
      <Handle type="source" position={Position.Bottom} className="!bg-slate-300" />
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
      <Handle type="target" position={Position.Top} className="!bg-slate-300" />
      <button
        type="button"
        onClick={onAdd}
        className="rounded-full border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-500 transition hover:border-indigo-400 hover:text-indigo-600"
      >
        + {isFirst ? 'Add your first action' : 'Add action'}
      </button>
    </div>
  );
}
