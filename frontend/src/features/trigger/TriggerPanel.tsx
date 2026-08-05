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

// 24x24 Heroicons outline path data, inlined — globe-alt, cursor-arrow-rays,
// clock. There is no icon package in this workspace.
const TRIGGER_ICONS = {
  WEBHOOK:
    'M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418',
  MANUAL:
    'M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18m-.166 5.834 1.591 1.591M12 18v2.25M7.757 17.925l-1.591 1.591M6 12H3.75m4.007-4.243L6.166 6.166',
  SCHEDULED: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
} as const;

const TRIGGER_TYPES: { type: TriggerType; label: string; description: string; icon: string }[] = [
  {
    type: 'WEBHOOK',
    label: 'Webhook',
    description: 'Fires when an external service POSTs a signed request',
    icon: TRIGGER_ICONS.WEBHOOK,
  },
  {
    type: 'MANUAL',
    label: 'Manual',
    description: 'Fires only from the "Test workflow" button',
    icon: TRIGGER_ICONS.MANUAL,
  },
  {
    type: 'SCHEDULED',
    label: 'Scheduled',
    description: 'Polls an endpoint on an interval and fires on change',
    icon: TRIGGER_ICONS.SCHEDULED,
  },
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
      <section className="rounded-2xl bg-neutral-900 p-6 shadow-xl ring-1 ring-neutral-800">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-white">Trigger type</h2>
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
              aria-pressed={activeType === t.type}
              className={`rounded-xl p-5 text-left ring-1 transition ${
                activeType === t.type
                  ? 'bg-indigo-500/10 shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-500'
                  : 'bg-black/50 ring-neutral-800 hover:bg-neutral-800 hover:ring-indigo-500/40'
              }`}
            >
              <span
                className={`mb-3 flex size-9 items-center justify-center rounded-lg ${
                  activeType === t.type
                    ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                    : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden className="size-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
                </svg>
              </span>
              <span className="flex items-center gap-2 text-sm font-medium text-white">
                {t.label}
                {trigger?.type === t.type && (
                  <span className="rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    current
                  </span>
                )}
              </span>
              <span className="mt-1 block text-xs text-neutral-300">{t.description}</span>
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
          <div className="mt-5 border-t border-neutral-800 pt-5">
            <p className="text-sm text-neutral-300">
              A manual workflow has no external trigger — it only runs when you press{' '}
              <span className="font-medium text-neutral-100">“Test this workflow”</span> (or call{' '}
              <code className="rounded bg-black px-1 font-mono text-xs text-neutral-200 ring-1 ring-neutral-800">
                POST /workflows/:id/trigger/fire
              </code>{' '}
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
        <section className="rounded-2xl bg-neutral-900 p-6 shadow-xl ring-1 ring-neutral-800">
          <h2 className="text-sm font-semibold text-white">Recent webhook events</h2>
          <p className="mt-1 text-xs text-neutral-300">
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
      <div className="mt-5 border-t border-neutral-800 pt-5">
        <p className="text-sm text-neutral-300">
          Creating a webhook trigger generates a unique URL and an HMAC signing secret for this workflow.
        </p>
        <Button variant="primary" className="mt-4" disabled={saving} onClick={onSave}>
          {saving ? 'Creating…' : 'Create webhook trigger'}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4 border-t border-neutral-800 pt-5">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Webhook URL</p>
        <CopyField value={webhookUrlFor(workflowId, API_URL)} />
        <p className="mt-1 text-xs text-neutral-300">
          Point GitHub, Stripe, or any other service that can send JSON webhooks at this URL.
        </p>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Signing secret (masked)</p>
        <code className="inline-block rounded-lg bg-black px-3 py-2 font-mono text-xs text-neutral-200 ring-1 ring-neutral-800">
          {trigger.secret ?? '—'}
        </code>
        <div className="mt-2 space-y-1 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-300/90 ring-1 ring-amber-500/20">
          <p>
            <strong className="text-amber-200">The API never returns the full secret</strong> — not even at creation time — so don't expect
            to retrieve it here later. Rotating it isn't supported yet either: changing the secret means deleting
            and recreating this trigger, which breaks the URL's existing senders.
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
