import { useQuery } from '@tanstack/react-query';
import type { ExecutionStatus } from '@flowstate/api-types';
import { executionsApi } from '../../lib/api';
import { formatMs } from '../../lib/format';

// Status palette (semantic, fixed — validated for CVD separation; the gray
// steps are intentionally desaturated for the inert states, and every segment
// is paired with a visible label + count so color never carries meaning alone).
const STATUS_ORDER: ExecutionStatus[] = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'];
const STATUS_COLOR: Record<ExecutionStatus, string> = {
  PENDING: '#64748b',
  RUNNING: '#2563eb',
  SUCCEEDED: '#059669',
  FAILED: '#dc2626',
  CANCELLED: '#94a3b8',
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

  return (
    <div className="mb-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total runs" value={String(stats.total)} />
        <StatTile label="Last 24 h" value={String(stats.last24hTotal)} />
        <StatTile label="Avg duration" value={stats.avgDurationMs != null ? formatMs(stats.avgDurationMs) : '—'} />
        <StatTile
          label="Dead-lettered"
          value={String(stats.failedJobsInDLQ)}
          alert={stats.failedJobsInDLQ > 0 ? 'Failed runs waiting in the DLQ — see /admin' : undefined}
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
        <div className="mt-5">
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Runs by status">
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
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            {byStatus.map((s) => (
              <span key={s.status} className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[s.status] }} />
                {s.status.toLowerCase()} <span className="font-medium tabular-nums">{s.count}</span>
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
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${alert ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
      {alert && <p className="mt-0.5 text-xs text-red-600">⚠ {alert}</p>}
    </div>
  );
}
