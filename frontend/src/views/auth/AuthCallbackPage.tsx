'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { authApi } from '../../lib/api';
import { ApiError } from '../../lib/api-client';
import { Spinner } from '../../components/ui';
import { describeError } from '../../lib/errors';
import { toast } from '../../lib/toast';
import { AuthLayout } from './LoginPage';

/**
 * Landing page for the API's post-Google redirect: trades the one-time
 * handoff code for a session, then continues to where the user was going.
 */
export function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  // The handoff code and nonce are single-use; StrictMode's double-invoked
  // effect would otherwise spend them twice and report a false failure.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = searchParams.get('code');
    const returnTo = searchParams.get('returnTo');
    if (code === null) {
      const message = 'This sign-in link is incomplete. Please sign in again.';
      toast.error('Couldn’t sign you in', { description: message });
      setError(message);
      return;
    }

    authApi
      .completeGoogleSignIn(code)
      .then(() => {
        router.replace(returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/workflows');
      })
      .catch((err: unknown) => {
        // 401 is the one expected failure (code expired, reused, or opened in
        // another tab); anything else — offline, API down — says what it is.
        const message =
          err instanceof ApiError && err.statusCode === 401
            ? 'That sign-in link expired or was already used. Please sign in again.'
            : [describeError(err).title, describeError(err).description].filter(Boolean).join(' — ');
        toast.error('Couldn’t sign you in', { description: message });
        setError(message);
      });
  }, [router, searchParams]);

  return (
    <AuthLayout title={error === null ? 'Signing you in…' : 'Sign-in didn’t complete'}>
      {error === null ? (
        <Spinner label="Finishing Google sign-in…" />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-neutral-300">{error}</p>
          <Link href="/login" className="block text-center text-sm font-medium text-indigo-400 hover:text-indigo-300">
            Back to sign in
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
