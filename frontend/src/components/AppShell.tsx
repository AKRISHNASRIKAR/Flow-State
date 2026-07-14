import { useMutation } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { authApi } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';
import { Button } from './ui';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
  }`;

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => navigate('/login'),
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <NavLink to="/workflows" className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-600 text-sm text-white">
              ⚡
            </span>
            FlowState
          </NavLink>
          <nav className="flex gap-1">
            <NavLink to="/workflows" className={navLinkClass}>
              Workflows
            </NavLink>
            <NavLink to="/executions" className={navLinkClass}>
              Executions
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:block">{user?.email}</span>
            <Button size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
              {logout.isPending ? 'Logging out…' : 'Log out'}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
