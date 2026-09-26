import { ApiError, NETWORK_ERROR_STATUS } from './api-client';
import { toast, type ToastAction } from './toast';

export interface FriendlyError {
  title: string;
  description?: string;
}

/**
 * Turns anything thrown by a request into words a user can act on. Server
 * messages are kept where they're specific (validation, conflicts) and
 * replaced where they're generic ("Internal server error").
 */
export function describeError(error: unknown, fallbackTitle = 'Something went wrong'): FriendlyError {
  if (error instanceof ApiError) {
    const detail = error.messages.join(' · ');
    switch (true) {
      case error.statusCode === NETWORK_ERROR_STATUS:
        return {
          title: 'Can’t reach FlowState',
          description: 'Check your connection. If you run FlowState yourself, make sure the API is running.',
        };
      case error.statusCode === 400 || error.statusCode === 422:
        return { title: 'Please check what you entered', description: detail };
      case error.statusCode === 401:
        return { title: 'Your session has ended', description: 'Sign in again to continue.' };
      case error.statusCode === 403:
        return { title: 'You don’t have access to that', description: detail };
      case error.statusCode === 404:
        return { title: 'Not found', description: 'It may have been deleted, or it belongs to another account.' };
      case error.statusCode === 409:
        return { title: 'That conflicts with something that already exists', description: detail };
      case error.statusCode === 429:
        return { title: 'Too many requests', description: 'Wait a moment and try again.' };
      case error.statusCode === 503:
        return { title: 'Service unavailable', description: detail };
      case error.statusCode >= 500:
        return {
          title: 'The server ran into a problem',
          description: 'Try again. If it keeps happening, check the API logs.',
        };
      default:
        return { title: fallbackTitle, description: detail };
    }
  }
  if (error instanceof Error && error.message) {
    return { title: fallbackTitle, description: error.message };
  }
  return { title: fallbackTitle };
}

/** Shows `error` as a toast. `context` names what failed ("Couldn't save step"). */
export function toastError(error: unknown, context?: string, action?: ToastAction) {
  const { title, description } = describeError(error, context);
  // When a context is given it leads, and the specific reason follows — "Couldn't
  // save step" tells the user *what* failed, the reason tells them *why*.
  const lead = context && context !== title ? context : title;
  const detail = context && context !== title ? [title, description].filter(Boolean).join(' — ') : description;
  toast.error(lead, { description: detail, action });
}

/**
 * What a query or mutation tells the global error handler (providers.tsx).
 * Every request failure becomes a toast unless it opts out with `silent` —
 * which is only for failures the component turns into UI itself (a 404
 * that means "not set up yet", a page that redirects on not-found).
 */
export interface RequestMeta extends Record<string, unknown> {
  /** Names what failed, e.g. "Couldn't pause workflow". */
  errorContext?: string;
  silent?: boolean;
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: RequestMeta;
    mutationMeta: RequestMeta;
  }
}

/** A 401 has already been announced once by api-client ("session ended"). */
export function isSessionEnded(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 401;
}
