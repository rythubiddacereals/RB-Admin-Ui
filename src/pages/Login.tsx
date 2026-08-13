import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogIn, ShieldCheck, Smartphone } from 'lucide-react';
import { landingRouteFor, useAuthStore } from '@/store/auth';

/**
 * Admin sign-in page — two tabs, two different credentials:
 *
 *   • Admin: username + password (unchanged).
 *   • Super Admin: passwordless — mobile number → SMS code → in.
 *     Possession of the registered phone IS the credential; the
 *     backend only sends codes to numbers registered on an active
 *     SUPER_ADMIN account and never reveals which numbers those are.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore(s => s.login);
  const superRequestOtp = useAuthStore(s => s.superRequestOtp);
  const superVerifyOtp = useAuthStore(s => s.superVerifyOtp);
  const authStatus = useAuthStore(s => s.status);
  const user = useAuthStore(s => s.user);
  const error = useAuthStore(s => s.error);

  const [tab, setTab] = useState<'admin' | 'super'>('admin');

  // Admin tab
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Super tab
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);

  // If we're already signed in and someone hits /login, skip past it.
  // Prefer the URL the operator was trying to visit (state.from); fall
  // back to the role-appropriate landing page (DA → /deliveries).
  useEffect(() => {
    if (authStatus === 'authed') {
      const from = (location.state as any)?.from ?? landingRouteFor(user);
      navigate(from, { replace: true });
    }
  }, [authStatus, location.state, navigate, user]);

  const goIn = () => {
    const freshUser = useAuthStore.getState().user;
    const from = (location.state as any)?.from ?? landingRouteFor(freshUser);
    navigate(from, { replace: true });
  };

  const onAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    try {
      await login(username.trim(), password);
      goIn();
    } catch {
      // Error surfaced via the store; nothing else to do here.
    }
  };

  const onSendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (phone.length !== 10) return;
    setSending(true);
    try {
      await superRequestOtp(phone);
      setOtpSent(true);
      setOtp('');
    } catch {
      // Error surfaced via the store.
    } finally {
      setSending(false);
    }
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return;
    try {
      await superVerifyOtp(phone, otp);
      goIn();
    } catch {
      setOtp('');
    }
  };

  const switchTab = (next: 'admin' | 'super') => {
    setTab(next);
    setOtpSent(false);
    setOtp('');
    // Clear any stale error from the other tab.
    useAuthStore.setState({ error: null });
  };

  const busy = authStatus === 'checking' || sending;

  const tabCls = (active: boolean) =>
    `flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${
      active
        ? 'bg-primary-500 text-white shadow-sm'
        : 'text-secondary-700 hover:bg-secondary-100'
    }`;

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

        {/* "Staff" covers every back-office role — admins, delivery
            agents, store managers, regional heads — they all sign in
            with username + password. Only super admins use the
            phone-code tab. */}
        <div className="mb-5 flex gap-1 rounded-xl bg-secondary-50 p-1">
          <button type="button" onClick={() => switchTab('admin')} className={tabCls(tab === 'admin')}>
            Staff Login
          </button>
          <button type="button" onClick={() => switchTab('super')} className={tabCls(tab === 'super')}>
            Super Admin
          </button>
        </div>

        {tab === 'admin' ? (
          <form onSubmit={onAdminSubmit} className="space-y-4">
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
                placeholder="Enter your username"
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
        ) : !otpSent ? (
          <form onSubmit={onSendCode} className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-primary-50 px-4 py-3 text-sm font-semibold text-primary-800">
              <Smartphone size={18} className="shrink-0" />
              <span>
                No password needed — we'll text a sign-in code to your
                registered mobile number.
              </span>
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-gray-800">
                Mobile number
              </label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={10}
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold text-gray-900 focus:border-primary-500 focus:outline-none"
                placeholder="10-digit mobile number"
                disabled={busy}
                autoFocus
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
              disabled={busy || phone.length !== 10}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 py-2.5 font-bold text-white shadow-sm transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-secondary-300"
            >
              <Smartphone size={18} />
              {sending ? 'Sending code…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={onVerify} className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-primary-50 px-4 py-3 text-sm font-semibold text-primary-800">
              <ShieldCheck size={18} className="shrink-0" />
              <span>
                If ••••••{phone.slice(-4)} belongs to a super admin account,
                a 6-digit code is on its way.
              </span>
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-gray-800">
                Verification code
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 text-center text-2xl font-bold tracking-[0.4em] text-gray-900 focus:border-primary-500 focus:outline-none"
                placeholder="000000"
                disabled={busy}
                autoFocus
              />
            </div>

            {error ? (
              <div className="rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy || otp.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 py-2.5 font-bold text-white shadow-sm transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-secondary-300"
            >
              <ShieldCheck size={18} />
              {busy ? 'Verifying…' : 'Verify & sign in'}
            </button>

            <div className="flex items-center justify-between text-sm font-semibold">
              <button
                type="button"
                onClick={() => { setOtpSent(false); setOtp(''); }}
                disabled={busy}
                className="text-secondary-700 hover:text-secondary-900 disabled:opacity-50"
              >
                ← Change number
              </button>
              <button
                type="button"
                onClick={() => onSendCode()}
                disabled={busy}
                className="text-primary-600 hover:text-primary-700 disabled:opacity-50"
              >
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
