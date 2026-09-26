'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { workflowsApi } from '../../lib/api';
import { Button, FieldError, Modal, hintClass, inputClass, labelClass } from '../../components/ui';

// Mirrors the backend DTO (CreateWorkflowDto: name 1–120 chars, description ≤ 1000).
const schema = z.object({
  name: z.string().trim().min(1, 'Give your workflow a name').max(120, 'Keep the name under 120 characters'),
  description: z.string().max(1000, 'Keep the description under 1000 characters').optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateWorkflowModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      workflowsApi.create({
        name: values.name,
        description: values.description?.trim() ? values.description.trim() : undefined,
      }),
    meta: { errorContext: 'Couldn’t create the workflow' },
    onSuccess: async (wf) => {
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
      router.push(`/workflows/${wf.id}`);
    },
  });

  return (
    <Modal title="New workflow" onClose={onClose}>
      <form onSubmit={handleSubmit((values) => create.mutate(values))} className="space-y-4" noValidate>
        <div>
          <label htmlFor="wf-name" className={labelClass}>
            Name
          </label>
          <input
            id="wf-name"
            autoFocus
            className={inputClass}
            placeholder="e.g. Email me about new orders"
            {...register('name')}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <label htmlFor="wf-description" className={labelClass}>
            Description <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <textarea id="wf-description" rows={2} className={inputClass} {...register('description')} />
          <FieldError message={errors.description?.message} />
          <p className={hintClass}>Next you’ll choose what starts it and add its steps.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create and set up'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
