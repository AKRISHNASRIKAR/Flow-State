'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../lib/auth-store';
import { Spinner } from './ui';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const bootstrapping = useAuthStore((s) => s.bootstrapping);
  const router = useRouter();
  const pathname = usePathname();

  // Two-pass render: the server prerender knows nothing about localStorage,
  // so always paint the spinner first and decide after mount — this also
  // waits out the boot-time silent refresh so a reload with a valid refresh
  // token doesn't bounce to /login.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const unauthenticated = mounted && !bootstrapping && accessToken === null;

  useEffect(() => {
    if (unauthenticated) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
    }
  }, [unauthenticated, pathname, router]);

  if (!mounted || bootstrapping || accessToken === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Restoring session…" />
      </div>
    );
  }

  return <>{children}</>;
}
