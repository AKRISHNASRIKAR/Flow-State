import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
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
  arrowRight: 'M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3',
  clock: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  xCircle: 'm9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
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
  // Primary is ink, not blue: signal blue is reserved for "moving right now",
  // so the main action reads as the product's own voice.
  primary:
    'bg-ink text-paper hover:bg-graphite disabled:bg-paper-2 disabled:text-faint disabled:ring-1 disabled:ring-rule focus-visible:outline-signal',
  secondary:
    'bg-card text-ink ring-1 ring-rule hover:bg-paper-2 hover:ring-faint/60 disabled:text-faint disabled:hover:bg-card focus-visible:outline-signal',
  danger: 'bg-fail-soft text-fail ring-1 ring-fail hover:bg-fail-soft/80 disabled:bg-fail/40 focus-visible:outline-fail',
  ghost: 'text-graphite hover:bg-paper-2 hover:text-ink disabled:text-faint focus-visible:outline-signal',
};

const buttonSizes = {
  sm: 'min-h-11 px-4 py-2 text-xs',
  md: 'min-h-11 px-4 py-2.5 text-sm',
  lg: 'min-h-12 px-5 py-3 text-sm',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof buttonSizes;
}

export function Button({ variant = 'secondary', size = 'md', className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-md leading-[1.4] font-medium transition-[color,background-color,box-shadow,transform] duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0 ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// Spinner / loading
// ---------------------------------------------------------------------------

export function Spinner({ label }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2.5 py-10 text-sm text-muted">
      <span className="size-5 animate-spin rounded-full border-2 border-rule border-t-signal" />
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
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

let activeOverlays = 0;
let originalBodyOverflow = '';
const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

/** Keep overlay keyboard navigation inside the task, then return to its opener. */
export function useFocusTrap(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const wasEnabled = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  // Capture before React commits an autoFocus input, which would otherwise become its own opener.
  if (enabled && !wasEnabled.current && typeof document !== 'undefined') opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  wasEnabled.current = enabled;
  useEffect(() => {
    if (!enabled) return;
    const previous = opener.current;
    if (activeOverlays === 0) { originalBodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    activeOverlays += 1;
    const dialog = ref.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((item) => item.getClientRects().length > 0);
    if (!dialog?.contains(document.activeElement)) (dialog?.querySelector<HTMLElement>('[autofocus], [data-autofocus], input, select, textarea') ?? focusable()[0] ?? dialog)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); dialog?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      activeOverlays -= 1;
      if (activeOverlays === 0) document.body.style.overflow = originalBodyOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [enabled]);
  return ref;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-paper-2 hover:text-ink active:bg-rule"
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
  const dialogRef = useFocusTrap(true);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim/50 p-4 pt-[8vh]">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full animate-fade-up [animation-duration:240ms] ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-md bg-card p-6 shadow-dialog ring-1 ring-rule`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-serif text-2xl leading-tight text-ink">{title}</h2>
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

/**
 * Where a Drawer renders. The workflow builder docks panels beside its canvas
 * on wide screens ('inline'); everywhere else — and in the builder on small
 * screens — they slide over the page ('overlay'). The panel components don't
 * know or care which.
 */
export const DrawerModeContext = createContext<'overlay' | 'inline'>('overlay');

export function Drawer({ title, subtitle, onClose, children, footer }: DrawerProps) {
  useEscape(onClose);
  const mode = useContext(DrawerModeContext);
  const dialogRef = useFocusTrap(mode === 'overlay');
  if (mode === 'inline') {
    return (
      <section
        aria-label={typeof title === 'string' ? title : undefined}
        className="flex h-full min-h-0 animate-fade-up flex-col overflow-hidden rounded-md border border-rule bg-card"
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-serif text-[22px] leading-tight text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-[13px] leading-snug text-muted">{subtitle}</p>}
          </div>
          <CloseButton onClose={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-rule bg-paper px-5 py-3">{footer}</div>}
      </section>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-scrim/50" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        tabIndex={-1}
        aria-label={typeof title === 'string' ? title : 'Workflow editor'}
        role="dialog"
        aria-modal="true"
        className="relative flex h-full w-full max-w-xl animate-drawer-in flex-col border-l border-rule bg-card shadow-drawer"
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
          <div className="min-w-0">
            <h2 className="font-serif text-2xl leading-tight text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          <CloseButton onClose={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-rule bg-paper px-6 py-4">{footer}</div>}
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
      <div className="text-sm leading-relaxed text-graphite">{body}</div>
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
      className="group inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-graphite transition-opacity hover:opacity-80 active:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-60"
    >
      <span
        className={`relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full ring-1 ring-inset transition-colors duration-200 ${
          checked ? 'bg-ok ring-ok' : 'bg-paper-2 ring-rule'
        }`}
      >
        <span
          className={`size-4 rounded-full bg-card shadow-control transition-transform duration-200 ${checked ? 'translate-x-[21px]' : 'translate-x-[3px]'}`}
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
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)') ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        items[next]?.focus();
      }
    };
    ref.current?.querySelector<HTMLButtonElement>('[role=menuitem]:not(:disabled)')?.focus();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} className="relative shrink-0">
      <button
        type="button"
        ref={triggerRef}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex size-11 items-center justify-center rounded-md text-muted transition-colors hover:bg-paper-2 hover:text-ink active:bg-rule"
      >
        <Icon path={ICON_PATHS.dots} strokeWidth={2} />
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 top-12 z-30 w-48 animate-fade-up [animation-duration:180ms] overflow-hidden rounded-md bg-card py-1 text-sm shadow-menu ring-1 ring-rule"
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                  item.onSelect();
                }}
                className={`min-h-11 w-full px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:text-faint ${
                  item.danger ? 'text-fail hover:bg-fail-soft' : 'text-graphite hover:bg-paper-2 hover:text-ink'
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
    <div role="tablist" className="mb-6 flex flex-wrap gap-1 border-b border-rule">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          tabIndex={active === t.id ? 0 : -1}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const index = tabs.findIndex((tab) => tab.id === t.id);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
            onChange(tabs[next].id);
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
          }}
          onClick={() => onChange(t.id)}
          className={`-mb-px min-h-11 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            active === t.id ? 'border-ink text-ink' : 'border-transparent text-muted hover:border-rule hover:text-ink'
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
  info: { box: 'bg-paper-2 text-graphite ring-rule', icon: 'text-muted', path: ICON_PATHS.info },
  warning: { box: 'bg-wait-soft text-graphite ring-wait/25', icon: 'text-wait', path: ICON_PATHS.warning },
} as const;

export function Notice({ tone = 'info', children }: { tone?: keyof typeof noticeStyles; children: ReactNode }) {
  const style = noticeStyles[tone];
  return (
    <div className={`flex gap-2.5 rounded-md p-3 text-xs leading-relaxed ring-1 ring-inset ${style.box}`}>
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
  return <p role="alert" className="mt-2 text-xs leading-relaxed text-fail">{message}</p>;
}

export const inputClass =
  'block min-h-11 min-w-0 w-full rounded-md border-0 bg-card px-3 py-3 text-sm text-ink ring-1 ring-inset ring-rule transition-shadow disabled:cursor-not-allowed disabled:bg-paper-2 disabled:text-muted placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-inset focus:ring-signal';

export const labelClass = 'block text-sm font-medium text-ink mb-2';

export const hintClass = 'mt-2 text-xs leading-relaxed text-muted';

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
    <div className="flex flex-col items-center justify-center rounded-md border border-rule bg-card px-6 py-16 text-center">
      <span className="mb-6 flex size-14 items-center justify-center rounded-md bg-card text-muted ring-1 ring-rule">
        {icon ?? (
          <Icon path="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z" className="size-6" />
        )}
      </span>
      <p className="font-serif text-3xl text-ink">{title}</p>
      {body && <div className="mt-2 max-w-md text-sm leading-relaxed text-graphite">{body}</div>}
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
    <div className="flex flex-wrap items-center justify-between gap-4 pt-4 text-sm text-muted tabular-nums">
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
  success: { ring: 'ring-rule', icon: 'text-ok', path: ICON_PATHS.checkCircle },
  error: { ring: 'ring-fail/40', icon: 'text-fail', path: ICON_PATHS.warning },
  info: { ring: 'ring-rule', icon: 'text-muted', path: ICON_PATHS.info },
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
            className={`pointer-events-auto flex animate-toast-in items-start gap-3 rounded-md bg-card p-4 text-sm shadow-toast ring-1 ${style.ring}`}
          >
            <Icon path={style.path} className={`mt-px size-5 shrink-0 ${style.icon}`} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{t.title}</p>
              {t.description && <p className="mt-0.5 break-words text-graphite">{t.description}</p>}
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    dismiss(t.id);
                    t.action?.onClick();
                  }}
                  className="mt-2 text-sm font-medium text-signal hover:text-signal-strong"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-m-1 rounded-md p-1 text-faint hover:bg-paper-2 hover:text-ink"
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
        className={`min-w-0 flex-1 truncate rounded-md bg-paper px-3 py-2 text-xs text-ink ring-1 ring-inset ring-rule ${mono ? 'font-mono' : ''}`}
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
