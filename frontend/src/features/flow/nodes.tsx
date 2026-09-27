import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { Action, Trigger } from '@flowstate/api-types';
import { FlowNodeCard } from '../../components/flow-visuals';
import { Icon, ICON_PATHS } from '../../components/ui';
import { ACTION_GLYPH, GLYPHS, TRIGGER_GLYPH } from '../../lib/glyphs';
import { truncate } from '../../lib/format';
import type { StepRunState } from '../workflow/useLatestRun';
import { ACTION_META } from './action-meta';

export const NODE_WIDTH = 340;

// Edges attach to these, but the builder never lets you draw one by hand — the
// engine runs a straight chain — so the handles are invisible.
const HIDDEN_HANDLE = '!h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent';

const TRIGGER_KIND: Record<string, string> = {
  WEBHOOK: 'webhook',
  MANUAL: 'manual',
  SCHEDULED: 'URL check',
};

const triggerSummaries: Record<string, (t: Trigger) => string> = {
  WEBHOOK: () => 'Another app sends a request',
  MANUAL: () => 'You press Test run',
  SCHEDULED: (t) => {
    const interval = (t.configuration as { interval?: number }).interval;
    const endpoint = (t.configuration as { endpoint?: string }).endpoint;
    return `${endpoint ?? '(no URL)'} changes · every ${interval ?? '?'}s`;
  },
};

export interface TriggerNodeData {
  /** null → nothing chosen yet; the node becomes the call to action. */
  trigger: Trigger | null;
  onEdit: () => void;
  selected: boolean;
  /** e.g. "fired 2 min ago" — from the latest run. */
  lastFired?: string;
  [key: string]: unknown;
}

export function TriggerNode({ data }: NodeProps) {
  const { trigger, onEdit, selected, lastFired } = data as TriggerNodeData;

  if (!trigger) {
    return (
      <button
        type="button"
        onClick={onEdit}
        style={{ width: NODE_WIDTH }}
        className="rounded-md border border-dashed border-signal/60 bg-card/80 p-4 text-left transition-colors hover:border-signal hover:bg-card"
      >
        <span className="label-caps text-signal">Trigger</span>
        <span className="mt-2 flex items-center gap-2 text-[15px] font-medium text-ink">
          <Icon path={ICON_PATHS.bolt} className="size-4 text-signal" />
          Choose what starts this workflow
        </span>
        <span className="mt-1 block text-[13px] text-muted">A webhook, a URL check on a schedule, or a button.</span>
        <Handle type="source" position={Position.Bottom} className={HIDDEN_HANDLE} />
      </button>
    );
  }

  return (
    <button type="button" onClick={onEdit} style={{ width: NODE_WIDTH }} className="block text-left" title="Change what starts this workflow">
      <FlowNodeCard
        kind="trigger"
        label={`Trigger · ${TRIGGER_KIND[trigger.type] ?? trigger.type.toLowerCase()}`}
        title={truncate((triggerSummaries[trigger.type] ?? (() => trigger.type))(trigger), 72)}
        glyph={TRIGGER_GLYPH[trigger.type] ?? GLYPHS.bolt}
        state={lastFired ? { tone: 'idle', text: lastFired } : undefined}
        active={selected}
        className="hover:border-faint"
      />
      <Handle type="source" position={Position.Bottom} className={HIDDEN_HANDLE} />
    </button>
  );
}

export interface ActionNodeData {
  action: Action;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  selected: boolean;
  /** How this step did in the latest run, if it ran. */
  run?: StepRunState;
  /** Settings that wouldn't pass the step form. */
  problem?: string;
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
      className={`nodrag rounded-[4px] p-1 text-muted transition-colors disabled:opacity-30 ${
        danger ? 'hover:bg-fail-soft hover:text-fail' : 'hover:bg-paper-2 hover:text-ink'
      }`}
    >
      <Icon path={path} className="size-4" />
    </button>
  );
}

export function ActionNode({ data, dragging }: NodeProps) {
  const { action, index, isFirst, isLast, onEdit, onDelete, onMove, selected, run, problem } = data as ActionNodeData;
  const meta = ACTION_META[action.type as keyof typeof ACTION_META];
  const glyph = ACTION_GLYPH[action.type as keyof typeof ACTION_GLYPH] ?? GLYPHS.bolt;
  const summary = meta ? meta.summarize(action.configuration ?? {}) : action.type;

  return (
    <div style={{ width: NODE_WIDTH }} className={`group relative ${dragging ? 'rotate-[0.4deg]' : ''}`}>
      <Handle type="target" position={Position.Top} className={HIDDEN_HANDLE} />
      <button type="button" onClick={onEdit} className="nodrag block w-full text-left" title="Edit step">
        <FlowNodeCard
          kind="step"
          label={`Step ${index + 1} · ${meta?.label.toLowerCase() ?? action.type}`}
          title={<span className="block truncate">{truncate(summary, 60)}</span>}
          glyph={glyph}
          state={problem ? { tone: 'setup', text: 'needs setup' } : run ? { tone: run.tone, text: run.text } : undefined}
          active={selected || run?.tone === 'running'}
          alert={Boolean(problem) || run?.tone === 'fail'}
          className={dragging ? 'shadow-[0_24px_40px_-20px_rgba(15,27,45,0.5)]' : 'group-hover:border-faint'}
        >
          {problem && <p className="mt-2 pl-11 text-[12px] leading-snug text-fail">{problem}</p>}
        </FlowNodeCard>
      </button>
      {/* Shown on hover and on keyboard focus, so they're reachable without a mouse. */}
      <div className="absolute -right-2 top-1/2 flex -translate-y-1/2 translate-x-full flex-col gap-0.5 rounded-[5px] border border-rule bg-card p-0.5 opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <NodeButton label="Move up" path={ICON_PATHS.arrowUp} onClick={() => onMove(-1)} disabled={isFirst} />
        <NodeButton label="Move down" path={ICON_PATHS.arrowDown} onClick={() => onMove(1)} disabled={isLast} />
        <NodeButton label="Delete step" path={ICON_PATHS.trash} onClick={onDelete} danger />
      </div>
      <Handle type="source" position={Position.Bottom} className={HIDDEN_HANDLE} />
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
    <div style={{ width: NODE_WIDTH }}>
      <Handle type="target" position={Position.Top} className={HIDDEN_HANDLE} />
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-faint/70 bg-card/60 py-3.5 text-sm font-medium text-graphite transition-colors hover:border-ink hover:bg-card hover:text-ink"
      >
        <Icon path={ICON_PATHS.plus} className="size-4" strokeWidth={2} />
        {isFirst ? 'Add your first step' : 'Add a step'}
      </button>
    </div>
  );
}
