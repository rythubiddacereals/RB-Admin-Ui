import { create } from 'zustand';
import { api, getStoredToken, setStoredToken } from '@/lib/api';

/**
 * Auth store — the single source of truth for who is signed in.
 *
 * Persistence: only the JWT is persisted (via localStorage). On app
 * boot we call `hydrate()` which reads the token back and, if a
 * profile fetch succeeds, restores the session; otherwise the token
 * is treated as stale and the user is signed out.
 */
export interface AdminUser {
  id: number;
  firstname: string;
  lastname: string;
  username: string;
  roles: string;
}

interface AuthState {
  user: AdminUser | null;
  token: string | null;
  status: 'idle' | 'checking' | 'authed' | 'unauthed';
  error: string | null;
  hydrate: () => Promise<void>;
  /** Username + password — regular admins only; super admins are
   * refused here (they sign in by phone). */
  login: (username: string, password: string) => Promise<void>;
  /** Passwordless super-admin flow, step 1: SMS a code to this phone. */
  superRequestOtp: (phone: string) => Promise<void>;
  /** Passwordless super-admin flow, step 2: code → signed in. */
  superVerifyOtp: (phone: string, otp: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  token: getStoredToken(),
  status: 'idle',
  error: null,

  hydrate: async () => {
    const token = getStoredToken();
    if (!token) {
      set({ status: 'unauthed' });
      return;
    }
    set({ status: 'checking' });
    try {
      const r = await api.get<AdminUser>('/api/admin/me');
      set({ user: r.data, token, status: 'authed', error: null });
    } catch {
      setStoredToken(null);
      set({ user: null, token: null, status: 'unauthed' });
    }
  },

  login: async (username, password) => {
    set({ status: 'checking', error: null });
    try {
      const r = await api.post<{ token: string; user: AdminUser }>(
        '/api/admin/login',
        { username, password },
      );
      setStoredToken(r.data.token);
      set({
        user: r.data.user,
        token: r.data.token,
        status: 'authed',
        error: null,
      });
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ??
        e?.message ??
        'Login failed — please try again.';
      set({ status: 'unauthed', error: msg });
      throw e;
    }
  },

  superRequestOtp: async (phone) => {
    set({ status: 'unauthed', error: null });
    try {
      await api.post('/api/admin/login/super/request-otp', { phone });
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ??
        e?.message ??
        'Could not send the code — please try again.';
      set({ error: msg });
      throw e;
    }
  },

  superVerifyOtp: async (phone, otp) => {
    set({ status: 'checking', error: null });
    try {
      const r = await api.post<{ token: string; user: AdminUser }>(
        '/api/admin/login/super/verify-otp',
        { phone, otp },
      );
      setStoredToken(r.data.token);
      set({
        user: r.data.user,
        token: r.data.token,
        status: 'authed',
        error: null,
      });
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ??
        e?.message ??
        'Verification failed — please try again.';
      set({ status: 'unauthed', error: msg });
      throw e;
    }
  },

  logout: () => {
    setStoredToken(null);
    set({ user: null, token: null, status: 'unauthed' });
    // Clear cached data by kicking the router to /login through a hard
    // reload — cheaper than plumbing a QueryClient reference in here.
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
}));

/** Convenience: has the app finished checking whether a token is valid? */
export const useAuthReady = () => {
  const s = useAuthStore(x => x.status);
  return s === 'authed' || s === 'unauthed';
};

// ─── Role helpers ─────────────────────────────────────────────────
// Roles come from the DB as a raw string. The Thymeleaf side uses
// String.contains() checks — mirror that so we can't accidentally
// disagree about who is what. See WorkflowUserRoles.java on the
// backend for the canonical constants.

export const ROLE_SUPER_ADMIN = 'SUPER_ADMIN';
export const ROLE_ADMIN = 'ADMIN';
export const ROLE_DELIVERY_AGENT = 'DELIVERY_AGENT';
export const ROLE_STORE_MANAGER = 'STORE_MANAGER';
export const ROLE_REGIONAL_HEAD = 'REGIONAL_HEAD';

export function hasRole(user: AdminUser | null, role: string): boolean {
  if (!user || !user.roles) return false;
  return user.roles.includes(role);
}

/**
 * Whole-token match, unlike hasRole's `includes` — with substring
 * matching, checking for ADMIN inside "SUPER_ADMIN" is true (desired:
 * a super admin can do everything an admin can) but checking for
 * SUPER_ADMIN must never be true for a plain ADMIN.
 */
export const isSuperAdmin = (u: AdminUser | null): boolean => {
  if (!u || !u.roles) return false;
  return u.roles
    .split(',')
    .some(t => t.trim().toUpperCase() === ROLE_SUPER_ADMIN);
};

export const isAdmin = (u: AdminUser | null) => hasRole(u, ROLE_ADMIN);
export const isDeliveryAgent = (u: AdminUser | null) =>
  hasRole(u, ROLE_DELIVERY_AGENT);

/**
 * A DA-only login has no other back-office role — send them to
 * /deliveries; anyone else (admin, store manager, mixed roles) goes
 * to the dashboard.
 */
export function landingRouteFor(user: AdminUser | null): string {
  if (!user) return '/login';
  if (isDeliveryAgent(user) && !isAdmin(user)) return '/deliveries';
  return '/';
}
