import { useQuery } from '@tanstack/react-query';
import { triggersApi } from '../../lib/api';

/**
 * "Insert variable" helper: any string config field supports
 * {{payload.field.path}} interpolation against the trigger payload. Surface
 * the keys from the most recent real event so users don't have to memorize
 * the syntax.
 */
export function VariableChips({ workflowId, onInsert }: { workflowId: string; onInsert: (text: string) => void }) {
  const { data } = useQuery({
    queryKey: ['webhook-events', workflowId, 'latest'],
    queryFn: () => triggersApi.webhookEvents(workflowId, 1, 1),
    staleTime: 30_000,
    // Only a hint: the deliveries table and runs list surface the same
    // failure, so a second toast here would just be noise.
    meta: { silent: true },
  });

  const payload = data?.data[0]?.payload;
  const paths = collectPaths(payload);

  return (
    <div className="rounded-lg bg-paper p-3 text-xs text-graphite ring-1 ring-rule">
      <p>
        Text fields accept{' '}
        <code className="rounded bg-paper-2 px-1 font-mono text-ink">{'{{payload.field}}'}</code>{' '}
        to insert the trigger’s data. After an HTTP request step, its reply is available as{' '}
        <code className="rounded bg-paper-2 px-1 font-mono text-ink">{'{{payload.http.body.…}}'}</code>.
      </p>
      {paths.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="py-0.5">From the last event:</span>
          {paths.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onInsert(`{{payload.${p}}}`)}
              className="rounded bg-signal-soft px-1.5 py-0.5 font-mono text-signal ring-1 ring-signal/30 hover:bg-signal-soft"
              title={`Insert {{payload.${p}}} into the focused field`}
            >
              {p}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-1">Send a test run once and the fields it received will appear here to click and insert.</p>
      )}
    </div>
  );
}

function collectPaths(payload: unknown): string[] {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const paths: string[] = [];
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    paths.push(key);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const nested of Object.keys(value as Record<string, unknown>)) {
        paths.push(`${key}.${nested}`);
      }
    }
    if (paths.length >= 24) break;
  }
  return paths.slice(0, 24);
}
