import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast, useToastStore, type ToastKind } from '../lib/toast';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

// 24x24 Heroicons outline path data, inlined: there is no icon package in this
// workspace and the app uses a couple of dozen glyphs at most.
export const ICON_PATHS = {
  close: 'M6 18 18 6M6 6l12 12',
  check: 'm4.5 12.75 6 6 9-13.5',
  checkCircle: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  warning:
    'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z',
  info: 'm11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z',
  dots: 'M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z',
  plus: 'M12 4.5v15m7.5-7.5h-15',
  play: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z',
  bolt: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
  arrowUp: 'M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18',
  arrowDown: 'M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3',
  trash:
    'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
  sparkles:
    'M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z',
  search: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z',
} as const;

export function Icon({
  path,
  className = 'size-5',
  strokeWidth = 1.5,
}: {
  path: string;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    // Disabled goes neutral, not a paler indigo: on a black page a half-strength
    // indigo button still reads as clickable.
    'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:shadow-none disabled:ring-1 disabled:ring-neutral-700 focus-visible:outline-indigo-500',
  secondary:
    'bg-neutral-800 text-white ring-1 ring-neutral-700 hover:bg-neutral-700 disabled:text-neutral-400 disabled:hover:bg-neutral-800',
  danger: 'bg-red-600 text-white shadow-lg shadow-red-500/20 hover:bg-red-500 disabled:bg-red-600/50',
  ghost: 'text-neutral-300 hover:bg-neutral-800 hover:text-white disabled:text-neutral-500',
};

const buttonSizes = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3.5 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof buttonSizes;
}

