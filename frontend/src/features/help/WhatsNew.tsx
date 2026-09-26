'use client';

import Link from 'next/link';
import { useCallback, useSyncExternalStore } from 'react';
import { Drawer } from '../../components/ui';
import { CHANGELOG, LATEST_CHANGELOG_ID } from '../../lib/changelog';

const SEEN_KEY = 'flowstate.whatsNewSeen';

// Unread state is a per-browser convenience, so localStorage is the right
// home — and every access is guarded, because storage can be blocked or
// throw (private windows, disabled site data). Losing it just re-shows a dot.
function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWhatsNewUnread() {
  const seen = useSyncExternalStore(subscribe, readSeen, () => LATEST_CHANGELOG_ID);
  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, LATEST_CHANGELOG_ID);
    } catch {
      // Storage unavailable — the dot will simply come back next visit.
    }
    listeners.forEach((l) => l());
  }, []);
  return { unread: seen !== LATEST_CHANGELOG_ID, markSeen };
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export function WhatsNewDrawer({ onClose }: { onClose: () => void }) {
  return (
    <Drawer title="What’s new" subtitle="Recent changes to FlowState." onClose={onClose}>
      <ol className="relative space-y-8 border-l border-neutral-800 pl-6">
        {CHANGELOG.map((entry) => (
          <li key={entry.id} className="relative">
            <span aria-hidden className="absolute -left-[29px] top-1.5 size-2.5 rounded-full bg-indigo-500 ring-4 ring-neutral-950" />
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{formatDate(entry.date)}</p>
            <h3 className="mt-1 text-sm font-semibold text-white">{entry.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-300">{entry.body}</p>
            {entry.href && (
              <Link
                href={entry.href}
                onClick={onClose}
                className="mt-2 inline-block text-sm font-medium text-indigo-400 hover:text-indigo-300"
              >
                Take a look →
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Drawer>
  );
}
