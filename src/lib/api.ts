import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

/**
 * Shared Axios instance for every rb-admin-react API call.
 *
 * - `baseURL` is empty in dev (Vite's proxy in vite.config.ts
 *   forwards /api → :8081), or picked up from
 *   VITE_API_BASE_URL for a deployed frontend.
 * - Request interceptor attaches the JWT from localStorage on every
 *   call so pages don't have to remember to set the header.
 * - Response interceptor auto-signs-out on 401 so a stale/expired
 *   token bounces the operator to /login instead of leaving them
 *   staring at silent failures.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  timeout: 15_000,
});

const TOKEN_STORAGE_KEY = 'rb_admin_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // best-effort — SSR / privacy mode / disabled storage
  }
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getStoredToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  r => r,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token invalid / expired — clear it and let the ProtectedRoute
      // pick that up on the next render to redirect to /login.
      setStoredToken(null);
      // Only redirect if we're not already on /login (avoid loops).
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export { api };
