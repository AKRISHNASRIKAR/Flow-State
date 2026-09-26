import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  action?: ToastAction;
  /** Toasts sharing a key replace each other instead of stacking. */
  key?: string;
}

export interface ToastOptions {
  description?: string;
  action?: ToastAction;
  key?: string;
  /** Milliseconds before auto-dismiss; 0 keeps it until dismissed. */
  duration?: number;
}

// Errors stay up longer than confirmations: they usually need reading, and
// a user who looked away shouldn't miss why something didn't happen.
const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 4_000,
  info: 5_000,
  error: 8_000,
};
const MAX_VISIBLE = 4;

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, title: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, title, options = {}) => {
    const id = nextId++;
    const { key, duration = DEFAULT_DURATION[kind], ...rest } = options;

    // A polling query that keeps failing, or a button pressed twice, would
    // otherwise pile up identical toasts. Same key — or same text when no
    // key is given — replaces the earlier one.
    const replaced = get().toasts.filter((t) =>
      key !== undefined ? t.key === key : t.kind === kind && t.title === title && t.description === rest.description,
    );
    replaced.forEach((t) => get().dismiss(t.id));

    set((s) => ({ toasts: [...s.toasts, { id, kind, title, key, ...rest }].slice(-MAX_VISIBLE) }));
    if (duration > 0) {
      timers.set(
        id,
        setTimeout(() => get().dismiss(id), duration),
      );
    }
    return id;
  },
  dismiss: (id) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toast = {
  success: (title: string, options?: ToastOptions) => useToastStore.getState().push('success', title, options),
  error: (title: string, options?: ToastOptions) => useToastStore.getState().push('error', title, options),
  info: (title: string, options?: ToastOptions) => useToastStore.getState().push('info', title, options),
};
