'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Action, Workflow } from '@flowstate/api-types';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { StateChip, type RunTone } from '../../components/flow-visuals';
import {
  Button,
  ConfirmDialog,
  DrawerModeContext,
  EmptyState,
  Icon,
  ICON_PATHS,
  Menu,
  Spinner,
  Switch,
  Tabs,
} from '../../components/ui';
import { RunsTab } from '../../features/executions/RunsTab';
import { FlowCanvas } from '../../features/flow/FlowCanvas';
import { StepDrawer } from '../../features/flow/StepDrawer';
import { TestFireModal } from '../../features/trigger/TestFireModal';
import { TriggerDrawer } from '../../features/trigger/TriggerDrawer';
import { useActions, useTrigger } from '../../features/workflow/queries';
import { assessReadiness, type Readiness } from '../../features/workflow/readiness';
import { SetupChecklist } from '../../features/workflow/SetupChecklist';
import { useLatestRun, type LatestRun } from '../../features/workflow/useLatestRun';
import { workflowsApi } from '../../lib/api';
import { ApiError } from '../../lib/api-client';
import { toastError } from '../../lib/errors';
import { formatDuration, timeAgo } from '../../lib/format';
import { toast } from '../../lib/toast';
import { useMediaQuery } from '../../lib/use-media-query';

const WORKFLOW_STATE: Record<Workflow['status'], { tone: RunTone; text: string }> = {
  DRAFT: { tone: 'idle', text: 'draft' },
  ACTIVE: { tone: 'ok', text: 'on' },
  // Amber: waiting on you to turn it back on.
  PAUSED: { tone: 'queued', text: 'paused' },
  ARCHIVED: { tone: 'idle', text: 'archived' },
};

const READINESS_STYLE: Record<Readiness['tone'], string> = {
  ready: 'bg-signal-soft text-signal',
  blocked: 'bg-fail-soft text-fail',
  off: 'bg-paper-2 text-muted',
};

const RUN_TONE: Record<string, RunTone> = {
  PENDING: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'ok',
  FAILED: 'fail',
  CANCELLED: 'idle',
};

/** Along the bottom of the canvas: what happened last time, and whether it's running now. */
function RunDock({ workflow, run, triggerLabel }: { workflow: Workflow; run: LatestRun; triggerLabel: string }) {
  const last = run.summary;
  const cells: { k: string; v: React.ReactNode }[] = [
    { k: 'Status', v: `${workflow.status === 'ACTIVE' ? 'On' : workflow.status === 'PAUSED' ? 'Paused' : 'Draft'} · ${triggerLabel}` },
    {
      k: run.live ? 'Running now' : 'Last run',
      v: last ? (
        <span className="flex flex-wrap items-center gap-2">
          <StateChip tone={RUN_TONE[last.status] ?? 'idle'}>{last.status.toLowerCase()}</StateChip>
          <span className="text-muted">
            {timeAgo(last.startedAt)}
            {last.finishedAt ? ` · ${formatDuration(last.startedAt, last.finishedAt)}` : ''}
          </span>
        </span>
      ) : (
        <span className="text-muted">Never run</span>
      ),
    },
    { k: 'Runs', v: run.total === 1 ? '1 run' : `${run.total} runs` },
  ];
  return (
    <div className="grid grid-cols-2 border-t border-rule bg-card sm:grid-cols-[1fr_1.4fr_0.7fr_auto]">
      {cells.map((c, i) => (
        <div key={c.k} className={`min-w-0 px-4 py-3 ${i > 0 ? 'sm:border-l sm:border-rule-soft' : ''}`}>
          <p className="label-caps text-muted">{c.k}</p>
          <div className="mt-1.5 truncate text-[14px] font-medium text-ink tabular-nums">{c.v}</div>
        </div>
      ))}
      <div className="col-span-2 flex items-center px-4 py-3 sm:col-span-1 sm:border-l sm:border-rule-soft">
        {last ? (
          <Link href={`/executions/${last.id}`} className="text-[13px] font-medium text-ink underline decoration-rule underline-offset-4 hover:decoration-ink">
            View this run →
          </Link>
        ) : (
          <span className="text-[13px] text-muted">Press Test run to try it</span>
        )}
      </div>
    </div>
  );
}

type Tab = 'flow' | 'runs';
const TABS: { id: Tab; label: string }[] = [
  { id: 'flow', label: 'Flow' },
  { id: 'runs', label: 'Runs' },
];

/** The one side panel open at a time: what starts the workflow, or a step. */
type Panel = { kind: 'trigger' } | { kind: 'step'; action: Action | null } | null;

