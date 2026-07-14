import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Trigger, TriggerType, UpsertTriggerRequest } from '@flowstate/api-types';
import { useState } from 'react';
import { Button, ConfirmDialog, CopyField, Spinner } from '../../components/ui';
import { API_URL, ApiError } from '../../lib/api-client';
import { triggersApi, webhookUrlFor } from '../../lib/api';
import { toast } from '../../lib/toast';
import { ScheduledConfigForm } from './ScheduledConfigForm';
import { TestFireModal } from './TestFireModal';
import { WebhookEventsTable } from './WebhookEventsTable';

const TRIGGER_TYPES: { type: TriggerType; label: string; description: string }[] = [
  { type: 'WEBHOOK', label: 'Webhook', description: 'Fires when an external service POSTs a signed request' },
  { type: 'MANUAL', label: 'Manual', description: 'Fires only from the "Test workflow" button' },
  { type: 'SCHEDULED', label: 'Scheduled', description: 'Polls an endpoint on an interval and fires on change' },
];

export function TriggerPanel({ workflowId }: { workflowId: string }) {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<TriggerType | null>(null);
  const [confirmingType, setConfirmingType] = useState<UpsertTriggerRequest | null>(null);
  const [showTestFire, setShowTestFire] = useState(false);

  const triggerQuery = useQuery<Trigger | null>({
    queryKey: ['trigger', workflowId],
    queryFn: async () => {
      try {
        return await triggersApi.get(workflowId);
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) return null;
        throw err;
      }
    },
  });

  const upsert = useMutation({
    mutationFn: (body: UpsertTriggerRequest) => triggersApi.upsert(workflowId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trigger', workflowId] });
      setConfirmingType(null);
      setSelectedType(null);
      toast.success('Trigger saved');
    },
    onError: (e) => toast.error(e.message),
  });

  if (triggerQuery.isPending) return <Spinner label="Loading trigger…" />;
  const trigger = triggerQuery.data ?? null;

  const activeType = selectedType ?? trigger?.type ?? null;

  const saveType = (body: UpsertTriggerRequest) => {
    // Replacing a WEBHOOK trigger discards its secret permanently — confirm.
    if (trigger?.type === 'WEBHOOK' && body.type !== 'WEBHOOK') {
      setConfirmingType(body);
    } else {
      upsert.mutate(body);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-900">Trigger type</h2>
          {trigger && (
            <Button size="sm" variant="primary" onClick={() => setShowTestFire(true)}>
              ▶ Test this workflow
            </Button>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {TRIGGER_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => setSelectedType(t.type)}
              className={`rounded-lg p-3 text-left ring-1 transition ${
                activeType === t.type
                  ? 'bg-indigo-50 ring-2 ring-indigo-500'
                  : 'ring-slate-200 hover:ring-indigo-300'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                {t.label}
                {trigger?.type === t.type && (
                  <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    current
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">{t.description}</span>
            </button>
          ))}
        </div>

        {activeType === 'WEBHOOK' && (
          <WebhookConfig
            workflowId={workflowId}
            trigger={trigger?.type === 'WEBHOOK' ? trigger : null}
            onSave={() => saveType({ type: 'WEBHOOK' })}
            saving={upsert.isPending}
          />
        )}
        {activeType === 'MANUAL' && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <p className="text-sm text-slate-600">
              A manual workflow has no external trigger — it only runs when you press{' '}
              <span className="font-medium">“Test this workflow”</span> (or call{' '}
              <code className="rounded bg-slate-100 px-1 font-mono text-xs">POST /workflows/:id/trigger/fire</code>{' '}
              with your API token).
            </p>
            {trigger?.type !== 'MANUAL' && (
              <Button
                variant="primary"
                className="mt-4"
                disabled={upsert.isPending}
                onClick={() => saveType({ type: 'MANUAL' })}
              >
                {upsert.isPending ? 'Saving…' : 'Use manual trigger'}
              </Button>
            )}
          </div>
        )}
        {activeType === 'SCHEDULED' && (
          <ScheduledConfigForm
            trigger={trigger?.type === 'SCHEDULED' ? trigger : null}
            saving={upsert.isPending}
            onSave={(configuration) => saveType({ type: 'SCHEDULED', configuration })}
          />
        )}
      </section>

      {trigger?.type === 'WEBHOOK' && (
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Recent webhook events</h2>
          <p className="mt-1 text-xs text-slate-500">
            Every request to the webhook URL lands here with its processing outcome — this is the first place to
            look when a delivery doesn't run the workflow. Skips due to the concurrency cap and the hourly rate
            limit are flagged separately.
          </p>
          <WebhookEventsTable workflowId={workflowId} />
        </section>
      )}

      {showTestFire && <TestFireModal workflowId={workflowId} onClose={() => setShowTestFire(false)} />}
      {confirmingType && (
        <ConfirmDialog
          title="Replace the webhook trigger?"
          body="Switching the trigger type discards the current webhook signing secret permanently — external services using it will stop working, and there is no way to view or restore the old secret."
          confirmLabel="Replace trigger"
          danger
          busy={upsert.isPending}
          onConfirm={() => upsert.mutate(confirmingType)}
          onClose={() => setConfirmingType(null)}
        />
      )}
    </div>
  );
}

function WebhookConfig({
  workflowId,
  trigger,
  onSave,
  saving,
}: {
  workflowId: string;
  trigger: Trigger | null;
  onSave: () => void;
  saving: boolean;
}) {
  if (!trigger) {
    return (
      <div className="mt-5 border-t border-slate-100 pt-5">
        <p className="text-sm text-slate-600">
          Creating a webhook trigger generates a unique URL and an HMAC signing secret for this workflow.
        </p>
        <Button variant="primary" className="mt-4" disabled={saving} onClick={onSave}>
          {saving ? 'Creating…' : 'Create webhook trigger'}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Webhook URL</p>
        <CopyField value={webhookUrlFor(workflowId, API_URL)} />
        <p className="mt-1 text-xs text-slate-500">
          Point GitHub, Stripe, or any other service that can send JSON webhooks at this URL.
        </p>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Signing secret (masked)</p>
        <code className="inline-block rounded-md bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800">
          {trigger.secret ?? '—'}
        </code>
        <div className="mt-2 space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
          <p>
            <strong>The full secret was only visible when the trigger was created</strong> — the API never returns
            it again, and rotating it isn't supported yet, so changing it means deleting and recreating this
            trigger (which invalidates the URL's existing senders).
          </p>
          <p>
            Senders must sign each request body with HMAC-SHA256 using this secret and send it as{' '}
            <code className="font-mono">X-FlowForge-Signature: sha256=&lt;hex digest&gt;</code>. Unsigned or
            mis-signed requests are rejected.
          </p>
        </div>
      </div>
    </div>
  );
}
