'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Workflow } from '@flowstate/api-types';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { WorkflowStatusBadge } from '../../components/StatusBadge';
import {
  Button,
  buttonClassName,
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
import { formatDateTime, timeAgo } from '../../lib/format';
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

  // Pagination is server-side, so this narrows the current page only - the
  // empty state below says so rather than implying a global search.
  const normalizedQuery = query.trim().toLowerCase();
  const visible = (data?.data ?? []).filter((wf) => (wf.name.toLowerCase().includes(normalizedQuery) || (wf.description ?? '').toLowerCase().includes(normalizedQuery)) && (status === 'ALL' || wf.status === status));
  const hasAny = (data?.meta.total ?? 0) > 0;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="label-caps text-muted">Workspace / Workflows</p>
          <h1 className="mt-3 font-serif text-[32px] leading-tight tracking-[-0.025em] text-ink sm:text-[40px]">
            {data && !hasAny ? 'Make room for better work.' : 'Your workflows'}
            {data && hasAny && <span className="ml-3 align-middle font-mono text-sm tracking-normal text-muted"><span aria-hidden>{data.meta.total}</span><span className="sr-only">{data.meta.total} {data.meta.total === 1 ? 'workflow' : 'workflows'} total</span></span>}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{data && !hasAny ? 'Give a task you repeat a place to run.' : 'Build, manage, and follow your repeatable work.'}</p>
        </div>
        <Button variant="primary" className="sm:mt-7" onClick={() => setShowCreate(true)}><Icon path={ICON_PATHS.plus} className="size-4" />New workflow</Button>
      </header>

      <section aria-label="Workflow library">
        {hasAny && <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs leading-relaxed text-muted">Page {data?.meta.page ?? page} of {data?.meta.totalPages ?? 1} · Status counts and search apply to this page</p>
            <div className="relative w-full sm:w-72">
              <Icon path={ICON_PATHS.search} className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input type="search" aria-label="Search workflows on this page" placeholder="Search this page…" className={`${inputClass} pl-10`} value={query} onChange={(event) => updateFilters({ q: event.target.value })} />
            </div>
          </div>
          <div className="mt-4 [&>div]:mb-0">
            <Tabs tabs={[{ id: 'ALL', label: `All (${data?.data.length ?? 0})` }, { id: 'ACTIVE', label: `On (${data?.data.filter((wf) => wf.status === 'ACTIVE').length ?? 0})` }, { id: 'DRAFT', label: `Draft (${data?.data.filter((wf) => wf.status === 'DRAFT').length ?? 0})` }, { id: 'PAUSED', label: `Paused (${data?.data.filter((wf) => wf.status === 'PAUSED').length ?? 0})` }]} active={status} onChange={(value) => updateFilters({ status: value })} />
          </div>
        </div>}
        {isPending && <div role="status" aria-label="Loading workflows" className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((key) => <div key={key} className="min-h-[200px] rounded-md border border-rule bg-card p-5"><p className="text-sm text-muted">Loading workflow…</p><div aria-hidden className="mt-6 h-6 w-2/3 animate-pulse rounded bg-paper-2" /><div aria-hidden className="mt-3 h-4 w-4/5 animate-pulse rounded bg-paper-2" /></div>)}</div>}
        {/* A failed refresh keeps the usable list; only a first-load failure needs a panel. */}
        {isError && !data && <EmptyState title="Couldn’t load your workflows" body="Check your connection and try again. Your workflows are still saved." action={<Button onClick={() => void refetch()}>Try again</Button>} />}
        {data && !hasAny && <EmptyState
          icon={<Icon path={ICON_PATHS.bolt} className="size-6" />}
          title="Create your first workflow"
          body={<ol className="mx-auto mt-2 max-w-sm list-decimal space-y-2 pl-5 text-left"><li>Choose what starts it: a webhook, a schedule, or a button.</li><li>Add the steps it should run, like a web request or an email.</li><li>Turn it on, then send a test run.</li></ol>}
        />}
        {data && hasAny && visible.length === 0 && <EmptyState
          title={query.trim() ? `Nothing on this page matches “${query.trim()}”` : 'No workflows with this status on this page'}
          body={data.meta.totalPages > 1 ? `The filter only searches page ${data.meta.page} of ${data.meta.totalPages}.` : undefined}
          action={<Button onClick={() => updateFilters({ q: '', status: 'ALL' })}>Clear filters</Button>}
        />}
        {data && visible.length > 0 && <>
          <ul key={status} className="grid animate-fade-up grid-cols-1 gap-4 [animation-duration:240ms] lg:grid-cols-2">
            {visible.map((wf) => <li key={wf.id} className="workflow-library-card group relative flex min-h-[200px] min-w-0 flex-col rounded-md border border-rule bg-card p-5 transition-colors duration-150 hover:border-faint focus-within:border-faint">
              <div className="mb-5">
                <div className="flex items-start gap-3">
                  <h2 className="min-w-0 flex-1 pt-1.5 font-serif text-2xl leading-tight text-ink">
                    {/* The link covers the card; controls keep their own hit targets above it. */}
                    <Link href={`/workflows/${wf.id}`} className="block break-words rounded-[3px] underline decoration-transparent underline-offset-4 after:absolute after:inset-0 after:rounded-md group-hover:decoration-rule focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal" title={wf.name}>{wf.name}</Link>
                  </h2>
                  <div className="relative z-20 shrink-0">
                    <Menu label={`More actions for ${wf.name}`} items={[
                      { label: 'Open', onSelect: () => router.push(`/workflows/${wf.id}`) },
                      { label: 'Duplicate', onSelect: () => clone.mutate(wf.id), disabled: clone.isPending },
                      { label: 'Delete…', onSelect: () => setDeleteTarget(wf), danger: true },
                    ]} />
                  </div>
                </div>
                {wf.description && <p className="mt-2 line-clamp-2 break-words text-sm leading-relaxed text-muted">{wf.description}</p>}
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-rule pt-3">
                <div className="relative z-10">
                  {wf.status === 'DRAFT' ? <div className="flex flex-wrap items-center gap-2"><WorkflowStatusBadge status="DRAFT" /><Link href={`/workflows/${wf.id}`} className={buttonClassName({ variant: 'ghost' })} aria-label={`Continue setup for ${wf.name}`}>Continue setup<Icon path={ICON_PATHS.arrowRight} className="size-4" /></Link></div> : <Switch
                    checked={wf.status === 'ACTIVE'}
                    label={wf.status === 'ACTIVE' ? 'On' : 'Paused'}
                    ariaLabel={`${wf.name}: ${wf.status === 'ACTIVE' ? 'on' : 'paused'}`}
                    disabled={setOn.isPending && setOn.variables?.id === wf.id}
                    onChange={(on) => setOn.mutate({ id: wf.id, on })}
                  />}
                </div>
                {/* This is the last edit, not the last run; the list API has no run timestamp. */}
                <time dateTime={wf.updatedAt} title={formatDateTime(wf.updatedAt)} className="text-xs tabular-nums text-muted">Edited {timeAgo(wf.updatedAt)}</time>
              </div>
            </li>)}
          </ul>
          <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={(p) => updateFilters({ page: String(p) })} />
        </>}
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
