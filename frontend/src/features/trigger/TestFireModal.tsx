'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, FieldError, Modal, hintClass } from '../../components/ui';
import { triggersApi } from '../../lib/api';
import { toast } from '../../lib/toast';

/**
 * "Test run" — POST /workflows/:id/trigger/fire with sample data. From the
 * builder's Flow tab the run then plays out on the canvas itself
 * (`watchOnCanvas`); anywhere else it jumps to the Runs tab so the new run is
 * visible as it moves Queued → Running → Succeeded/Failed.
 */
export function TestFireModal({
  workflowId,
  onClose,
  watchOnCanvas = false,
}: {
  workflowId: string;
  onClose: () => void;
  watchOnCanvas?: boolean;
}) {
  const [payloadText, setPayloadText] = useState('{\n "example": "hello"\n}');
  const [jsonError, setJsonError] = useState<string | undefined>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const fire = useMutation({
    mutationFn: (payload: Record<string, unknown>) => triggersApi.fire(workflowId, { payload }),
    meta: { errorContext: 'Couldn’t start the test run' },
    onSuccess: () => {
      toast.success('Test run started', {
        description: watchOnCanvas ? 'Watch each step light up as it runs.' : 'It appears in Runs within a few seconds.',
      });
      void queryClient.invalidateQueries({ queryKey: ['executions'] });
      void queryClient.invalidateQueries({ queryKey: ['webhook-events', workflowId] });
      onClose();
      if (!watchOnCanvas) router.push(`/workflows/${workflowId}?tab=runs`);
    },
  });

  const submit = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadText.trim() === '' ? '{}' : payloadText);
    } catch {
      setJsonError('This isn’t valid JSON — check for missing quotes or commas.');
      return;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setJsonError('Use a JSON object, like {"user": "ada"}.');
      return;
    }
    setJsonError(undefined);
    fire.mutate(parsed as Record<string, unknown>);
  };

  return (
    <Modal title="Test run" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="tf-payload" className="mb-1.5 block text-sm font-medium text-ink">
            Sample data
          </label>
          <textarea
            id="tf-payload"
            rows={7}
            spellCheck={false}
            aria-invalid={jsonError !== undefined}
            className="block w-full rounded-lg border-0 bg-paper px-3 py-2 font-mono text-xs text-ok ring-1 ring-inset ring-rule focus:ring-2 focus:ring-inset focus:ring-signal"
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
          />
          <FieldError message={jsonError} />
          <p className={hintClass}>
            Your steps receive this as the trigger’s data — a step can use{' '}
            <code className="font-mono text-graphite">{'{{payload.example}}'}</code> to insert a value.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={fire.isPending}>
            {fire.isPending ? 'Starting…' : 'Start test run'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
