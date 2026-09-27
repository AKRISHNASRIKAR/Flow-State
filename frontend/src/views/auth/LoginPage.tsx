'use client';

import type { GoogleSignInError } from '@flowstate/api-types';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui';
import { toast } from '../../lib/toast';
import Link from 'next/link';
import { BrandLockup } from '../../components/Logo';
import { Connector, FlowNodeCard, type RunTone } from '../../components/flow-visuals';
import { GLYPHS } from '../../lib/glyphs';

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

  // The API redirects here with ?error=<code> when Google sign-in fails.
  // Show it once as a toast, then drop it from the URL so a refresh or a
  // bookmark doesn't replay a stale error.
  const errorCode = searchParams.get('error');
  useEffect(() => {
    if (errorCode === null) return;
    const message = isSignInError(errorCode) ? SIGN_IN_ERRORS[errorCode] : SIGN_IN_ERRORS.google_failed;
    toast.error('Couldn’t sign you in', { description: message, key: 'sign-in-error' });
    const params = new URLSearchParams(searchParams.toString());
    params.delete('error');
    router.replace(params.size > 0 ? `/login?${params.toString()}` : '/login');
  }, [errorCode, router, searchParams]);

  const signIn = () => {
    setRedirecting(true);
    const from = searchParams.get('from');
    authApi.startGoogleSignIn(from && from.startsWith('/') ? from : '/workflows');
  };

  return (
    <AuthLayout title="Sign in to FlowState" step={redirecting ? 1 : 0}>
      <div className="space-y-5">
        <Button
          variant="secondary"
          size="lg"
          className="w-full gap-3 py-3 text-[15px]"
          onClick={signIn}
          disabled={redirecting}
        >
          <GoogleMark />
          {redirecting ? 'Redirecting to Google…' : 'Continue with Google'}
        </Button>
        <p className="text-[13px] leading-relaxed text-muted">
          New here? Signing in creates your account — there’s no separate sign-up.
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

export type SignInStep = 0 | 1 | 2 | 3;

// Signing in is itself a small flow; the left panel shows where you are in it.
// The login page sits at step 0; the callback page advances it as the
// handoff completes, and marks the step that failed if it doesn't.
const SIGN_IN_FLOW = [
  { kind: 'trigger' as const, label: 'Trigger', title: 'You choose Continue with Google', glyph: GLYPHS.manual },
  { kind: 'step' as const, label: 'Step 1 · Google', title: 'Google confirms it’s you', glyph: GLYPHS.person },
  { kind: 'step' as const, label: 'Step 2 · FlowState', title: 'Your session starts', glyph: GLYPHS.bolt },
  { kind: 'result' as const, label: 'Result', title: 'Your workflows', glyph: GLYPHS.check },
];

function stepState(i: number, step: SignInStep, failed: boolean): { tone: RunTone; text: string } {
  if (failed && i === step) return { tone: 'fail', text: 'didn’t finish' };
  if (i < step) return { tone: 'ok', text: 'done' };
  if (i === step) return { tone: 'running', text: i === 0 ? 'ready' : 'in progress' };
  return { tone: 'idle', text: 'next' };
}

export function AuthLayout({
  title,
  step = 0,
  failed = false,
  children,
}: {
  title: string;
  step?: SignInStep;
  failed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-paper">
      <div className="grid-paper relative hidden flex-1 flex-col justify-between border-r border-rule p-12 md:flex">
        <Link href="/" aria-label="FlowState home">
          <BrandLockup />
        </Link>
        <div className="mx-auto w-full max-w-[360px]">
          {SIGN_IN_FLOW.map((n, i) => (
            <div key={n.label}>
              {i > 0 && <Connector height={24} flowing={!failed && i === step} drawn={i <= step ? 1 : 0.35} />}
              <FlowNodeCard
                kind={n.kind}
                label={n.label}
                title={n.title}
                glyph={n.glyph}
                state={stepState(i, step, failed)}
                active={!failed && i === step}
                alert={failed && i === step}
                className={i > step ? 'opacity-60' : ''}
              />
            </div>
          ))}
        </div>
        <p className="max-w-[40ch] text-[13px] leading-relaxed text-muted">
          FlowState only asks Google for your name and email. Access to Gmail, Sheets or Calendar will always be a separate,
          explicit choice.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px]">
          <Link href="/" className="mb-10 inline-flex md:hidden" aria-label="FlowState home">
            <BrandLockup />
          </Link>
          <h1 className="font-serif text-[40px] leading-[1.05] tracking-[-0.015em] text-ink">{title}</h1>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
