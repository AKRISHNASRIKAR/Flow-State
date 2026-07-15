import { zodResolver } from '@hookform/resolvers/zod';
import type { Trigger } from '@flowstate/api-types';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, FieldError, inputClass, labelClass } from '../../components/ui';
import { headersToRows, rowsToHeaders } from '../flow/action-meta';
import { KeyValueEditor } from '../flow/KeyValueEditor';

// Mirrors the backend's PollingConfig validation — interval floor is 30s.
const schema = z.object({
  interval: z.coerce.number({ invalid_type_error: 'Enter an interval in seconds' }).min(30, 'Minimum interval is 30 seconds'),
  endpoint: z.string().url('Enter a valid URL to poll'),
  method: z.enum(['GET', 'POST']),
  headers: z.array(z.object({ key: z.string(), value: z.string() })),
  stateKey: z.string().optional(),
  changeMode: z.enum(['any', 'specific_field', 'array_length']),
});

type FormValues = z.infer<typeof schema>;

interface ScheduledConfigFormProps {
  trigger: Trigger | null;
  saving: boolean;
  onSave: (configuration: Record<string, unknown>) => void;
}

export function ScheduledConfigForm({ trigger, saving, onSave }: ScheduledConfigFormProps) {
  const config = (trigger?.configuration ?? {}) as Record<string, unknown>;

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      interval: typeof config.interval === 'number' ? config.interval : 60,
      endpoint: typeof config.endpoint === 'string' ? config.endpoint : '',
      method: config.method === 'POST' ? 'POST' : 'GET',
      headers: headersToRows(config.headers),
      stateKey: typeof config.stateKey === 'string' ? config.stateKey : '',
      changeMode: (['any', 'specific_field', 'array_length'] as const).includes(
        config.changeMode as 'any',
      )
        ? (config.changeMode as FormValues['changeMode'])
        : 'any',
    },
  });

  const changeMode = watch('changeMode');

  const onSubmit = (values: FormValues) => {
    const headers = rowsToHeaders(values.headers);
    onSave({
      interval: values.interval,
      endpoint: values.endpoint,
      method: values.method,
      ...(headers ? { headers } : {}),
      ...(values.stateKey?.trim() ? { stateKey: values.stateKey.trim() } : {}),
      changeMode: values.changeMode,
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4 border-t border-slate-100 pt-5" noValidate>
      <p className="text-sm text-slate-600">
        The scheduler polls an endpoint on an interval and fires the workflow when the response changes.
      </p>
      <div className="flex gap-3">
        <div className="w-40">
          <label htmlFor="sc-interval" className={labelClass}>
            Interval (seconds)
          </label>
          <input id="sc-interval" type="number" min={30} className={inputClass} {...register('interval')} />
          <FieldError message={errors.interval?.message} />
        </div>
        <div className="w-32">
          <label htmlFor="sc-method" className={labelClass}>
            Method
          </label>
          <select id="sc-method" className={inputClass} {...register('method')}>
            <option>GET</option>
            <option>POST</option>
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="sc-endpoint" className={labelClass}>
            Endpoint URL
          </label>
          <input id="sc-endpoint" className={inputClass} placeholder="https://api.example.com/items" {...register('endpoint')} />
          <FieldError message={errors.endpoint?.message} />
        </div>
      </div>
      <div>
        <span className={labelClass}>Headers</span>
        <Controller
          control={control}
          name="headers"
          render={({ field }) => <KeyValueEditor rows={field.value} onChange={field.onChange} />}
        />
      </div>
      <div className="flex gap-3">
        <div className="w-56">
          <label htmlFor="sc-changeMode" className={labelClass}>
            Fire when
          </label>
          <select id="sc-changeMode" className={inputClass} {...register('changeMode')}>
            <option value="any">Anything in the response changes</option>
            <option value="specific_field">A specific field changes</option>
            <option value="array_length">The array length changes</option>
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="sc-stateKey" className={labelClass}>
            Field to watch{' '}
            <span className="text-slate-400">{changeMode === 'specific_field' ? '' : '(optional)'}</span>
          </label>
          <input
            id="sc-stateKey"
            className={inputClass}
            placeholder="e.g. data.items or updated_at"
            {...register('stateKey')}
          />
        </div>
      </div>
      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? 'Saving…' : trigger ? 'Save schedule' : 'Create scheduled trigger'}
      </Button>
    </form>
  );
}
