'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Workflow } from '@flowstate/api-types';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { WorkflowStatusBadge } from '../../components/StatusBadge';
import { Button, ConfirmDialog, EmptyState, Pagination, Spinner } from '../../components/ui';
import { workflowsApi } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { toast } from '../../lib/toast';
import { CreateWorkflowModal } from './CreateWorkflowModal';

export function WorkflowsListPage() {
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data, isPending, isError } = useQuery({
    queryKey: ['workflows', page],
    queryFn: () => workflowsApi.list(page),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workflows'] });

  const pause = useMutation({
    mutationFn: workflowsApi.pause,
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
  const resume = useMutation({
    mutationFn: workflowsApi.resume,
    onSuccess: invalidate,
    onError: (e) => toast.error(e.message),
  });
  const clone = useMutation({
    mutationFn: workflowsApi.clone,
    onSuccess: (created) => {
      void invalidate();
      toast.success(`Cloned as “${created.name}” (draft)`);
      router.push(`/workflows/${created.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: workflowsApi.remove,
    onSuccess: () => {
      void invalidate();
      setDeleteTarget(null);
      toast.success('Workflow deleted');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Workflows</h1>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          + Create workflow
        </Button>
      </div>

      {isPending && <Spinner label="Loading workflows…" />}
      {isError && <EmptyState title="Couldn't load workflows" body="Check that the API is running and try again." />}

      {data && data.data.length === 0 && (
        <EmptyState
          title="No workflows yet"
          body="A workflow is a trigger plus an ordered chain of actions. Create your first one to get started."
          action={
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              Create workflow
            </Button>
          }
        />
      )}

      {data && data.data.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.data.map((wf) => (
              <div
                key={wf.id}
                className="flex flex-col rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/workflows/${wf.id}`}
                    className="truncate text-sm font-semibold text-slate-900 hover:text-indigo-600"
                    title={wf.name}
                  >
                    {wf.name}
                  </Link>
                  <WorkflowStatusBadge status={wf.status} />
                </div>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">
                  {wf.description || <span className="italic text-slate-400">No description</span>}
                </p>
                <p className="mt-2 text-xs text-slate-400">Updated {formatDateTime(wf.updatedAt)}</p>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {wf.status === 'ACTIVE' && (
                    <Button size="sm" onClick={() => pause.mutate(wf.id)} disabled={pause.isPending}>
                      Pause
                    </Button>
                  )}
                  {wf.status === 'PAUSED' && (
                    <Button size="sm" onClick={() => resume.mutate(wf.id)} disabled={resume.isPending}>
                      Resume
                    </Button>
                  )}
                  <Button size="sm" onClick={() => clone.mutate(wf.id)} disabled={clone.isPending}>
                    Clone
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleteTarget(wf)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            onPage={(p) => router.replace(`/workflows?page=${p}`)}
          />
        </>
      )}

      {showCreate && <CreateWorkflowModal onClose={() => setShowCreate(false)} />}
      {deleteTarget && (
        <ConfirmDialog
          title={`Delete “${deleteTarget.name}”?`}
          body="This archives the workflow (soft delete) — it disappears from your list and stops running, but the underlying record and its run history are kept."
          confirmLabel="Delete workflow"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
