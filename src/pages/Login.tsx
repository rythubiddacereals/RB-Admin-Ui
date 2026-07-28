import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { landingRouteFor, useAuthStore } from '@/store/auth';

/**
 * Admin sign-in page.
 *
 * Simple centered card — username + password + submit. Errors from
 * the store are shown inline. On success we bounce to `state.from`
 * (the URL the operator was trying to visit before being kicked
 * here) or `/` if they came in fresh.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore(s => s.login);
  const authStatus = useAuthStore(s => s.status);
  const user = useAuthStore(s => s.user);
  const error = useAuthStore(s => s.error);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // If we're already signed in and someone hits /login, skip past it.
  // Prefer the URL the operator was trying to visit (state.from); fall
  // back to the role-appropriate landing page (DA → /deliveries).
  useEffect(() => {
    if (authStatus === 'authed') {
      const from = (location.state as any)?.from ?? landingRouteFor(user);
      navigate(from, { replace: true });
    }
  }, [authStatus, location.state, navigate, user]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    try {
      await login(username.trim(), password);
      // Read the freshly-set user directly from the store — the local
      // `user` selector value hasn't re-rendered yet at this point.
      const freshUser = useAuthStore.getState().user;
      const from =
        (location.state as any)?.from ?? landingRouteFor(freshUser);
      navigate(from, { replace: true });
    } catch {
      // Error surfaced via the store; nothing else to do here.
    }
  };

  const busy = authStatus === 'checking';

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center">
          <img
            src="/logo.gif"
            alt="Rythu Bidda"
            className="mb-3 h-20 w-auto object-contain"
            onError={e => {
              const el = e.currentTarget as HTMLImageElement;
              el.style.display = 'none';
              const fallback = el.nextSibling as HTMLElement | null;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
          <div
            className="mb-3 hidden h-14 w-14 items-center justify-center rounded-xl bg-primary-500 text-2xl font-extrabold text-white"
            aria-hidden="true"
          >
            RB
          </div>
          <h1 className="text-2xl font-extrabold text-primary-700">
            Rythu Bidda Admin
          </h1>
          <p className="mt-1 text-sm font-semibold text-secondary-700">
            Sign in to manage orders, products, and delivery centers.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-bold text-gray-800">
              Username
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold text-gray-900 focus:border-primary-500 focus:outline-none"
              placeholder="admin"
              disabled={busy}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-gray-800">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold text-gray-900 focus:border-primary-500 focus:outline-none"
              placeholder="••••••••"
              disabled={busy}
              required
            />
          </div>

          {error ? (
            <div className="rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy || !username.trim() || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 py-2.5 font-bold text-white shadow-sm transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-secondary-300"
          >
            <LogIn size={18} />
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
