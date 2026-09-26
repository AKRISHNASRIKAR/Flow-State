import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { Action, Trigger } from '@flowstate/api-types';
import { Icon, ICON_PATHS } from '../../components/ui';
import { TRIGGER_ICONS } from '../trigger/TriggerDrawer';
import { ACTION_META } from './action-meta';
import { truncate } from '../../lib/format';

export const NODE_WIDTH = 340;

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

const triggerSummaries: Record<string, (t: Trigger) => string> = {
  WEBHOOK: () => 'When another app sends a request to this workflow’s webhook URL',
  MANUAL: () => 'Only when you press Test run',
  SCHEDULED: (t) => {
    const interval = (t.configuration as { interval?: number }).interval;
    const endpoint = (t.configuration as { endpoint?: string }).endpoint;
    return `When ${endpoint ?? '(no URL)'} changes — checked every ${interval ?? '?'}s`;
  },
};

const TRIGGER_TITLES: Record<string, string> = {
  WEBHOOK: 'Webhook',
  MANUAL: 'Test run button',
  SCHEDULED: 'URL check',
};

export interface TriggerNodeData {
  /** null → nothing chosen yet; the node becomes the call to action. */
  trigger: Trigger | null;
  onEdit: () => void;
  [key: string]: unknown;
}

export function TriggerNode({ data }: NodeProps) {
  const { trigger, onEdit } = data as TriggerNodeData;

  if (!trigger) {
    return (
      <button
        type="button"
        onClick={onEdit}
        style={{ width: NODE_WIDTH }}
        className="rounded-xl border-2 border-dashed border-indigo-500/60 bg-indigo-500/5 p-4 text-left transition hover:border-indigo-400 hover:bg-indigo-500/10"
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-indigo-300">
          <Icon path={ICON_PATHS.bolt} className="size-5" />
          Choose what starts this workflow
        </span>
        <span className="mt-1.5 block text-xs text-neutral-400">A webhook, a URL check on a schedule, or a button.</span>
        <Handle type="source" position={Position.Bottom} className="!bg-indigo-400" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      style={{ width: NODE_WIDTH }}
      className="rounded-xl bg-indigo-950 p-4 text-left text-white shadow-[0_0_20px_-5px_rgba(99,102,241,0.4)] ring-1 ring-indigo-500/50 transition hover:bg-indigo-900"
      title="Change what starts this workflow"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30">
          <Icon path={TRIGGER_ICONS[trigger.type] ?? ICON_PATHS.bolt} className="size-4" />
        </span>
        <span className="rounded-md bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-300">
          Starts
        </span>
        <span className="text-sm font-semibold">{TRIGGER_TITLES[trigger.type] ?? trigger.type}</span>
        <span className="ml-auto text-xs text-indigo-300/80">Edit</span>
      </div>
      <p className="mt-2 text-xs text-indigo-200/70">{truncate((triggerSummaries[trigger.type] ?? (() => ''))(trigger), 90)}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-400" />
    </button>
  );
}

export interface ActionNodeData {
  action: Action;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  [key: string]: unknown;
}

function NodeButton({
  label,
  path,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  path: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`nodrag rounded-md p-1 text-neutral-400 transition disabled:opacity-30 ${
        danger ? 'hover:bg-red-500/10 hover:text-red-400' : 'hover:bg-neutral-800 hover:text-white'
      }`}
    >
      <Icon path={path} className="size-4" />
    </button>
  );
}

export function ActionNode({ data, dragging }: NodeProps) {
  const { action, index, isFirst, isLast, onEdit, onDelete, onMove } = data as ActionNodeData;
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
        <button type="button" onClick={onEdit} className="nodrag min-w-0 flex-1 text-left" title="Edit step">
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
        {/* Shown on hover and on keyboard focus, so they're reachable without a mouse. */}
        <div className="flex shrink-0 items-center opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
          <NodeButton label="Move up" path={ICON_PATHS.arrowUp} onClick={() => onMove(-1)} disabled={isFirst} />
          <NodeButton label="Move down" path={ICON_PATHS.arrowDown} onClick={() => onMove(1)} disabled={isLast} />
          <NodeButton label="Delete step" path={ICON_PATHS.trash} onClick={onDelete} danger />
        </div>
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
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-900/50 py-4 text-sm font-medium text-neutral-300 transition-all hover:border-indigo-500/50 hover:bg-neutral-800 hover:text-indigo-400"
      >
        <Icon path={ICON_PATHS.plus} className="size-4" strokeWidth={2} />
        {isFirst ? 'Add your first step' : 'Add a step'}
      </button>
    </div>
  );
}
