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
  });

  const payload = data?.data[0]?.payload;
  const paths = collectPaths(payload);

  return (
    <div className="rounded-lg bg-black p-3 text-xs text-neutral-300 ring-1 ring-neutral-800">
      <p>
        String fields support{' '}
        <code className="rounded bg-neutral-800 px-1 font-mono text-neutral-100">{'{{payload.field}}'}</code>{' '}
        templates resolved against the trigger payload.
      </p>
      {paths.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="py-0.5">From the last event:</span>
          {paths.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onInsert(`{{payload.${p}}}`)}
              className="rounded bg-indigo-500/10 px-1.5 py-0.5 font-mono text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/20"
              title={`Insert {{payload.${p}}} into the focused field`}
            >
              {p}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-1">No events received yet — fire the workflow once to see available payload keys here.</p>
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
