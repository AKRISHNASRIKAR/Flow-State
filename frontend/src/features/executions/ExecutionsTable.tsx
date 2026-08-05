'use client';

import { useQuery } from '@tanstack/react-query';
import type { ExecutionStatus } from '@flowstate/api-types';
import Link from 'next/link';
import { useState } from 'react';
import { ExecutionStatusBadge } from '../../components/StatusBadge';
import { EmptyState, Pagination, Spinner, inputClass } from '../../components/ui';
import { executionsApi } from '../../lib/api';
import { formatDateTime, formatDuration } from '../../lib/format';

const STATUSES: ExecutionStatus[] = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'];

// Row accent — a redundant cue alongside the status badge in each row, so the
// in-flight and failed rows are findable while scanning a long page.
const ROW_ACCENT: Record<ExecutionStatus, string> = {
  PENDING: 'border-l-amber-500',
  RUNNING: 'border-l-blue-500',
  SUCCEEDED: 'border-l-emerald-500',
  FAILED: 'border-l-red-500',
  CANCELLED: 'border-l-neutral-600',
};

interface ExecutionsTableProps {
  /** Pre-filter to one workflow (the per-workflow Runs tab). */
  workflowId?: string;
  /** Extra filter controls rendered inline (e.g. a workflow picker). */
  extraFilters?: React.ReactNode;
}

export function ExecutionsTable({ workflowId, extraFilters }: ExecutionsTableProps) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ExecutionStatus | ''>('');

  const { data, isPending } = useQuery({
    queryKey: ['executions', { workflowId, status, page }],
    queryFn: () =>
      executionsApi.list({ page, status: status === '' ? undefined : status, workflowId }),
    // Poll every 3s ONLY while a visible row is still in flight — an idle
    // dashboard tab stops hammering the API once everything is terminal.
    refetchInterval: (query) => {
      const rows = query.state.data?.data;
      return rows?.some((e) => e.status === 'PENDING' || e.status === 'RUNNING') ? 3000 : false;
    },
  });

  return (
    <div className="rounded-2xl bg-neutral-900 p-5 shadow-xl ring-1 ring-neutral-800">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-44">
          <select
            aria-label="Filter by status"
            className={inputClass}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ExecutionStatus | '');
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {extraFilters}
      </div>

      {isPending && <Spinner label="Loading executions…" />}

      {data && data.data.length === 0 && (
        <EmptyState
          title="No executions yet"
          body='Fire a workflow (the "Test this workflow" button on its Trigger tab) and its runs will show up here.'
        />
      )}

      {data && data.data.length > 0 && (
        <>
          <table className="w-full text-left text-sm text-neutral-200">
            <thead>
              <tr className="border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-400">
                <th className="py-2 pl-3 pr-4 font-medium">Workflow</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Started</th>
                <th className="py-2 pr-4 font-medium">Duration</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.data.map((e) => (
                <tr
                  key={e.id}
                  className={`border-b border-l-4 border-b-neutral-800/70 transition-colors duration-150 hover:bg-neutral-800/50 ${ROW_ACCENT[e.status]}`}
                >
                  <td className="max-w-52 truncate py-2.5 pl-3 pr-4 font-medium text-white">{e.workflowName}</td>
                  <td className="py-2.5 pr-4">
                    <ExecutionStatusBadge status={e.status} />
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-neutral-300">{formatDateTime(e.startedAt)}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 tabular-nums text-neutral-300">
                    {formatDuration(e.startedAt, e.finishedAt)}
                  </td>
                  <td className="py-2.5 text-right">
                    <Link href={`/executions/${e.id}`} className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
                      Details →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
