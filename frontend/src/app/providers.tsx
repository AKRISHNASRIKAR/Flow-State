'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ToastContainer } from '../components/ui';
import { ApiError, bootstrapSession } from '../lib/api-client';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              // Don't retry 4xx responses — they won't get better.
              if (error instanceof ApiError && error.statusCode < 500) return false;
              return failureCount < 2;
            },
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
