'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { bootstrapSession } from '../lib/api-client';
import { useAuthStore } from '../lib/auth-store';
import { Button, Spinner } from './ui';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const bootstrapping = useAuthStore((s) => s.bootstrapping);
  const unreachable = useAuthStore((s) => s.unreachable);
  const router = useRouter();
  const pathname = usePathname();

  // Two-pass render: the server prerender knows nothing about localStorage,
  // so always paint the spinner first and decide after mount — this also
  // waits out the boot-time silent refresh so a reload with a valid refresh
  // token doesn't bounce to /login.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const unauthenticated = mounted && !bootstrapping && !unreachable && accessToken === null;

  useEffect(() => {
    if (unauthenticated) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
    }
  }, [unauthenticated, pathname, router]);

  // The API didn't answer while restoring the session. The user is still
  // signed in as far as we know, so offer a retry instead of the login page.
  if (mounted && unreachable && accessToken === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Can’t reach FlowState</h1>
        <p className="mt-1.5 max-w-sm text-sm text-graphite">
          Check your connection. If you run FlowState yourself, make sure the API is running — you’re still signed in.
        </p>
        <Button variant="primary" className="mt-5" onClick={() => void bootstrapSession()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!mounted || bootstrapping || accessToken === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Restoring session…" />
      </div>
    );
  }

  return <>{children}</>;
}
