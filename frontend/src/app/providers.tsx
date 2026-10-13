'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { THEME_KEY, useThemeStore, type ThemePreference } from '../lib/theme-store';
import { ToastContainer } from '../components/ui';
import { ApiError, NETWORK_ERROR_STATUS, bootstrapSession } from '../lib/api-client';
import { isSessionEnded, toastError } from '../lib/errors';

// Matches --theme-transition-duration in globals.css; the class exists only during a switch.
const THEME_TRANSITION_MS = 500;

export function Providers({ children }: { children: React.ReactNode }) {
  const preference = useThemeStore((state) => state.preference);
  const [themeReady, setThemeReady] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch { /* Storage can be unavailable in private contexts. */ }
    const initial: ThemePreference = saved === 'dark' || saved === 'light' ? saved : 'system';
    useThemeStore.getState().setPreference(initial);
    setThemeReady(true);
  }, []);
  useEffect(() => {
    if (!themeReady) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    let transitionTimer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      const resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
      const root = document.documentElement;
      if (root.dataset.theme !== resolved) {
        // Only animate a real preference change; restored visits keep their before-paint theme.
        root.classList.add('theme-changing');
        root.dataset.theme = resolved;
        clearTimeout(transitionTimer);
        transitionTimer = setTimeout(() => root.classList.remove('theme-changing'), THEME_TRANSITION_MS);
      }
      useThemeStore.getState().setResolved(resolved);
    };
    apply();
    try { localStorage.setItem(THEME_KEY, preference); } catch { /* The preference still works for this visit. */ }
    media.addEventListener('change', apply);
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY) useThemeStore.getState().setPreference(event.newValue === 'dark' || event.newValue === 'light' ? event.newValue : 'system');
    };
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', apply);
      window.removeEventListener('storage', onStorage);
      clearTimeout(transitionTimer);
      document.documentElement.classList.remove('theme-changing');
    };
  }, [preference, themeReady]);
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
              // Don't retry 4xx responses - they won't get better.
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
