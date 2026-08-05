'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { workflowsApi } from '../../lib/api';
import { ApiError } from '../../lib/api-client';
import { Button, FieldError, FormErrors, inputClass, labelClass, Modal } from '../../components/ui';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateWorkflowModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [apiErrors, setApiErrors] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setApiErrors([]);
    try {
      const wf = await workflowsApi.create({
        name: values.name,
        description: values.description?.trim() ? values.description.trim() : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
      router.push(`/workflows/${wf.id}`);
    } catch (err) {
      setApiErrors(err instanceof ApiError ? err.messages : ['Failed to create workflow']);
    }
  };

  return (
    <Modal title="Create workflow" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormErrors messages={apiErrors} />
        <div>
          <label htmlFor="wf-name" className={labelClass}>
            Name
          </label>
          <input id="wf-name" className={inputClass} placeholder="e.g. Notify me on new signups" {...register('name')} />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <label htmlFor="wf-description" className={labelClass}>
            Description <span className="text-neutral-400">(optional)</span>
          </label>
          <textarea id="wf-description" rows={3} className={inputClass} {...register('description')} />
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
