import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../lib/auth-store';
import { Spinner } from './ui';

export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const bootstrapping = useAuthStore((s) => s.bootstrapping);
  const location = useLocation();

  // Wait for the boot-time silent refresh before deciding — otherwise a page
  // reload with a valid refresh token would bounce to /login.
  if (bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Restoring session…" />
      </div>
    );
  }

  if (accessToken === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
