import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthReady, useAuthStore } from '@/store/auth';

/**
 * Route guard — wraps every private page.
 *
 * On first render the store might be in `idle` (haven't tried to
 * hydrate yet) or `checking` (verifying the token against
 * /api/admin/me). During that window we show a lightweight loader
 * instead of redirecting, so a slow /me response doesn't flash the
 * login page for a fraction of a second.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore(s => s.status);
  const hydrate = useAuthStore(s => s.hydrate);
  const ready = useAuthReady();
  const location = useLocation();

  useEffect(() => {
    if (status === 'idle') {
      void hydrate();
    }
  }, [status, hydrate]);

  if (!ready) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center">
        <div className="text-sm font-semibold text-primary-700">Loading…</div>
      </div>
    );
  }

  if (status === 'unauthed') {
    // Preserve the intended URL so login can redirect back after
    // success — nicer than always dumping the operator on /.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
