'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { authApi } from '../../lib/api';
import { ApiError } from '../../lib/api-client';
import { useAuthStore } from '../../lib/auth-store';
import { Button, FieldError, FormErrors, inputClass, labelClass } from '../../components/ui';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [apiErrors, setApiErrors] = useState<string[]>([]);

  // Already signed in (e.g. session restored while sitting on /login) → leave.
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
      await authApi.login(values);
      const from = searchParams.get('from');
      router.replace(from && from.startsWith('/') ? from : '/workflows');
    } catch (err) {
      setApiErrors(err instanceof ApiError ? err.messages : ['Something went wrong. Is the API running?']);
    }
  };

  return (
    <AuthLayout title="Sign in to FlowState">
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
            autoComplete="current-password"
            className={inputClass}
            {...register('password')}
          />
          <FieldError message={errors.password?.message} />
        </div>
        <Button type="submit" variant="primary" className="w-full justify-center" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        No account yet?{' '}
        <Link href="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
          Register
        </Link>
      </p>
    </AuthLayout>
  );
}

export function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="mb-6 flex items-center gap-2 text-xl font-semibold text-slate-900">
        <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-lg text-white">⚡</span>
        FlowState
      </div>
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="mb-6 text-center text-lg font-semibold text-slate-900">{title}</h1>
        {children}
      </div>
    </div>
  );
}
