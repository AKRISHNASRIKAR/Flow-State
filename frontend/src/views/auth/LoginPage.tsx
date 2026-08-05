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
        <Button type="submit" variant="primary" size="lg" className="w-full justify-center" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-neutral-400">
        No account yet?{' '}
        <Link href="/register" className="font-medium text-indigo-400 hover:text-indigo-300">
          Register
        </Link>
      </p>
    </AuthLayout>
  );
}

// Claims kept to what the engine actually does — no branching, no integration
// catalogue. See the "constrain the UI to the engine" rule in CLAUDE.md.
const BRAND_POINTS = [
  'Webhook, schedule, and manual triggers',
  'HMAC verification, idempotency, and retries',
  'Every run recorded step by step',
];

const CHECK_PATH = 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z';
const BOLT_PATH = 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z';

export function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden flex-1 flex-col justify-center overflow-hidden bg-black p-12 md:flex">
        {/* Depth stack, back to front: panning grid, glow orb, vignette. All
            decorative — the panel reads fine if any of them fail to paint. */}
        <div
          aria-hidden
          className="animate-grid-pan absolute inset-0 bg-[linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)] bg-[size:24px_24px]"
        />
        <div
          aria-hidden
          className="absolute -left-24 top-1/4 size-[32rem] rounded-full bg-indigo-500/30 blur-[110px]"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/50" />
        <div className="relative max-w-md">
          <div className="flex items-center gap-3 text-white">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/30">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden className="size-6">
                <path strokeLinecap="round" strokeLinejoin="round" d={BOLT_PATH} />
              </svg>
            </span>
            <span className="text-2xl font-semibold tracking-tight">FlowState</span>
          </div>
          <h2 className="mt-10 text-3xl font-semibold leading-tight text-white">
            Automate your workflows, on your own infrastructure.
          </h2>
          <ul className="mt-8 space-y-4">
            {BRAND_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-neutral-300">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden
                  className="mt-px size-5 shrink-0 text-indigo-400"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={CHECK_PATH} />
                </svg>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-black p-6 sm:p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-center gap-2.5 text-lg font-semibold text-white md:hidden">
            <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden className="size-5">
                <path strokeLinecap="round" strokeLinejoin="round" d={BOLT_PATH} />
              </svg>
            </span>
            FlowState
          </div>
          <div className="rounded-2xl bg-neutral-900 p-8 shadow-2xl ring-1 ring-neutral-800 sm:p-10">
            <h1 className="mb-6 text-lg font-semibold text-white">{title}</h1>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
