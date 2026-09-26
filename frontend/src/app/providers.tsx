'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ToastContainer } from '../components/ui';
import { ApiError, NETWORK_ERROR_STATUS, bootstrapSession } from '../lib/api-client';
import { isSessionEnded, toastError } from '../lib/errors';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // One place turns every request failure into a toast, so no screen can
        // fail silently and no component re-implements the same onError.
        queryCache: new QueryCache({
          onError: (error, query) => {
            if (query.meta?.silent || isSessionEnded(error)) return;
            toastError(error, query.meta?.errorContext ?? 'Couldn’t load data', {
              label: 'Retry',
              onClick: () => void query.fetch(),
            });
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            if (mutation.meta?.silent || isSessionEnded(error)) return;
            toastError(error, mutation.meta?.errorContext ?? 'That didn’t work');
          },
        }),
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              if (!(error instanceof ApiError)) return failureCount < 2;
              // Don't retry 4xx responses — they won't get better.
              if (error.statusCode >= 400 && error.statusCode < 500) return false;
              // Unreachable API: one quick retry absorbs a blip, then the user
              // hears about it within ~2s instead of sitting on a spinner.
              if (error.statusCode === NETWORK_ERROR_STATUS) return failureCount < 1;
              return failureCount < 2;
            },
            retryDelay: (failureCount) => Math.min(1000 * failureCount, 3000),
            staleTime: 5_000,
          },
        },
      }),
  );

  // Silent session restore from the stored refresh token, client-side only.
  useEffect(() => {
    void bootstrapSession();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ToastContainer />
    </QueryClientProvider>
  );
}
