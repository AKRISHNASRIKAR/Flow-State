'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { WhatsNewDrawer, useWhatsNewUnread } from '../features/help/WhatsNew';
import { authApi, workflowsApi } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import { BrandLockup } from './Logo';
import { ICON_PATHS } from './ui';

const SIDEBAR_WIDTH = 'w-60'; // 240px — paired with md:pl-60 on the content column.

// 24x24 Heroicons outline path data, inlined: there is no icon package in this
// workspace and adding one for five glyphs isn't worth the dependency. The
// brand mark is not one of these — it lives in components/Logo.tsx.
const ICONS = {
  workflows:
    'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z',
  executions:
    'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 17.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
  logout:
    'M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75',
  menu: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  close: 'M6 18 18 6M6 6l12 12',
} as const;

function Icon({ path, className = 'size-5' }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

// "Runs" rather than "Executions": the word users already use for "each time
// it happened". The route stays /executions so existing links keep working.
const NAV_ITEMS = [
  { href: '/workflows', label: 'Workflows', icon: ICONS.workflows },
  { href: '/executions', label: 'Runs', icon: ICONS.executions },
];

function NavItem({
  href,
  label,
  icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: string;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      // Active is ink with a marker, not blue: signal blue means "running now".
      className={`relative flex items-center gap-3 rounded-[5px] px-3 py-2 text-sm font-medium transition-colors ${
        isActive ? 'bg-card text-ink ring-1 ring-rule' : 'text-graphite hover:bg-paper-2 hover:text-ink'
      }`}
    >
      {isActive && <span aria-hidden className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r bg-ink" />}
      <Icon path={icon} className={`size-[18px] ${isActive ? 'text-ink' : 'text-muted'}`} />
      {label}
    </Link>
  );
}

interface Crumb {
  label: string;
  href?: string;
}

/**
 * A workflow crumb shows its name once the page below has loaded it. The
 * query here is disabled — it never fetches, it only subscribes to the
 * page's own cache entry — so the name appears without a second request.
 * Until then (and for runs) a short id stands in.
 */
function useCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  const workflowId = segments[0] === 'workflows' ? segments[1] : undefined;
  const { data: workflow } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => workflowsApi.get(workflowId ?? ''),
    enabled: false,
  });

  return segments.map((segment, i) => {
    if (i === 0) {
      const nav = NAV_ITEMS.find((item) => item.href === `/${segment}`);
      return {
        label: nav?.label ?? segment.charAt(0).toUpperCase() + segment.slice(1),
        href: segments.length > 1 ? `/${segment}` : undefined,
      };
    }
    if (workflow && segment === workflowId) return { label: workflow.name };
    const shortId = segment.length > 12 ? `${segment.slice(0, 8)}…` : segment;
    return { label: segments[0] === 'executions' ? `Run ${shortId}` : shortId };
  });
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const { unread, markSeen } = useWhatsNewUnread();

  // The drawer overlays the content on mobile, so a navigation that leaves it
  // open would hide the page the user just asked for.
  useEffect(() => setMenuOpen(false), [pathname]);

  const logout = useMutation({
    mutationFn: authApi.logout,
    // The local session is cleared either way (authApi.logout's finally), so a
    // failed server-side revoke isn't worth interrupting the user over.
    meta: { silent: true },
    onSettled: () => router.push('/login'),
  });

  const crumbs = useCrumbs(pathname);
  // The builder is a full-bleed working surface; list pages keep a reading width.
  const wide = /^\/workflows\/[^/]+/.test(pathname);

  const openWhatsNew = () => {
    setMenuOpen(false);
    setShowWhatsNew(true);
    markSeen();
  };

  return (
    <div className="min-h-screen">
      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/20 md:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex ${SIDEBAR_WIDTH} flex-col border-r border-rule bg-paper transition-transform duration-200 md:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center gap-2.5 px-4">
          <Link href="/workflows" aria-label="FlowState — your workflows">
            <BrandLockup size="sm" />
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
            className="ml-auto rounded-[5px] p-1 text-graphite hover:bg-paper-2 hover:text-ink md:hidden"
          >
            <Icon path={ICONS.close} />
          </button>
        </div>

        <p className="label-caps px-6 pt-5 text-faint">Build</p>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.href} {...item} onNavigate={() => setMenuOpen(false)} />
          ))}
        </nav>

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={openWhatsNew}
            className="flex w-full items-center gap-3 rounded-[5px] px-3 py-2 text-sm font-medium text-graphite transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <Icon path={ICON_PATHS.sparkles} className="size-[18px] text-muted" />
            What’s new
            {unread && (
              <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] font-medium text-signal">
                <span aria-hidden className="size-1.5 rounded-full bg-signal" />
                new
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2.5 border-t border-rule px-3 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-card font-serif text-[15px] uppercase text-ink ring-1 ring-rule">
            {user?.email?.charAt(0) ?? '?'}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted" title={user?.email}>
            {user?.email ?? 'Signed in'}
          </span>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            aria-label="Log out"
            title="Log out"
            className="rounded-[5px] p-1.5 text-muted transition-colors hover:bg-paper-2 hover:text-ink disabled:opacity-50"
          >
            <Icon path={ICONS.logout} />
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col bg-paper md:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-rule bg-paper/95 px-4 sm:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
            className="-ml-1 rounded-[5px] p-1.5 text-graphite hover:bg-paper-2 hover:text-ink md:hidden"
          >
            <Icon path={ICONS.menu} />
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            {crumbs.map((crumb, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <span className="text-faint">/</span>}
                {crumb.href ? (
                  <Link href={crumb.href} className="truncate text-muted hover:text-ink">
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current={i === crumbs.length - 1 ? 'page' : undefined}
                    className={`truncate ${i === crumbs.length - 1 ? 'font-medium text-ink' : 'text-muted'}`}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        </header>
        <main className={`flex-1 ${wide ? 'px-4 py-6 sm:px-6' : 'px-4 py-10 sm:px-6 lg:px-10'}`}>
          <div className={wide ? '' : 'mx-auto max-w-6xl'}>{children}</div>
        </main>
      </div>

      {showWhatsNew && <WhatsNewDrawer onClose={() => setShowWhatsNew(false)} />}
    </div>
  );
}
