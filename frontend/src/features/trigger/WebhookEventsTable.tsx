import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { WebhookEventStatusBadge } from '../../components/StatusBadge';
import { Button, Pagination, Spinner } from '../../components/ui';
import { triggersApi } from '../../lib/api';
import { formatDateTime, formatJson, truncate } from '../../lib/format';

export function WebhookEventsTable({ workflowId }: { workflowId: string }) {
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['webhook-events', workflowId, page],
    queryFn: () => triggersApi.webhookEvents(workflowId, page),
    meta: { errorContext: 'Couldn’t load recent deliveries' },
  });

  if (isPending) return <Spinner label="Loading deliveries…" />;
  if (isError) {
    return (
      <Button size="sm" className="mt-4" onClick={() => void refetch()}>
        Try loading deliveries again
      </Button>
    );
  }
  if (data.data.length === 0) {
    return <p className="mt-4 text-sm text-muted">Nothing received yet.</p>;
  }

  return (
    <div className="mt-4">
      <table className="w-full text-left text-sm text-ink">
        <thead>
          <tr className="border-b border-rule text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-4 font-medium">Received</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 font-medium">Data</th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((event) => {
            const json = formatJson(event.payload);
            const expanded = expandedId === event.id;
            return (
              <tr key={event.id} className="border-b border-rule/70 align-top">
                <td className="whitespace-nowrap py-2.5 pr-4 text-graphite">{formatDateTime(event.receivedAt)}</td>
                <td className="py-2.5 pr-4">
                  <WebhookEventStatusBadge status={event.status} />
                </td>
                <td className="py-2.5">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : event.id)}
                    className="w-full text-left"
                    title={expanded ? 'Collapse' : 'Expand'}
                  >
                    {expanded ? (
                      <pre className="max-h-64 overflow-auto rounded-lg bg-paper p-3 font-mono text-xs text-ok ring-1 ring-rule">
                        {json}
                      </pre>
                    ) : (
                      <code className="font-mono text-xs text-muted">{truncate(json.replaceAll('\n', ' '), 80)}</code>
                    )}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} />
    </div>
  );
}
