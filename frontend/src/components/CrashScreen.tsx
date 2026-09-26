'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button, Icon, ICON_PATHS } from './ui';
import { toast } from '../lib/toast';

/**
 * Shown by the route error boundaries when a page throws while rendering —
 * instead of a blank screen. Toasts the error too, so a crash reads the same
 * way as every other failure in the app.
 */
export function CrashScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    toast.error('This page hit an unexpected error', { description: error.message || undefined, key: 'crash' });
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 ring-1 ring-red-500/30">
        <Icon path={ICON_PATHS.warning} className="size-6" />
      </span>
      <h1 className="text-lg font-semibold text-white">Something broke on this page</h1>
      <p className="mt-1.5 max-w-md text-sm text-neutral-300">
        Your workflows are safe — this is a display problem. Try again, or head back to your workflows.
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Link href="/workflows" className="rounded-lg px-3.5 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white">
          Go to workflows
        </Link>
      </div>
    </div>
  );
}
