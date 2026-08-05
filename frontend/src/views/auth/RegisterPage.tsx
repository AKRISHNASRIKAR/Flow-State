'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { authApi } from '../../lib/api';
import { ApiError } from '../../lib/api-client';
import { useAuthStore } from '../../lib/auth-store';
import { Button, FieldError, FormErrors, inputClass, labelClass } from '../../components/ui';
import { AuthLayout } from './LoginPage';

// Password floor matches the backend's class-validator rule (min 8 chars).
const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const router = useRouter();
  const [apiErrors, setApiErrors] = useState<string[]>([]);

  useEffect(() => {
    if (accessToken !== null) router.replace('/workflows');
  }, [accessToken, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setApiErrors([]);
    try {
      await authApi.register({
        email: values.email,
        password: values.password,
        name: values.name?.trim() ? values.name.trim() : undefined,
      });
      router.replace('/workflows');
    } catch (err) {
      setApiErrors(err instanceof ApiError ? err.messages : ['Something went wrong. Is the API running?']);
    }
  };

  return (
    <AuthLayout title="Create your account">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormErrors messages={apiErrors} />
        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input id="email" type="email" autoComplete="email" className={inputClass} {...register('email')} />
          <FieldError message={errors.email?.message} />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            {...register('password')}
          />
          <FieldError message={errors.password?.message} />
        </div>
        <div>
          <label htmlFor="name" className={labelClass}>
            Name <span className="text-neutral-400">(optional)</span>
          </label>
          <input id="name" type="text" autoComplete="name" className={inputClass} {...register('name')} />
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full justify-center" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-neutral-400">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-indigo-400 hover:text-indigo-300">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
