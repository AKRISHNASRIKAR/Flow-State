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
  Tabs,
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
  const query = searchParams.get('q') ?? '';
  const statusParam = searchParams.get('status');
  const status = statusParam === 'ACTIVE' || statusParam === 'DRAFT' || statusParam === 'PAUSED' ? statusParam : 'ALL';
  const updateFilters = (values: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(values).forEach(([key, value]) => value && value !== 'ALL' ? params.set(key, value) : params.delete(key));
    router.replace(`/workflows?${params.toString()}`, { scroll: false });
  };
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
  const visible = (data?.data ?? []).filter((wf) => (wf.name.toLowerCase().includes(normalizedQuery) || (wf.description ?? '').toLowerCase().includes(normalizedQuery)) && (status === 'ALL' || wf.status === status));
  const hasAny = (data?.meta.total ?? 0) > 0;

  return (
    <div>
      <DashboardHeading eyebrow="Workspace / Workflows" title="Make room for better work." description="Give the tasks you repeat a place to run. Your workflows connect one starting event to a sequence of useful steps." />

      <section aria-label="Workflow library">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div><h2 className="font-serif text-2xl">Your workflows <span className="ml-2 font-mono text-sm text-muted">{data?.meta.total ?? '—'}</span></h2><p className="mt-2 text-sm text-muted">Build, manage, and follow your repeatable work.</p></div>
        <Button variant="primary" size="lg" onClick={() => setShowCreate(true)}><Icon path={ICON_PATHS.plus} className="size-4" />New workflow</Button>
      </div>
      {hasAny && <div className="mb-8 rounded-md border border-rule bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted">{hasAny ? 'Status on this page' : 'One starting event. Useful steps. Work, done.'}</p>
          <div className="relative w-full sm:w-72"><Icon path={ICON_PATHS.search} className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input type="search" aria-label="Find workflows on this page" placeholder="Find on this page…" className={`${inputClass} pl-10`} value={query} onChange={(event) => updateFilters({ q: event.target.value })} /></div>
        </div>
        <div className="mt-4 [&>div]:mb-0">
          <Tabs tabs={[{ id: 'ALL', label: `All (${data?.data.length ?? 0})` }, { id: 'ACTIVE', label: `On (${data?.data.filter((wf) => wf.status === 'ACTIVE').length ?? 0})` }, { id: 'DRAFT', label: `Draft (${data?.data.filter((wf) => wf.status === 'DRAFT').length ?? 0})` }, { id: 'PAUSED', label: `Paused (${data?.data.filter((wf) => wf.status === 'PAUSED').length ?? 0})` }]} active={status} onChange={(value) => updateFilters({ status: value })} />
        </div>
      </div>}
      {isPending && <div role="status" aria-label="Loading workflows" className="grid gap-5 lg:grid-cols-2">{[0, 1, 2, 3].map((key) => <div key={key} className="min-h-64 rounded-md border border-rule bg-card p-6"><p className="text-sm text-muted">Loading workflow…</p><div aria-hidden className="mt-8 h-6 w-2/3 animate-pulse rounded bg-paper-2" /><div aria-hidden className="mt-4 h-4 w-4/5 animate-pulse rounded bg-paper-2" /></div>)}</div>}
      {/* With data already on screen, a failed refresh is just the toast —
          the list stays usable. The panel is for when there's nothing to show. */}
      {isError && !data && (
        <EmptyState
          title="Couldn’t load your workflows"
          body="Check your connection and try again. Your workflows are still saved."
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

        />
      )}

      {data && hasAny && visible.length === 0 && (
        <EmptyState
          title={query.trim() ? `Nothing on this page matches “${query.trim()}”` : 'No workflows with this status on this page'}
          body={
            data.meta.totalPages > 1 ? `The filter only searches page ${data.meta.page} of ${data.meta.totalPages}.` : undefined
          }
          action={<Button onClick={() => updateFilters({ q: '', status: 'ALL' })}>Clear filters</Button>}
        />
      )}

      {data && visible.length > 0 && (
        <>
          <ul key={status} className="grid animate-fade-up grid-cols-1 gap-5 [animation-duration:240ms] lg:grid-cols-2">
            {visible.map((wf) => (
              <li
                key={wf.id}
                className="workflow-library-card group relative flex flex-col rounded-md border border-rule bg-card p-4 sm:p-6 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-faint hover:shadow-[0_8px_24px_-16px_var(--color-ink)]"
              >
                <div className="mb-5 flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-[4px] border border-rule bg-paper text-ink"><LogoMark className="size-6" /></span><WorkflowStatusBadge status={wf.status} /></div>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {/* The whole card is clickable through this link's ::after,
                        while the switch and menu stay independently clickable
                        above it (they're positioned with a z-index). */}
                    <Link
                      href={`/workflows/${wf.id}`}
                      className="block break-words font-serif text-[28px] leading-tight text-ink underline decoration-transparent underline-offset-4 transition-colors after:absolute after:inset-0 after:rounded-md group-hover:decoration-rule"
                      title={wf.name}
                    >
                      {wf.name}
                    </Link>
                    <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted">
                      {wf.description || (wf.status === 'DRAFT' ? 'Open this draft to configure its starting event and steps.' : 'Open to edit its steps or review its recorded runs.')}
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
                <div className="mt-6 flex items-center gap-2 text-sm font-medium text-graphite"><span>{wf.status === 'DRAFT' ? 'Continue setup' : 'Open workflow'}</span><Icon path={ICON_PATHS.arrowRight} className="size-4 transition-transform group-hover:translate-x-1" /></div>
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
            onPage={(p) => updateFilters({ page: String(p) })}
          />
        </>
      )}

      </section>
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
