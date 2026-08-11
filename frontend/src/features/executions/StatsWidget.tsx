import { useQuery } from '@tanstack/react-query';
import type { ExecutionStatus } from '@flowstate/api-types';
import { executionsApi } from '../../lib/api';
import { formatMs } from '../../lib/format';

// Status palette (semantic, fixed — validated for CVD separation; the gray
// steps are intentionally desaturated for the inert states, and every segment
// is paired with a visible label + count so color never carries meaning alone).
const STATUS_ORDER: ExecutionStatus[] = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'];
// Lifted a step from the light-mode values so each segment stays vivid on the
// neutral-900 card; the gray steps remain the desaturated pair.
const STATUS_COLOR: Record<ExecutionStatus, string> = {
  PENDING: '#94a3b8',
  RUNNING: '#3b82f6',
  SUCCEEDED: '#10b981',
  FAILED: '#ef4444',
  CANCELLED: '#64748b',
};

export function StatsWidget() {
  const { data: stats } = useQuery({
    queryKey: ['execution-stats'],
    queryFn: executionsApi.stats,
    refetchInterval: 15_000,
  });

  if (!stats) return null;

  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    count: stats.byStatus?.[status] ?? 0,
  }));
  const barTotal = byStatus.reduce((sum, s) => sum + s.count, 0);

  const running = stats.byStatus?.RUNNING ?? 0;

  return (
    <div className="mb-6 space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total runs" value={String(stats.total)} />
        <StatTile label="Last 24 h" value={String(stats.last24hTotal)} />
        <StatTile label="Avg duration" value={stats.avgDurationMs != null ? formatMs(stats.avgDurationMs) : '—'} />
        <StatTile
          label="Dead-lettered"
          value={String(stats.failedJobsInDLQ)}
          alert={stats.failedJobsInDLQ > 0 ? 'Failed runs waiting in the DLQ' : undefined}
        />
        <StatTile
          label="Rate limit left"
          value={stats.rateLimitRemaining != null ? String(stats.rateLimitRemaining) : '—'}
          alert={
            stats.rateLimitRemaining != null && stats.rateLimitRemaining < 10
              ? 'Close to the hourly execution cap'
              : undefined
          }
        />
      </div>

      {barTotal > 0 && (
        <div className="rounded-xl bg-neutral-900 p-5 shadow-lg ring-1 ring-neutral-800">
          <div className="flex h-5 w-full gap-0.5 overflow-hidden rounded-lg" role="img" aria-label="Runs by status">
            {byStatus
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.status}
                  title={`${s.status}: ${s.count}`}
                  style={{
                    width: `${Math.max(1.5, (s.count / barTotal) * 100)}%`,
                    backgroundColor: STATUS_COLOR[s.status],
                  }}
                />
              ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-300">
            {byStatus.map((s) => (
              <span key={s.status} className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[s.status] }} />
                {s.status.toLowerCase()}{' '}
                <span
                  className={`font-medium tabular-nums ${
                    s.status === 'RUNNING' && running > 0 ? 'animate-pulse text-blue-400' : 'text-neutral-100'
                  }`}
                >
                  {s.count}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, alert }: { label: string; value: string; alert?: string }) {
  return (
    <div className="rounded-xl bg-neutral-900 p-5 shadow-lg ring-1 ring-neutral-800">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? 'text-red-400' : 'text-white'}`}>
        {value}
      </p>
      {alert && <p className="mt-1 text-xs text-red-400">⚠ {alert}</p>}
    </div>
  );
}
