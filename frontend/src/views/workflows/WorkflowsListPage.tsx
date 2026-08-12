'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Workflow } from '@flowstate/api-types';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { WorkflowStatusBadge } from '../../components/StatusBadge';
import { Button, ConfirmDialog, EmptyState, Pagination, Spinner, inputClass } from '../../components/ui';
import { workflowsApi } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { toast } from '../../lib/toast';
import { CreateWorkflowModal } from './CreateWorkflowModal';

const SEARCH_PATH = 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z';
const MENU_PATH =
  'M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z';

export function WorkflowsListPage() {
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);
  const [query, setQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
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

  // Pagination is server-side, so this narrows the current page only — the
  // hint below the field says so rather than implying a global search.
  const normalizedQuery = query.trim().toLowerCase();
  const visible = (data?.data ?? []).filter((wf) => wf.name.toLowerCase().includes(normalizedQuery));

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Your Workflows</h1>
          <p className="mt-1.5 text-sm text-neutral-300">
            Each workflow is one trigger and an ordered chain of actions. Open one to edit its chain or watch its runs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={SEARCH_PATH} />
            </svg>
            <input
              type="search"
              aria-label="Filter workflows by name"
              placeholder="Filter by name…"
              className={`${inputClass} w-56 pl-9`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            + Create workflow
          </Button>
        </div>
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

      {data && data.data.length > 0 && visible.length === 0 && (
        <EmptyState
          title={`No workflow on this page matches “${query.trim()}”`}
          body={
            data.meta.totalPages > 1
              ? `The filter only searches page ${data.meta.page} of ${data.meta.totalPages}.`
              : undefined
          }
          action={
            <Button onClick={() => setQuery('')}>Clear filter</Button>
          }
        />
      )}

      {data && visible.length > 0 && (
        <>
          <div
            className={
              visible.length === 1
                ? 'grid gap-6 grid-cols-1 max-w-4xl'
                : visible.length === 2
                ? 'grid gap-6 grid-cols-1 sm:grid-cols-2 max-w-5xl'
                : 'grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            }
          >
            {visible.map((wf) => (
              <div
                key={wf.id}
                className={`group relative flex flex-col rounded-2xl bg-neutral-900 shadow-xl ring-1 ring-neutral-800 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_-5px_rgba(99,102,241,0.2)] hover:ring-indigo-500/50 ${
                  openMenuId === wf.id ? 'z-50' : 'z-10'
                } ${visible.length === 1 ? 'p-8 min-h-[200px]' : 'p-6'}`}
              >
                {/* Dot-grid texture. It stays under the content by DOM order
                    alone — every row below is positioned too, so it paints on
                    top without needing a z-index. Deliberately not giving those
                    rows one: a positioned row with a z-index becomes a stacking
                    context, which would trap the action menu's z-20 inside the
                    header and let the footer paint over it. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl bg-[radial-gradient(#404040_1px,transparent_1px)] opacity-30 [background-size:16px_16px]"
                />
                <div className="relative flex items-start gap-4">
                  <span
                    aria-hidden
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-xl font-bold uppercase text-indigo-400 ring-1 ring-indigo-500/30"
                  >
                    {wf.name.trim().charAt(0) || '?'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/workflows/${wf.id}`}
                        className="truncate text-base font-semibold text-white transition-colors hover:text-indigo-400"
                        title={wf.name}
                      >
                        {wf.name}
                      </Link>
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          aria-label={`Actions for ${wf.name}`}
                          aria-expanded={openMenuId === wf.id}
                          onClick={() => setOpenMenuId(openMenuId === wf.id ? null : wf.id)}
                          className="rounded-lg p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d={MENU_PATH} />
                          </svg>
                        </button>
                        {openMenuId === wf.id && (
                          <>
                            {/* Click-catcher: closes the menu on any outside click
                                without a document-level listener. */}
                            <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} aria-hidden />
                            <ul className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-xl bg-neutral-800 py-1 text-sm shadow-2xl ring-1 ring-neutral-700">
                              {wf.status === 'ACTIVE' && (
                                <MenuItem
                                  label="Pause"
                                  disabled={pause.isPending}
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    pause.mutate(wf.id);
                                  }}
                                />
                              )}
                              {wf.status === 'PAUSED' && (
                                <MenuItem
                                  label="Resume"
                                  disabled={resume.isPending}
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    resume.mutate(wf.id);
                                  }}
                                />
                              )}
                              <MenuItem
                                label="Clone"
                                disabled={clone.isPending}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  clone.mutate(wf.id);
                                }}
                              />
                              <MenuItem
                                label="Delete"
                                danger
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setDeleteTarget(wf);
                                }}
                              />
                            </ul>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="mt-1.5 line-clamp-2 min-h-10 text-sm text-neutral-300">
                      {wf.description || <span className="italic text-neutral-500">No description</span>}
                    </p>
                  </div>
                </div>
                <div className="relative mt-5 flex items-center justify-between gap-2 border-t border-neutral-800 pt-4">
                  <WorkflowStatusBadge status={wf.status} />
                  {/* `updatedAt` is the last edit, not the last run — the list
                      endpoint returns no run timestamp, so the label says so. */}
                  <span className="truncate text-xs text-neutral-400">Updated {formatDateTime(wf.updatedAt)}</span>
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

function MenuItem({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`w-full px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:text-neutral-500 ${
          danger ? 'text-red-400 hover:bg-red-500/10' : 'text-neutral-200 hover:bg-neutral-700 hover:text-white'
        }`}
      >
        {label}
      </button>
    </li>
  );
}
