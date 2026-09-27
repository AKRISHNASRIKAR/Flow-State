'use client';

import { useQuery } from '@tanstack/react-query';
import type { ExecutionStatus } from '@flowstate/api-types';
import Link from 'next/link';
import { useState } from 'react';
import { EXECUTION_STATUS_LABEL, ExecutionStatusBadge } from '../../components/StatusBadge';
import { Button, EmptyState, Pagination, Spinner, inputClass } from '../../components/ui';
import { executionsApi } from '../../lib/api';
import { formatDateTime, formatDuration } from '../../lib/format';

const STATUSES: ExecutionStatus[] = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'];

// Row accent — a redundant cue alongside the status badge in each row, so the
// in-flight and failed rows are findable while scanning a long page.
const ROW_ACCENT: Record<ExecutionStatus, string> = {
  PENDING: 'border-l-wait',
  RUNNING: 'border-l-signal',
  SUCCEEDED: 'border-l-ok',
  FAILED: 'border-l-fail',
  CANCELLED: 'border-l-faint',
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

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['executions', { workflowId, status, page }],
    queryFn: () =>
      executionsApi.list({ page, status: status === '' ? undefined : status, workflowId }),
    // Poll every 3s ONLY while a visible row is still in flight — an idle
    // dashboard tab stops hammering the API once everything is terminal.
    refetchInterval: (query) => {
      const rows = query.state.data?.data;
      return rows?.some((e) => e.status === 'PENDING' || e.status === 'RUNNING') ? 3000 : false;
    },
    meta: { errorContext: 'Couldn’t load runs' },
  });

  return (
    <div className="rounded-md bg-card p-5 shadow-xl ring-1 ring-rule">
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
                {EXECUTION_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        {extraFilters}
      </div>

      {isPending && <Spinner label="Loading runs…" />}

      {isError && !data && (
        <EmptyState
          title="Couldn’t load runs"
          body="The details are in the notification."
          action={<Button onClick={() => void refetch()}>Try again</Button>}
        />
      )}

      {data && data.data.length === 0 && (
        <EmptyState
          title={status === '' ? 'No runs yet' : `No ${EXECUTION_STATUS_LABEL[status].toLowerCase()} runs`}
          body={
            status === ''
              ? 'Each time a workflow is triggered, a run appears here with the result of every step. Press Test run on a workflow to try one.'
              : 'Try a different status filter.'
          }
        />
      )}

      {data && data.data.length > 0 && (
        <>
          <table className="w-full text-left text-sm text-ink">
            <thead>
              <tr className="border-b border-rule text-xs uppercase tracking-wide text-muted">
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
                  className={`border-b border-l-4 border-b-rule/70 transition-colors duration-150 hover:bg-paper-2 ${ROW_ACCENT[e.status]}`}
                >
                  <td className="max-w-52 truncate py-2.5 pl-3 pr-4 font-medium text-ink">{e.workflowName}</td>
                  <td className="py-2.5 pr-4">
                    <ExecutionStatusBadge status={e.status} />
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-graphite">{formatDateTime(e.startedAt)}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 tabular-nums text-graphite">
                    {formatDuration(e.startedAt, e.finishedAt)}
                  </td>
                  <td className="py-2.5 text-right">
                    <Link href={`/executions/${e.id}`} className="text-xs font-medium text-signal hover:text-signal">
                      View steps →
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
