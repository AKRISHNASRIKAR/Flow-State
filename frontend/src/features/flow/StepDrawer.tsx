import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Action, ActionType } from '@flowstate/api-types';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { actionsApi } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Button, Drawer, FieldError, inputClass, labelClass } from '../../components/ui';
import {
  ACTION_META,
  ACTION_TYPES,
  actionSchemas,
  configurationToForm,
  formToConfiguration,
} from './action-meta';
import { KeyValueEditor } from './KeyValueEditor';
import { VariableChips } from './VariableChips';

interface StepDrawerProps {
  workflowId: string;
  /** Existing action → edit mode; null → create mode (starts at the type picker). */
  action: Action | null;
  onClose: () => void;
}

/** Side panel for adding a step (starting at the type picker) or editing one. */
export function StepDrawer({ workflowId, action, onClose }: StepDrawerProps) {
  const [type, setType] = useState<ActionType | null>(
    action ? (action.type as ActionType) : null,
  );

  if (type === null) {
    return (
      <Drawer title="Add a step" subtitle="What should happen when this workflow runs?" onClose={onClose}>
        <div className="space-y-2">
          {ACTION_TYPES.map((meta) => (
            <button
              key={meta.type}
              type="button"
              onClick={() => setType(meta.type)}
              className="flex w-full items-start gap-3 rounded-xl bg-neutral-900 p-4 text-left ring-1 ring-neutral-800 transition hover:bg-neutral-800 hover:ring-indigo-500/40"
            >
              <span className="text-xl" aria-hidden>
                {meta.icon}
              </span>
              <span>
                <span className="block text-sm font-medium text-white">{meta.label}</span>
                <span className="block text-xs text-neutral-400">{meta.description}</span>
              </span>
            </button>
          ))}
        </div>
      </Drawer>
    );
  }

  return (
    <ActionForm
      key={type}
      workflowId={workflowId}
      type={type}
      action={action}
      onBack={action ? null : () => setType(null)}
      onClose={onClose}
    />
  );
}

interface ActionFormProps {
  workflowId: string;
  type: ActionType;
  action: Action | null;
  /** Present in create mode: return to the type picker. */
  onBack: (() => void) | null;
  onClose: () => void;
}

function ActionForm({ workflowId, type, action, onBack, onClose }: ActionFormProps) {
  const meta = ACTION_META[type];
  const queryClient = useQueryClient();
  // Tracks which text field last had focus so "insert variable" knows where
  // to append the {{payload.x}} snippet.
  const lastFocusedField = useRef<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    resolver: zodResolver(actionSchemas[type]),
    defaultValues: configurationToForm(type, action?.configuration ?? {}),
  });

  const save = useMutation({
    mutationFn: (configuration: Record<string, unknown>) =>
      action
        ? actionsApi.update(workflowId, action.id, { configuration })
        : actionsApi.create(workflowId, { type, configuration }),
    meta: { errorContext: action ? 'Couldn’t save the step' : 'Couldn’t add the step' },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['actions', workflowId] });
      toast.success(action ? 'Step saved' : 'Step added');
      onClose();
    },
  });

  const insertVariable = (text: string) => {
    const field = lastFocusedField.current;
    if (!field) return;
    const current = getValues(field);
    setValue(field, `${typeof current === 'string' ? current : ''}${text}`, { shouldDirty: true });
  };

  const trackFocus = (name: string) => ({ onFocus: () => (lastFocusedField.current = name) });

  const textField = (name: string, label: string, opts?: { textarea?: boolean; placeholder?: string; optional?: boolean }) => (
    <div>
      <label htmlFor={`af-${name}`} className={labelClass}>
        {label} {opts?.optional && <span className="text-neutral-400">(optional)</span>}
      </label>
      {opts?.textarea ? (
        <textarea
          id={`af-${name}`}
          rows={3}
          className={inputClass}
          placeholder={opts?.placeholder}
          {...register(name)}
          {...trackFocus(name)}
        />
      ) : (
        <input
          id={`af-${name}`}
          className={inputClass}
          placeholder={opts?.placeholder}
          {...register(name)}
          {...trackFocus(name)}
        />
      )}
      <FieldError message={errors[name]?.message as string | undefined} />
    </div>
  );

  const onSubmit = (values: Record<string, unknown>) => {
    save.mutate(formToConfiguration(type, values));
  };

  return (
    <Drawer
      title={`${meta.icon} ${meta.label}`}
      subtitle={meta.description}
      onClose={onClose}
      footer={
        <div className="flex justify-between gap-2">
          <div>{onBack && <Button onClick={onBack}>← Choose a different step</Button>}</div>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            {/* Outside the form (it's in the pinned footer), so it targets it by id. */}
            <Button type="submit" form="step-form" variant="primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : action ? 'Save step' : 'Add step'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="step-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>

        {type === 'LOG_MESSAGE' && (
          <>
            {textField('message', 'Message', { textarea: true, placeholder: 'New signup: {{payload.email}}' })}
            <div>
              <label htmlFor="af-level" className={labelClass}>
                Level
              </label>
              <select id="af-level" className={inputClass} {...register('level')}>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
              </select>
            </div>
          </>
        )}

        {type === 'DELAY' && (
          <div>
            <label htmlFor="af-seconds" className={labelClass}>
              Seconds to wait
            </label>
            <input id="af-seconds" type="number" min={1} className={inputClass} {...register('seconds')} />
            <FieldError message={errors.seconds?.message as string | undefined} />
          </div>
        )}

        {type === 'HTTP_REQUEST' && (
          <>
            <div className="flex gap-2">
              <div className="w-32">
                <label htmlFor="af-method" className={labelClass}>
                  Method
                </label>
                <select id="af-method" className={inputClass} {...register('method')}>
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">{textField('url', 'URL', { placeholder: 'https://api.example.com/notify' })}</div>
            </div>
            <div>
              <span className={labelClass}>Headers</span>
              <Controller
                control={control}
                name="headers"
                render={({ field }) => (
                  <KeyValueEditor
                    rows={(field.value as { key: string; value: string }[]) ?? []}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            {textField('body', 'Request body', { textarea: true, optional: true, placeholder: '{"text": "{{payload.message}}"}' })}
          </>
        )}

        {type === 'SEND_EMAIL' && (
          <>
            {textField('to', 'To', { placeholder: 'user@example.com or {{payload.email}}' })}
            {textField('subject', 'Subject')}
            {textField('body', 'Body', { textarea: true })}
            {textField('fromName', 'From name', { optional: true })}
          </>
        )}

        {type === 'TELEGRAM_NOTIFY' && (
          <>
            {textField('chatId', 'Chat ID', { placeholder: '-1001234567890' })}
            {textField('message', 'Message', { textarea: true })}
            <div>
              <label htmlFor="af-parseMode" className={labelClass}>
                Parse mode <span className="text-neutral-400">(optional)</span>
              </label>
              <select id="af-parseMode" className={inputClass} {...register('parseMode')}>
                <option value="">Plain text</option>
                <option value="HTML">HTML</option>
                <option value="Markdown">Markdown</option>
              </select>
            </div>
          </>
        )}

        <VariableChips workflowId={workflowId} onInsert={insertVariable} />
      </form>
    </Drawer>
  );
}