export function Button({ variant = 'secondary', size = 'md', className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-[color,background-color,box-shadow,transform] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// Spinner / loading
// ---------------------------------------------------------------------------

export function Spinner({ label }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2.5 py-10 text-sm text-neutral-300">
      <span className="size-6 animate-spin rounded-full border-2 border-neutral-800 border-t-indigo-500" />
      {label ?? 'Loading…'}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overlays: Modal (centred, for short decisions) and Drawer (side panel, for
// editing something while the thing it belongs to stays visible).
// ---------------------------------------------------------------------------

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
    >
      <Icon path={ICON_PATHS.close} />
    </button>
  );
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export function Modal({ title, onClose, children, wide = false }: ModalProps) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh] backdrop-blur-md">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-2xl bg-neutral-900 p-6 shadow-2xl ring-1 ring-neutral-800`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <CloseButton onClose={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

interface DrawerProps {
  title: ReactNode;
  /** One line under the title explaining what this panel is for. */
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Pinned to the bottom, outside the scroll area — for Save/Cancel. */
  footer?: ReactNode;
}

export function Drawer({ title, subtitle, onClose, children, footer }: DrawerProps) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex h-full w-full max-w-xl animate-drawer-in flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-800 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>}
          </div>
          <CloseButton onClose={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-neutral-800 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ title, body, confirmLabel, danger, busy, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="text-sm text-neutral-300">{body}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Switch — the one control for turning a workflow on and off.
// ---------------------------------------------------------------------------

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name; also shown beside the switch. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2.5 rounded-full text-sm font-medium text-neutral-200 disabled:opacity-60"
    >
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ring-1 transition-colors ${
          checked ? 'bg-emerald-500 ring-emerald-400/50' : 'bg-neutral-700 ring-neutral-600'
        }`}
      >
        <span
          className={`size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
        />
      </span>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Menu — a "⋯" button with a short list of secondary actions.
// ---------------------------------------------------------------------------

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
      >
        <Icon path={ICON_PATHS.dots} strokeWidth={2} />
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl bg-neutral-800 py-1 text-sm shadow-2xl ring-1 ring-neutral-700"
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`w-full px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:text-neutral-500 ${
                  item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-neutral-200 hover:bg-neutral-700 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="mb-6 flex gap-1 border-b border-neutral-800">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            active === t.id
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notice — an inline callout for guidance that belongs next to a control
// (not for errors: those are toasts).
// ---------------------------------------------------------------------------

const noticeStyles = {
  info: { box: 'bg-indigo-500/10 text-indigo-100 ring-indigo-500/20', icon: 'text-indigo-300', path: ICON_PATHS.info },
  warning: { box: 'bg-amber-500/10 text-amber-100 ring-amber-500/20', icon: 'text-amber-300', path: ICON_PATHS.warning },
} as const;

export function Notice({ tone = 'info', children }: { tone?: keyof typeof noticeStyles; children: ReactNode }) {
  const style = noticeStyles[tone];
  return (
    <div className={`flex gap-2.5 rounded-lg p-3 text-xs leading-relaxed ring-1 ring-inset ${style.box}`}>
      <Icon path={style.path} className={`mt-px size-4 shrink-0 ${style.icon}`} />
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form bits
// ---------------------------------------------------------------------------

/** Field-level validation message, shown under the field it belongs to. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-400">{message}</p>;
}

export const inputClass =
  'block w-full rounded-lg border-0 bg-black px-3 py-2 text-sm text-white ring-1 ring-inset ring-neutral-800 transition-shadow placeholder:text-neutral-500 focus:ring-2 focus:ring-inset focus:ring-indigo-500';

export const labelClass = 'block text-sm font-medium text-neutral-200 mb-1.5';

export const hintClass = 'mt-1.5 text-xs text-neutral-400';

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  /** Optional illustration; falls back to a neutral inbox glyph. */
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-800 bg-neutral-900/50 px-6 py-16 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-neutral-800/80 text-neutral-400 ring-1 ring-neutral-700">
        {icon ?? (
          <Icon path="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z" className="size-6" />
        )}
      </span>
      <p className="text-sm font-semibold text-white">{title}</p>
      {body && <div className="mt-1.5 max-w-md text-sm text-neutral-300">{body}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}

export function Pagination({ page, totalPages, total, onPage }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-4 text-sm text-neutral-300">
      <span>
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="flex gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts — the single place errors (and confirmations) are shown.
// ---------------------------------------------------------------------------

const toastStyles: Record<ToastKind, { ring: string; icon: string; path: string }> = {
  success: { ring: 'ring-emerald-500/30', icon: 'text-emerald-400', path: ICON_PATHS.checkCircle },
  error: { ring: 'ring-red-500/40', icon: 'text-red-400', path: ICON_PATHS.warning },
  info: { ring: 'ring-neutral-700', icon: 'text-indigo-300', path: ICON_PATHS.info },
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    // Errors interrupt (assertive); confirmations wait their turn (polite).
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => {
        const style = toastStyles[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            aria-live={t.kind === 'error' ? 'assertive' : 'polite'}
            className={`pointer-events-auto flex animate-toast-in items-start gap-3 rounded-xl bg-neutral-900 p-4 text-sm shadow-2xl ring-1 ${style.ring}`}
          >
            <Icon path={style.path} className={`mt-px size-5 shrink-0 ${style.icon}`} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white">{t.title}</p>
              {t.description && <p className="mt-0.5 break-words text-neutral-300">{t.description}</p>}
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    dismiss(t.id);
                    t.action?.onClick();
                  }}
                  className="mt-2 text-sm font-medium text-indigo-400 hover:text-indigo-300"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-m-1 rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-white"
            >
              <Icon path={ICON_PATHS.close} className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copyable value (webhook URLs, secrets)
// ---------------------------------------------------------------------------

export function CopyField({ value, mono = true, label = 'value' }: { value: string; mono?: boolean; label?: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Copied ${label}`, { key: 'copied' });
    } catch {
      // Clipboard access is refused on insecure origins and by some browsers'
      // permission settings — say so rather than pretending it worked.
      toast.error('Couldn’t copy to the clipboard', { description: 'Select the text and copy it manually.' });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code
        className={`min-w-0 flex-1 truncate rounded-lg bg-black px-3 py-2 text-xs text-neutral-200 ring-1 ring-inset ring-neutral-800 ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </code>
      <Button size="sm" onClick={() => void copy()}>
        Copy
      </Button>
    </div>
  );
}
