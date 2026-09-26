'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Action } from '@flowstate/api-types';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { WorkflowStatusBadge } from '../../components/StatusBadge';
import { Button, ConfirmDialog, EmptyState, Icon, ICON_PATHS, Menu, Spinner, Switch, Tabs } from '../../components/ui';
import { RunsTab } from '../../features/executions/RunsTab';
import { FlowCanvas } from '../../features/flow/FlowCanvas';
import { StepDrawer } from '../../features/flow/StepDrawer';
import { TestFireModal } from '../../features/trigger/TestFireModal';
import { TriggerDrawer } from '../../features/trigger/TriggerDrawer';
import { useTrigger } from '../../features/workflow/queries';
import { SetupChecklist } from '../../features/workflow/SetupChecklist';
import { workflowsApi } from '../../lib/api';
import { ApiError } from '../../lib/api-client';
import { toastError } from '../../lib/errors';
import { toast } from '../../lib/toast';

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

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
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
              className="min-w-0 flex-1 rounded-lg border-0 bg-neutral-900 px-2 py-1 text-xl font-semibold text-white ring-2 ring-indigo-500"
            />
          ) : (
            <button
              type="button"
              className="min-w-0 truncate rounded-lg px-1 text-left text-xl font-semibold text-white hover:bg-neutral-800"
              title="Click to rename"
              onClick={() => {
                setNameDraft(workflow.name);
                setEditingName(true);
              }}
            >
              {workflow.name}
            </button>
          )}
          {!isOn && <WorkflowStatusBadge status={workflow.status} />}
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={isOn}
            label={isOn ? 'On' : 'Off'}
            disabled={setOn.isPending}
            onChange={(on) => setOn.mutate(on)}
          />
          <span title={testRunBlocker}>
            <Button variant="primary" size="sm" onClick={() => setShowTestRun(true)} disabled={testRunBlocker !== undefined}>
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

      {workflow.description && <p className="-mt-3 mb-6 text-sm text-neutral-400">{workflow.description}</p>}

      <SetupChecklist
        workflow={workflow}
        onChooseTrigger={() => setPanel({ kind: 'trigger' })}
        onAddStep={() => setPanel({ kind: 'step', action: null })}
        onTurnOn={() => setOn.mutate(true)}
        onTestRun={() => setShowTestRun(true)}
        turningOn={setOn.isPending}
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'flow' && (
        <FlowCanvas
          workflowId={workflowId}
          onEditTrigger={() => setPanel({ kind: 'trigger' })}
          onEditStep={(action) => setPanel({ kind: 'step', action })}
        />
      )}
      {tab === 'runs' && <RunsTab workflowId={workflowId} />}

      {panel?.kind === 'trigger' && <TriggerDrawer workflowId={workflowId} onClose={() => setPanel(null)} />}
      {panel?.kind === 'step' && (
        <StepDrawer
          // Remount per step so the form starts from that step's settings.
          key={panel.action?.id ?? 'new'}
          workflowId={workflowId}
          action={panel.action}
          onClose={() => setPanel(null)}
        />
      )}
      {showTestRun && <TestFireModal workflowId={workflowId} onClose={() => setShowTestRun(false)} />}
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
