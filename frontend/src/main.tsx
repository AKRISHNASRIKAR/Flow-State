import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ApiError, bootstrapSession } from './lib/api-client';
import './index.css';

const queryClient = new QueryClient({
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
});

// Attempt a silent session restore before first render decides where to route.
void bootstrapSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
