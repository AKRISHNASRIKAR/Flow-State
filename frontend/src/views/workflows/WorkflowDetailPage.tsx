import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { WorkflowStatusBadge } from '../../components/StatusBadge';
import { Button, ConfirmDialog, Spinner } from '../../components/ui';
import { FlowCanvas } from '../../features/flow/FlowCanvas';
import { RunsTab } from '../../features/executions/RunsTab';
import { TriggerPanel } from '../../features/trigger/TriggerPanel';
import { workflowsApi } from '../../lib/api';
import { ApiError } from '../../lib/api-client';
import { toast } from '../../lib/toast';

const TABS = ['flow', 'trigger', 'runs'] as const;
type Tab = (typeof TABS)[number];

export function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const workflowId = id!;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'flow';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const { data: workflow, isPending, error } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => workflowsApi.get(workflowId),
    retry: false,
  });

  // 404 (not owned / archived-and-gone) → back to the list with a toast.
  useEffect(() => {
    if (error instanceof ApiError && error.statusCode === 404) {
      toast.error('Workflow not found');
      navigate('/workflows', { replace: true });
    }
  }, [error, navigate]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
    void queryClient.invalidateQueries({ queryKey: ['workflows'] });
  };

  const update = useMutation({
    mutationFn: (body: { name?: string; description?: string }) => workflowsApi.update(workflowId, body),
    onSuccess: () => {
      invalidate();
      setEditingName(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const pause = useMutation({
    mutationFn: () => workflowsApi.pause(workflowId),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
  const resume = useMutation({
    mutationFn: () => workflowsApi.resume(workflowId),
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
  const clone = useMutation({
    mutationFn: () => workflowsApi.clone(workflowId),
    onSuccess: (created) => {
      toast.success(`Cloned as “${created.name}” (draft)`);
      navigate(`/workflows/${created.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => workflowsApi.remove(workflowId),
    onSuccess: () => {
      toast.success('Workflow deleted');
      navigate('/workflows');
    },
    onError: (e) => toast.error(e.message),
  });

  if (isPending || !workflow) return <Spinner label="Loading workflow…" />;

  const submitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== workflow.name) {
      update.mutate({ name: trimmed });
    } else {
      setEditingName(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={submitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitName();
              if (e.key === 'Escape') setEditingName(false);
            }}
            className="rounded-md border-0 px-2 py-1 text-xl font-semibold ring-2 ring-indigo-500"
          />
        ) : (
          <button
            type="button"
            className="rounded-md px-1 text-left text-xl font-semibold text-slate-900 hover:bg-slate-100"
            title="Click to rename"
            onClick={() => {
              setNameDraft(workflow.name);
              setEditingName(true);
            }}
          >
            {workflow.name}
          </button>
        )}
        <WorkflowStatusBadge status={workflow.status} />
        <div className="ml-auto flex gap-2">
          {workflow.status === 'ACTIVE' && (
            <Button size="sm" onClick={() => pause.mutate()} disabled={pause.isPending}>
              Pause
            </Button>
          )}
          {(workflow.status === 'PAUSED' || workflow.status === 'DRAFT') && (
            <Button size="sm" onClick={() => resume.mutate()} disabled={resume.isPending}>
              {workflow.status === 'DRAFT' ? 'Activate' : 'Resume'}
            </Button>
          )}
          <Button size="sm" onClick={() => clone.mutate()} disabled={clone.isPending}>
            Clone
          </Button>
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        </div>
      </div>

      {workflow.description && <p className="-mt-3 mb-6 text-sm text-slate-500">{workflow.description}</p>}

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSearchParams({ tab: t })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${
              tab === t
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'flow' && <FlowCanvas workflowId={workflowId} />}
      {tab === 'trigger' && <TriggerPanel workflowId={workflowId} />}
      {tab === 'runs' && <RunsTab workflowId={workflowId} />}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete “${workflow.name}”?`}
          body="This archives the workflow (soft delete) — it stops running and leaves your list, but its record and run history are kept."
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
