import { useQuery } from '@tanstack/react-query';
import { EXECUTION_STATUS_LABEL } from '../../components/StatusBadge';
import type { ExecutionStatus } from '@flowstate/api-types';
import { executionsApi } from '../../lib/api';
import { formatMs } from '../../lib/format';

// Every segment is paired with a label and count; state remains readable
// without color, including for readers with color-vision differences.
const STATUS_ORDER: ExecutionStatus[] = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'];
// The same semantic state colors appear in the run list and canvas.
const STATUS_COLOR: Record<ExecutionStatus, string> = {
  PENDING: 'var(--color-wait)',
  RUNNING: 'var(--color-signal)',
  SUCCEEDED: 'var(--color-ok)',
  FAILED: 'var(--color-fail)',
  CANCELLED: 'var(--color-faint)',
};

// Statistics stay fresh only while there is work in flight.
const STATS_REFRESH_MS = 15_000;

export function StatsWidget() {
  const { data: stats } = useQuery({
    queryKey: ['execution-stats'],
    queryFn: executionsApi.stats,
    refetchInterval: (query) => {
      const statuses = query.state.data?.byStatus;
      return (statuses?.PENDING ?? 0) + (statuses?.RUNNING ?? 0) > 0 ? STATS_REFRESH_MS : false;
    },
    meta: { errorContext: 'Couldn’t load run statistics' },
  });

  if (!stats) return null;

  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    count: stats.byStatus?.[status] ?? 0,
  }));
  const barTotal = byStatus.reduce((sum, s) => sum + s.count, 0);

  const running = stats.byStatus?.RUNNING ?? 0;

  return (
    <div className="mb-9 space-y-5">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[5px] border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total runs" value={String(stats.total)} />
        <StatTile label="Last 24 h" value={String(stats.last24hTotal)} />
        <StatTile label="Avg duration" value={stats.avgDurationMs != null ? formatMs(stats.avgDurationMs) : '—'} />
        <StatTile
          label="Gave up after retries"
          value={String(stats.failedJobsInDLQ)}
          alert={stats.failedJobsInDLQ > 0 ? 'Runs that failed every retry attempt' : undefined}
        />
        <StatTile
          label="Runs left this hour"
          value={stats.rateLimitRemaining != null ? String(stats.rateLimitRemaining) : '—'}
          alert={
            stats.rateLimitRemaining != null && stats.rateLimitRemaining < 10
              ? 'Close to the hourly limit of 100 runs'
              : undefined
          }
        />
      </div>

      {barTotal > 0 && (
        <div className="bg-card p-5 sm:p-6">
          <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-[2px]" role="img" aria-label="Runs by status">
            {byStatus
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.status}
                  title={`${EXECUTION_STATUS_LABEL[s.status]}: ${s.count}`}
                  style={{
                    width: `${Math.max(1.5, (s.count / barTotal) * 100)}%`,
                    backgroundColor: STATUS_COLOR[s.status],
                  }}
                />
              ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-graphite">
            {byStatus.map((s) => (
              <span key={s.status} className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[s.status] }} />
                {EXECUTION_STATUS_LABEL[s.status]}{' '}
                <span
                  className={`font-medium tabular-nums ${
                    s.status === 'RUNNING' && running > 0 ? 'animate-pulse text-signal' : 'text-ink'
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
    <div className="bg-card p-5 sm:p-6">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-4 font-serif text-4xl tabular-nums ${alert ? 'text-fail' : 'text-ink'}`}>
        {value}
      </p>
      {alert && <p className="mt-1 text-xs text-fail">⚠ {alert}</p>}
    </div>
  );
}
