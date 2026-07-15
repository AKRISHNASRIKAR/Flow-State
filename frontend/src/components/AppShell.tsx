'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authApi } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import { Button } from './ui';

function NavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-2 text-sm font-medium ${
        isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  const logout = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => router.push('/login'),
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/workflows" className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-600 text-sm text-white">
              ⚡
            </span>
            FlowState
          </Link>
          <nav className="flex gap-1">
            <NavItem href="/workflows" label="Workflows" />
            <NavItem href="/executions" label="Executions" />
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:block">{user?.email}</span>
            <Button size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
              {logout.isPending ? 'Logging out…' : 'Log out'}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
