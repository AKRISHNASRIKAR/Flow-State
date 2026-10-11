'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Workflow } from '@flowstate/api-types';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { DashboardHeading } from '../../components/DashboardHeading';
import { LogoMark } from '../../components/Logo';
import { WorkflowStatusBadge } from '../../components/StatusBadge';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  ICON_PATHS,
  Menu,
  Pagination,
  Spinner,
  Switch,
  inputClass,
} from '../../components/ui';
import { workflowsApi } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { toast } from '../../lib/toast';
import { CreateWorkflowModal } from './CreateWorkflowModal';

export function WorkflowsListPage() {
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);
  const [query, setQuery] = useState('');
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['workflows', page],
    queryFn: () => workflowsApi.list(page),
    meta: { errorContext: 'Couldn’t load your workflows' },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workflows'] });

  const setOn = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => (on ? workflowsApi.resume(id) : workflowsApi.pause(id)),
    meta: { errorContext: 'Couldn’t change the workflow' },
    onSuccess: (wf) => {
      void invalidate();
      toast.success(wf.status === 'ACTIVE' ? `“${wf.name}” is on` : `“${wf.name}” is paused`);
    },
  });
  const clone = useMutation({
    mutationFn: workflowsApi.clone,
    meta: { errorContext: 'Couldn’t duplicate the workflow' },
    onSuccess: (created) => {
      void invalidate();
      toast.success(`Duplicated as “${created.name}”`, { description: 'The copy starts as a draft.' });
      router.push(`/workflows/${created.id}`);
    },
  });
  const remove = useMutation({
    mutationFn: workflowsApi.remove,
    meta: { errorContext: 'Couldn’t delete the workflow' },
    onSuccess: () => {
      void invalidate();
      setDeleteTarget(null);
      toast.success('Workflow deleted');
    },
  });

  // Pagination is server-side, so this narrows the current page only — the
  // empty state below says so rather than implying a global search.
  const normalizedQuery = query.trim().toLowerCase();
  const visible = (data?.data ?? []).filter((wf) => wf.name.toLowerCase().includes(normalizedQuery));
  const hasAny = (data?.meta.total ?? 0) > 0;

  return (
    <div>
      <DashboardHeading eyebrow="Workspace / Workflows" title="Make room for better work." description="Give the tasks you repeat a place to run. Your workflows connect one starting event to a sequence of useful steps." landscape action={<Button variant="primary" size="lg" onClick={() => setShowCreate(true)}><Icon path={ICON_PATHS.plus} className="size-4" />New workflow</Button>} />

      {data && hasAny && <div className="mb-9 grid grid-cols-3 divide-x divide-rule border-y border-rule py-5">
        {[
          ['On', data.data.filter((wf) => wf.status === 'ACTIVE').length],
          ['Draft', data.data.filter((wf) => wf.status === 'DRAFT').length],
          ['Paused', data.data.filter((wf) => wf.status === 'PAUSED').length],
        ].map(([label, count]) => <div key={label} className="px-4 first:pl-0 sm:px-6"><p className="label-caps text-muted">{label}</p><p className="mt-3 font-serif text-4xl tabular-nums">{count}</p><p className="mt-1 text-[11px] text-muted">On this page</p></div>)}
      </div>}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="font-serif text-2xl">Your workflow library</h2><p className="mt-1 text-xs text-muted">{hasAny ? `${data?.meta.total} workflows · open one to build or follow its runs` : 'A trigger, a few steps, and one less thing to do by hand.'}</p></div>
        {hasAny && <div className="relative w-full sm:w-64"><Icon path={ICON_PATHS.search} className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input type="search" aria-label="Filter workflows by name" placeholder="Find on this page…" className={`${inputClass} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)} /></div>}
      </div>

      {isPending && <Spinner label="Loading workflows…" />}
      {/* With data already on screen, a failed refresh is just the toast —
          the list stays usable. The panel is for when there's nothing to show. */}
      {isError && !data && (
        <EmptyState
          title="Couldn’t load your workflows"
          body="The details are in the notification. You can try again once the problem is fixed."
          action={<Button onClick={() => void refetch()}>Try again</Button>}
        />
      )}

      {data && !hasAny && (
        <EmptyState
          icon={<Icon path={ICON_PATHS.bolt} className="size-6" />}
          title="Create your first workflow"
          body={
            <ol className="mx-auto mt-2 max-w-sm list-decimal space-y-1 pl-5 text-left">
              <li>Choose what starts it — a webhook, a schedule, or a button.</li>
              <li>Add the steps it should run, like a web request or an email.</li>
              <li>Turn it on, then send a test run.</li>
            </ol>
          }
          action={
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              New workflow
            </Button>
          }
        />
      )}

      {data && hasAny && visible.length === 0 && (
        <EmptyState
          title={`Nothing on this page matches “${query.trim()}”`}
          body={
            data.meta.totalPages > 1 ? `The filter only searches page ${data.meta.page} of ${data.meta.totalPages}.` : undefined
          }
          action={<Button onClick={() => setQuery('')}>Clear filter</Button>}
        />
      )}

      {data && visible.length > 0 && (
        <>
          <ul className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {visible.map((wf) => (
              <li
                key={wf.id}
                className="workflow-library-card group relative flex flex-col rounded-[5px] border border-rule bg-card p-6 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-faint hover:shadow-[0_8px_24px_-16px_var(--color-ink)]"
              >
                <div className="mb-6 flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-[4px] border border-rule bg-paper text-ink"><LogoMark className="size-6" /></span><WorkflowStatusBadge status={wf.status} /></div>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {/* The whole card is clickable through this link's ::after,
                        while the switch and menu stay independently clickable
                        above it (they're positioned with a z-index). */}
                    <Link
                      href={`/workflows/${wf.id}`}
                      className="block truncate font-serif text-[28px] leading-tight text-ink underline decoration-transparent underline-offset-4 transition-colors after:absolute after:inset-0 after:rounded-md group-hover:decoration-rule"
                      title={wf.name}
                    >
                      {wf.name}
                    </Link>
                    <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted">
                      {wf.description || 'Choose a trigger and add the steps that carry your work forward.'}
                    </p>
                  </div>
                  {/* z-20, one above the switches: an open menu can hang over
                      the card below it, and must paint over that card too. */}
                  <div className="relative z-20">
                    <Menu
                      label={`More actions for ${wf.name}`}
                      items={[
                        { label: 'Open', onSelect: () => router.push(`/workflows/${wf.id}`) },
                        { label: 'Duplicate', onSelect: () => clone.mutate(wf.id), disabled: clone.isPending },
                        { label: 'Delete…', onSelect: () => setDeleteTarget(wf), danger: true },
                      ]}
                    />
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
                  <div className="relative z-10">
                    <Switch
                      checked={wf.status === 'ACTIVE'}
                      label={wf.status === 'ACTIVE' ? 'On' : wf.status === 'DRAFT' ? 'Draft' : 'Paused'}
                      disabled={setOn.isPending && setOn.variables?.id === wf.id}
                      onChange={(on) => setOn.mutate({ id: wf.id, on })}
                    />
                  </div>
                  <div className="flex min-w-0 items-center gap-2">

                    {/* updatedAt is the last edit, not the last run — the list
                        endpoint has no run timestamp, so the label says so. */}
                    <span className="truncate text-xs text-faint" title={formatDateTime(wf.updatedAt)}>
                      Edited {formatDateTime(wf.updatedAt)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
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
          body="It stops running and disappears from your list. Its past runs are kept."
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
