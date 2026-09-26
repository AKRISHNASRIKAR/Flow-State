'use client';

import type { GoogleSignInError } from '@flowstate/api-types';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button, FormErrors } from '../../components/ui';
import { LogoMark } from '../../components/Logo';

const SIGN_IN_ERRORS: Record<GoogleSignInError, string> = {
  access_denied: 'Google sign-in was cancelled.',
  state_expired: 'That sign-in link expired. Please try again.',
  email_unverified: 'Your Google account’s email address isn’t verified.',
  account_conflict:
    'This email is already linked to a different Google account. Sign in with that account instead.',
  google_failed: 'Google sign-in failed. Please try again in a moment.',
};

function isSignInError(value: string): value is GoogleSignInError {
  return value in SIGN_IN_ERRORS;
}

export function LoginPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [redirecting, setRedirecting] = useState(false);

  // Already signed in (e.g. session restored while sitting on /login) → leave.
  useEffect(() => {
    if (accessToken !== null) router.replace('/workflows');
  }, [accessToken, router]);

  const errorCode = searchParams.get('error');
  const errorMessage =
    errorCode === null ? null : isSignInError(errorCode) ? SIGN_IN_ERRORS[errorCode] : SIGN_IN_ERRORS.google_failed;

  const signIn = () => {
    setRedirecting(true);
    const from = searchParams.get('from');
    authApi.startGoogleSignIn(from && from.startsWith('/') ? from : '/workflows');
  };

  return (
    <AuthLayout title="Sign in to FlowState">
      <div className="space-y-4">
        <FormErrors messages={errorMessage === null ? [] : [errorMessage]} />
        <Button
          variant="secondary"
          size="lg"
          className="w-full justify-center gap-3"
          onClick={signIn}
          disabled={redirecting}
        >
          <GoogleMark />
          {redirecting ? 'Redirecting to Google…' : 'Continue with Google'}
        </Button>
        <p className="text-center text-xs text-neutral-500">
          New here? Signing in creates your account. FlowState only asks Google for your name and email.
        </p>
      </div>
    </AuthLayout>
  );
}

// Google's four-colour "G", as required by its sign-in branding guidelines.
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-5 shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
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
              <LogoMark className="size-6" />
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
              <LogoMark className="size-5" />
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
