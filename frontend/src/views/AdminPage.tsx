'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button, EmptyState, Spinner, inputClass, labelClass } from '../components/ui';
import { adminApi, healthApi } from '../lib/api';
import { ApiError } from '../lib/api-client';
import { formatDateTime } from '../lib/format';
import { toast } from '../lib/toast';

// Operator credential, not a user session — sessionStorage on purpose so it
// dies with the tab, and it is only ever sent to /admin/* endpoints.
const SECRET_KEY = 'flowstate.adminSecret';

export function AdminPage() {
  const [secret, setSecret] = useState<string | null>(null);
  // sessionStorage doesn't exist during the server prerender — read it after
  // mount so server and first client render agree.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setSecret(sessionStorage.getItem(SECRET_KEY));
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  if (secret === null) {
    return <SecretPrompt onSubmit={(value) => {
      sessionStorage.setItem(SECRET_KEY, value);
      setSecret(value);
    }} />;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Admin · reliability</h1>
        <Button
          size="sm"
          onClick={() => {
            sessionStorage.removeItem(SECRET_KEY);
            setSecret(null);
          }}
        >
          Forget secret
        </Button>
      </div>
      <HealthStrip />
      <DlqTable
        secret={secret}
        onUnauthorized={() => {
          sessionStorage.removeItem(SECRET_KEY);
          setSecret(null);
          toast.error('Admin secret rejected — enter it again');
        }}
      />
    </div>
  );
}

function SecretPrompt({ onSubmit }: { onSubmit: (secret: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="mx-auto max-w-sm rounded-2xl bg-neutral-900 p-6 shadow-xl ring-1 ring-neutral-800">
      <h1 className="text-lg font-semibold text-white">Operator access</h1>
      <p className="mt-1 text-sm text-neutral-300">
        This panel talks to the <code className="font-mono text-xs">/admin</code> endpoints, which are protected by
        the server's <code className="font-mono text-xs">ADMIN_SECRET</code> (the{' '}
        <code className="font-mono text-xs">X-Admin-Secret</code> header) — not your user account. The secret is
        kept for this tab only.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
      >
        <div>
          <label htmlFor="admin-secret" className={labelClass}>
            Admin secret
          </label>
          <input id="admin-secret" type="password" className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Button type="submit" variant="primary" className="w-full justify-center" disabled={!value.trim()}>
          Unlock
        </Button>
      </form>
    </div>
  );
}

function HealthStrip() {
  const { data: health, isError } = useQuery({
    queryKey: ['health'],
    queryFn: healthApi.get,
    refetchInterval: 10_000,
    retry: false,
  });

  const indicator = (label: string, value: string, ok: boolean) => (
    <span className="inline-flex items-center gap-1.5 text-sm text-neutral-200">
      <span className={`size-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
      {label}: <span className="font-medium text-white">{value}</span>
    </span>
  );

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-neutral-900 p-4 shadow-xl ring-1 ring-neutral-800">
      {isError || !health ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-red-400">
          <span className="size-2 rounded-full bg-red-500" />
          {isError ? 'API unreachable' : 'Checking health…'}
        </span>
      ) : (
        <>
          {indicator('API', health.status, health.status === 'ok')}
          {indicator('Postgres', health.db, health.db === 'up')}
          {indicator('Redis', health.redis, health.redis === 'up')}
          <span className="text-sm text-neutral-200">
            Queue depth: <span className="font-medium tabular-nums">{health.queueDepth}</span>
          </span>
          <span className="text-sm text-neutral-200">
            Workers: <span className="font-medium">{typeof health.workers === 'object' ? JSON.stringify(health.workers) : String(health.workers)}</span>
          </span>
        </>
      )}
    </div>
  );
}

function DlqTable({ secret, onUnauthorized }: { secret: string; onUnauthorized: () => void }) {
  const queryClient = useQueryClient();

  const { data: jobs, isPending, error, refetch } = useQuery({
    queryKey: ['failed-jobs'],
    queryFn: () => adminApi.failedJobs(secret),
    retry: false,
  });

  const badSecret = error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403);
  useEffect(() => {
    if (badSecret) onUnauthorized();
  }, [badSecret, onUnauthorized]);

  const retry = useMutation({
    mutationFn: (jobId: string) => adminApi.retryFailedJob(secret, jobId),
    onSuccess: () => {
      // The job needs to actually re-run before it leaves the DLQ — tell the
      // operator to refresh rather than pretending it vanished.
      toast.success('Requeued — refresh in a bit to see whether it succeeded');
      void queryClient.invalidateQueries({ queryKey: ['failed-jobs'] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (badSecret) return null;

  return (
    <div className="rounded-2xl bg-neutral-900 p-5 shadow-xl ring-1 ring-neutral-800">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Dead-letter queue</h2>
          <p className="text-xs text-neutral-300">Executions that exhausted their retries. Requeueing runs them again from action #1.</p>
        </div>
        <Button size="sm" onClick={() => void refetch()}>
          Refresh
        </Button>
      </div>

      {isPending && <Spinner label="Loading failed jobs…" />}
      {error && !isPending && <EmptyState title="Couldn't load the DLQ" body={error.message} />}
      {jobs && jobs.length === 0 && <EmptyState title="DLQ is empty" body="No dead-lettered executions. All clear." />}

      {jobs && jobs.length > 0 && (
        <table className="w-full text-left text-sm text-neutral-200">
          <thead>
            <tr className="border-b border-neutral-800 text-xs uppercase tracking-wide text-neutral-400">
              <th className="py-2 pr-4 font-medium">Job</th>
              <th className="py-2 pr-4 font-medium">Execution</th>
              <th className="py-2 pr-4 font-medium">Error</th>
              <th className="py-2 pr-4 font-medium">Failed at</th>
              <th className="py-2 pr-4 font-medium">Attempts</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.jobId} className="border-b border-neutral-800/70 align-top">
                <td className="py-2.5 pr-4 font-mono text-xs text-neutral-300">{job.jobId}</td>
                <td className="py-2.5 pr-4 font-mono text-xs text-neutral-300">{job.executionId.slice(0, 8)}…</td>
                <td className="max-w-64 py-2.5 pr-4 text-xs text-red-400">{job.error}</td>
                <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-neutral-300">{formatDateTime(job.failedAt)}</td>
                <td className="py-2.5 pr-4 text-xs tabular-nums text-neutral-300">{job.attemptsMade}</td>
                <td className="py-2.5 text-right">
                  <Button size="sm" onClick={() => retry.mutate(job.jobId)} disabled={retry.isPending}>
                    Retry
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
