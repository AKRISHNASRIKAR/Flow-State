'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Trigger, TriggerType, UpsertTriggerRequest } from '@flowstate/api-types';
import { useState } from 'react';
import { Button, ConfirmDialog, CopyField, Drawer, Icon, Notice, Spinner } from '../../components/ui';
import { API_URL } from '../../lib/api-client';
import { triggersApi, webhookUrlFor } from '../../lib/api';
import { toast } from '../../lib/toast';
import { useTrigger } from '../workflow/queries';
import { ScheduledConfigForm } from './ScheduledConfigForm';
import { WebhookEventsTable } from './WebhookEventsTable';

// 24x24 Heroicons outline path data — globe-alt, clock, cursor-arrow-rays.
export const TRIGGER_ICONS: Record<TriggerType, string> = {
  WEBHOOK:
    'M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418',
  SCHEDULED: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  MANUAL:
    'M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18m-.166 5.834 1.591 1.591M12 18v2.25M7.757 17.925l-1.591 1.591M6 12H3.75m4.007-4.243L6.166 6.166',
};

// Described by what the user wants to happen, not by mechanism.
export const TRIGGER_OPTIONS: { type: TriggerType; label: string; description: string }[] = [
  {
    type: 'WEBHOOK',
    label: 'When another app sends a webhook',
    description: 'GitHub, Stripe, or anything that can POST JSON to a URL.',
  },
  {
    type: 'SCHEDULED',
    label: 'When something changes at a URL',
    description: 'FlowState checks a URL on a schedule and runs when the response changes.',
  },
  {
    type: 'MANUAL',
    label: 'Only when I press Test run',
    description: 'No outside trigger — handy while you’re building.',
  },
];