export function WorkflowDetailPage() {
  const { id: workflowId } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  // ?tab=trigger predates the trigger living on the canvas — keep those links
  // working by opening the trigger panel on the Flow tab.
  const tab: Tab = tabParam === 'runs' ? 'runs' : 'flow';
  const [panel, setPanel] = useState<Panel>(tabParam === 'trigger' ? { kind: 'trigger' } : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTestRun, setShowTestRun] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const setTab = (t: Tab) => router.replace(t === 'flow' ? pathname : `${pathname}?tab=${t}`);

  const {
    data: workflow,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => workflowsApi.get(workflowId),
    retry: false,
    // Handled below: not-found redirects, anything else offers a retry.
    meta: { silent: true },
  });
  const trigger = useTrigger(workflowId);
  const actions = useActions(workflowId);
  const latestRun = useLatestRun(workflowId);
  // Docked inspector beside the canvas on wide screens; overlays elsewhere.
  const docked = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    if (!error) return;
    if (error instanceof ApiError && error.statusCode === 404) {
      toast.error('That workflow doesn’t exist', { description: 'It may have been deleted.' });
      router.replace('/workflows');
    } else {
      toastError(error, 'Couldn’t load the workflow');
    }
  }, [error, router]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
    void queryClient.invalidateQueries({ queryKey: ['workflows'] });
  };

  const rename = useMutation({
    mutationFn: (name: string) => workflowsApi.update(workflowId, { name }),
    meta: { errorContext: 'Couldn’t rename the workflow' },
    onSuccess: () => {
      invalidate();
      setEditingName(false);
    },
  });
  const setOn = useMutation({
    mutationFn: (on: boolean) => (on ? workflowsApi.resume(workflowId) : workflowsApi.pause(workflowId)),
    meta: { errorContext: 'Couldn’t change the workflow' },
    onSuccess: (wf) => {
      invalidate();
      toast.success(wf.status === 'ACTIVE' ? 'Workflow is on' : 'Workflow paused', {
        description: wf.status === 'ACTIVE' ? 'It will now run whenever its trigger fires.' : 'It won’t run until you turn it back on.',
      });
    },
  });
  const clone = useMutation({
    mutationFn: () => workflowsApi.clone(workflowId),
    meta: { errorContext: 'Couldn’t duplicate the workflow' },
    onSuccess: (created) => {
      toast.success(`Duplicated as “${created.name}”`, { description: 'The copy starts as a draft.' });
      router.push(`/workflows/${created.id}`);
    },
  });
  const remove = useMutation({
    mutationFn: () => workflowsApi.remove(workflowId),
    meta: { errorContext: 'Couldn’t delete the workflow' },
    onSuccess: () => {
      toast.success('Workflow deleted');
      void queryClient.invalidateQueries({ queryKey: ['workflows'] });
      router.push('/workflows');
    },
  });

  if (isPending) return <Spinner label="Loading workflow…" />;
  if (!workflow) {
    return (
      <EmptyState
        title="Couldn’t load this workflow"
        body="The details are in the notification."
        action={<Button onClick={() => void refetch()}>Try again</Button>}
      />
    );
  }

  const isOn = workflow.status === 'ACTIVE';
  const hasTrigger = Boolean(trigger.data);
  // Manual fire is refused unless the workflow is on — explain rather than let
  // the button fail with a confusing "not found".
  const testRunBlocker = !hasTrigger
    ? 'Choose what starts this workflow first'
    : !isOn
      ? 'Turn the workflow on to send a test run'
      : undefined;

  const submitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== workflow.name) rename.mutate(trimmed);
    else setEditingName(false);
  };

  const readiness = assessReadiness(workflow, trigger.data ?? null, actions.data ?? []);
  const triggerLabel = trigger.data
    ? { WEBHOOK: 'webhook', SCHEDULED: 'URL check', MANUAL: 'test run button' }[trigger.data.type] ?? trigger.data.type
    : 'no trigger yet';
  const selected =
    panel?.kind === 'trigger' ? ({ kind: 'trigger' } as const) : panel?.kind === 'step' ? ({ kind: 'step', id: panel.action?.id ?? null } as const) : null;

  const checklist = (compact: boolean) => (
    <SetupChecklist
      workflow={workflow}
      compact={compact}
      onChooseTrigger={() => setPanel({ kind: 'trigger' })}
      onAddStep={() => setPanel({ kind: 'step', action: null })}
      onTurnOn={() => setOn.mutate(true)}
      onTestRun={() => setShowTestRun(true)}
      turningOn={setOn.isPending}
    />
  );

  const panelContent =
    panel?.kind === 'trigger' ? (
      <TriggerDrawer workflowId={workflowId} onClose={() => setPanel(null)} />
    ) : panel?.kind === 'step' ? (
      <StepDrawer
        // Remount per step so the form starts from that step's settings.
        key={panel.action?.id ?? 'new'}
        workflowId={workflowId}
        action={panel.action}
        onClose={() => setPanel(null)}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Builder top bar: where am I, is it on, is it ready, run it. */}
      <header className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <div className="flex flex-wrap items-center gap-3">
            {editingName ? (
              <input
                autoFocus
                aria-label="Workflow name"
                value={nameDraft}
                maxLength={120}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={submitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitName();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                className="min-w-0 flex-1 rounded-[5px] border-0 bg-card px-2 py-0.5 font-serif text-[32px] leading-tight text-ink ring-2 ring-signal focus:outline-none"
              />
            ) : (
              <button
                type="button"
                className="min-w-0 truncate rounded-[5px] px-1 -mx-1 text-left font-serif text-[32px] leading-tight text-ink hover:bg-paper-2"
                title="Click to rename"
                onClick={() => {
                  setNameDraft(workflow.name);
                  setEditingName(true);
                }}
              >
                {workflow.name}
              </button>
            )}
            <StateChip tone={WORKFLOW_STATE[workflow.status].tone}>{WORKFLOW_STATE[workflow.status].text}</StateChip>
            <span
              title={readiness.detail}
              className={`inline-flex items-center gap-1 rounded-[3px] px-1.5 py-1 font-mono text-[11px] leading-none font-medium ${READINESS_STYLE[readiness.tone]}`}
            >
              {readiness.tone === 'ready' ? '✓ ' : readiness.tone === 'blocked' ? '! ' : ''}
              {readiness.label}
            </span>
          </div>
          {workflow.description && <p className="mt-1.5 max-w-[70ch] text-sm text-muted">{workflow.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={isOn}
            label={isOn ? 'On' : 'Off'}
            disabled={setOn.isPending}
            onChange={(on) => setOn.mutate(on)}
          />
          <span title={testRunBlocker}>
            <Button variant="primary" onClick={() => setShowTestRun(true)} disabled={testRunBlocker !== undefined}>
              <Icon path={ICON_PATHS.play} className="size-4" />
              Test run
            </Button>
          </span>
          <Menu
            label="More actions"
            items={[
              { label: 'Duplicate', onSelect: () => clone.mutate(), disabled: clone.isPending },
              { label: 'Delete…', onSelect: () => setConfirmDelete(true), danger: true },
            ]}
          />
        </div>
      </header>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'flow' && (
        <>
          {/* Phones and tablets: the checklist sits above the canvas. */}
          {!docked && checklist(false)}
          <div className="-mt-1 grid gap-4 lg:h-[calc(100dvh-15.5rem)] lg:min-h-[560px] lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="flex min-h-[520px] flex-col overflow-hidden rounded-md border border-rule lg:min-h-0">
              <div className="min-h-0 flex-1">
                <FlowCanvas
                  workflowId={workflowId}
                  onEditTrigger={() => setPanel({ kind: 'trigger' })}
                  onEditStep={(action) => setPanel({ kind: 'step', action })}
                  selected={selected}
                  run={latestRun}
                  problems={readiness.problems}
                  lastFired={latestRun.summary ? `fired ${timeAgo(latestRun.summary.startedAt)}` : undefined}
                />
              </div>
              <RunDock workflow={workflow} run={latestRun} triggerLabel={triggerLabel} />
            </div>

            {docked && (
              <aside className="min-h-0">
                <DrawerModeContext.Provider value="inline">
                  {panelContent ?? (
                    <div className="h-full overflow-y-auto rounded-md border border-rule bg-card p-5">
                      {checklist(true) ?? null}
                      <InspectorOverview readiness={readiness} />
                    </div>
                  )}
                </DrawerModeContext.Provider>
              </aside>
            )}
          </div>
          <p className="-mt-2 text-xs text-muted">
            Steps run top to bottom, one after another. Click a step to edit it; hover it to reorder or delete.
          </p>
        </>
      )}
      {tab === 'runs' && <RunsTab workflowId={workflowId} />}

      {(!docked || tab !== 'flow') && panelContent}
      {showTestRun && (
        <TestFireModal workflowId={workflowId} watchOnCanvas={tab === 'flow'} onClose={() => setShowTestRun(false)} />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete “${workflow.name}”?`}
          body="It stops running and disappears from your list. Its past runs are kept."
          confirmLabel="Delete workflow"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

/** The inspector with nothing selected: what the workflow needs, or that it's done. */
function InspectorOverview({ readiness }: { readiness: Readiness }) {
  if (readiness.tone !== 'ready' && readiness.tone !== 'off') return null;
  return (
    <div>
      <p className="label-caps text-signal">Inspector</p>
      <h2 className="mt-2 font-serif text-[22px] leading-tight text-ink">
        {readiness.tone === 'ready' ? 'Ready to run' : 'Set up — and switched off'}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-graphite">{readiness.detail}</p>
      <ul className="mt-5 space-y-3 border-t border-rule pt-4 text-[13px] leading-snug text-graphite">
        <li>
          <span className="font-medium text-ink">Select a node</span> to see and change its settings here.
        </li>
        <li>
          <span className="font-medium text-ink">Test run</span> sends sample data through the flow — each step lights up
          on the canvas as it runs.
        </li>
        <li>
          <span className="font-medium text-ink">Runs</span> keeps every run, with each step’s input, output and attempts.
        </li>
      </ul>
    </div>
  );
}
