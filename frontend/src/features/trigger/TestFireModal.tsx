'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, FormErrors, Modal } from '../../components/ui';
import { triggersApi } from '../../lib/api';
import { ApiError } from '../../lib/api-client';
import { toast } from '../../lib/toast';

/**
 * "Test this workflow" — POST /workflows/:id/trigger/fire with a custom JSON
 * payload, then jump straight to the Runs tab so the new execution is visible
 * as it moves PENDING → RUNNING → SUCCEEDED/FAILED.
 */
export function TestFireModal({ workflowId, onClose }: { workflowId: string; onClose: () => void }) {
  const [payloadText, setPayloadText] = useState('{}');
  const [errors, setErrors] = useState<string[]>([]);
  const router = useRouter();
  const queryClient = useQueryClient();

  const fire = useMutation({
    mutationFn: (payload: Record<string, unknown>) => triggersApi.fire(workflowId, { payload }),
    onSuccess: (result) => {
      toast.success(`Fired — event ${result.eventId.slice(0, 8)}…`);
      void queryClient.invalidateQueries({ queryKey: ['executions'] });
      void queryClient.invalidateQueries({ queryKey: ['webhook-events', workflowId] });
      router.push(`/workflows/${workflowId}?tab=runs`);
    },
    onError: (err) => {
      setErrors(err instanceof ApiError ? err.messages : ['Failed to fire the trigger']);
    },
  });

  const submit = () => {
    setErrors([]);
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(payloadText.trim() === '' ? '{}' : payloadText);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setErrors(['The payload must be a JSON object, e.g. {"user": "ada"}']);
        return;
      }
      payload = parsed as Record<string, unknown>;
    } catch {
      setErrors(['That is not valid JSON']);
      return;
    }
    fire.mutate(payload);
  };

  return (
    <Modal title="Test this workflow" onClose={onClose}>
      <div className="space-y-4">
        <FormErrors messages={errors} />
        <div>
          <label htmlFor="tf-payload" className="mb-1 block text-sm font-medium text-slate-700">
            Test payload (JSON)
          </label>
          <textarea
            id="tf-payload"
            rows={6}
            spellCheck={false}
            className="block w-full rounded-md border-0 px-3 py-2 font-mono text-xs text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            Actions can reference these fields with <code className="font-mono">{'{{payload.field}}'}</code>.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={fire.isPending}>
            {fire.isPending ? 'Firing…' : '▶ Fire trigger'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