export function TriggerDrawer({ workflowId, onClose }: { workflowId: string; onClose: () => void }) {
  const triggerQuery = useTrigger(workflowId);
  const trigger = triggerQuery.data ?? null;

  return (
    <Drawer
      title="What starts this workflow"
      subtitle="Every workflow has exactly one trigger. Its steps run each time it fires."
      onClose={onClose}
    >
      {triggerQuery.isPending ? (
        <Spinner label="Loading…" />
      ) : triggerQuery.isError ? (
        <div className="py-8 text-center">
          <p className="text-sm text-graphite">Couldn’t load the current trigger.</p>
          <Button className="mt-3" onClick={() => void triggerQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <TriggerEditor workflowId={workflowId} trigger={trigger} onDone={onClose} />
      )}
    </Drawer>
  );
}

function TriggerEditor({
  workflowId,
  trigger,
  onDone,
}: {
  workflowId: string;
  trigger: Trigger | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<TriggerType | null>(trigger?.type ?? null);
  const [confirmingReplace, setConfirmingReplace] = useState<UpsertTriggerRequest | null>(null);

  const upsert = useMutation({
    mutationFn: (body: UpsertTriggerRequest) => triggersApi.upsert(workflowId, body),
    meta: { errorContext: 'Couldn’t save the trigger' },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['trigger', workflowId] });
      setConfirmingReplace(null);
      toast.success('Trigger saved');
      // A new webhook's URL is the thing the user needs next — keep the
      // panel open to show it. Everything else is done.
      if (saved.type !== 'WEBHOOK') onDone();
    },
  });

  const save = (body: UpsertTriggerRequest) => {
    // Replacing a WEBHOOK trigger discards its secret permanently — confirm.
    if (trigger?.type === 'WEBHOOK' && body.type !== 'WEBHOOK') {
      setConfirmingReplace(body);
    } else {
      upsert.mutate(body);
    }
  };

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-ink">Run this workflow…</legend>
        <div className="space-y-2">
          {TRIGGER_OPTIONS.map((option) => {
            const selected = selectedType === option.type;
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => setSelectedType(option.type)}
                aria-pressed={selected}
                className={`flex w-full items-start gap-3 rounded-md p-4 text-left ring-1 transition ${
                  selected
                    ? 'bg-signal-soft ring-2 ring-signal'
                    : 'bg-card ring-rule hover:bg-paper-2 hover:ring-rule'
                }`}
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                    selected ? 'bg-signal text-paper' : 'bg-paper-2 text-graphite'
                  }`}
                >
                  <Icon path={TRIGGER_ICONS[option.type]} />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-medium text-ink">
                    {option.label}
                    {trigger?.type === option.type && (
                      <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-semibold text-ok ring-1 ring-ok/30">
                        Current
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {selectedType === 'WEBHOOK' && (
        <WebhookSection
          workflowId={workflowId}
          trigger={trigger?.type === 'WEBHOOK' ? trigger : null}
          saving={upsert.isPending}
          onCreate={() => save({ type: 'WEBHOOK' })}
        />
      )}

      {selectedType === 'SCHEDULED' && (
        <div className="border-t border-rule pt-6">
          <ScheduledConfigForm
            trigger={trigger?.type === 'SCHEDULED' ? trigger : null}
            saving={upsert.isPending}
            onSave={(configuration) => save({ type: 'SCHEDULED', configuration })}
          />
        </div>
      )}

      {selectedType === 'MANUAL' && (
        <div className="space-y-4 border-t border-rule pt-6">
          <p className="text-sm text-graphite">
            The workflow runs only when you press <span className="font-medium text-ink">Test run</span> at the top of
            the page.
          </p>
          {trigger?.type !== 'MANUAL' && (
            <Button variant="primary" disabled={upsert.isPending} onClick={() => save({ type: 'MANUAL' })}>
              {upsert.isPending ? 'Saving…' : 'Use this trigger'}
            </Button>
          )}
        </div>
      )}

      {confirmingReplace && (
        <ConfirmDialog
          title="Replace the webhook?"
          body="Apps sending to this workflow’s webhook URL will be rejected from now on, and its signing secret is discarded for good. Switching back later creates a new secret."
          confirmLabel="Replace trigger"
          danger
          busy={upsert.isPending}
          onConfirm={() => upsert.mutate(confirmingReplace)}
          onClose={() => setConfirmingReplace(null)}
        />
      )}
    </div>
  );
}

function WebhookSection({
  workflowId,
  trigger,
  saving,
  onCreate,
}: {
  workflowId: string;
  trigger: Trigger | null;
  saving: boolean;
  onCreate: () => void;
}) {
  if (!trigger) {
    return (
      <div className="space-y-4 border-t border-rule pt-6">
        <p className="text-sm text-graphite">
          FlowState will create a unique URL for this workflow, plus a secret the sending app uses to sign its requests.
        </p>
        <Button variant="primary" disabled={saving} onClick={onCreate}>
          {saving ? 'Creating…' : 'Create webhook URL'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 border-t border-rule pt-6">
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Webhook URL</p>
        <CopyField value={webhookUrlFor(workflowId, API_URL)} label="webhook URL" />
        <p className="mt-1.5 text-xs text-muted">Paste this into the other app’s webhook settings.</p>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Signing secret</p>
        <code className="inline-block rounded-lg bg-paper px-3 py-2 font-mono text-xs text-ink ring-1 ring-rule">
          {trigger.secret ?? '—'}
        </code>
        <div className="mt-3">
          <Notice tone="warning">
            <p>
              Only the first few characters are ever shown — FlowState doesn’t return the full secret, even right
              after creating it, and it can’t be changed without replacing this trigger.
            </p>
            <p>
              The sending app must sign each request body with HMAC-SHA256 and send it as{' '}
              <code className="font-mono">X-FlowForge-Signature: sha256=&lt;hex&gt;</code>. Unsigned requests are
              rejected.
            </p>
          </Notice>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-ink">Recent deliveries</p>
        <p className="mt-0.5 text-xs text-muted">
          Every request to the URL and what happened to it. If a delivery didn’t start a run, the reason is here.
        </p>
        <WebhookEventsTable workflowId={workflowId} />
      </div>
    </div>
  );
}
