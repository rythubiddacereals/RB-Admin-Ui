import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Shield,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Support Users — the admin/DA/manager accounts that can sign into
 * rb-admin. NOT customer accounts (those live in Customers).
 *
 * Roles are stored as a comma-separated string ("ADMIN,STORE_MANAGER"),
 * so the picker is multi-select. The Thymeleaf side uses the same
 * shape — we don't want two forms disagreeing about what a valid
 * role string looks like.
 *
 * Password fields are write-only. The list endpoint intentionally
 * doesn't return the hash, and rename/role edits leave it untouched
 * unless the user explicitly ticks "reset password".
 */

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin', hint: 'Full back-office access' },
  { value: 'STORE_MANAGER', label: 'Store Manager', hint: 'Back-office minus superadmin' },
  { value: 'DELIVERY_AGENT', label: 'Delivery Agent', hint: 'Only sees /deliveries' },
  { value: 'REGIONAL_HEAD', label: 'Regional Head', hint: 'Multi-store oversight' },
];

interface SupportUser {
  id: number;
  username: string;
  email: string;
  roles: string;
  isActive: number;
  failCount: number;
}

interface ListResponse {
  count: number;
  users: SupportUser[];
}

function rolesToArray(raw: string): string[] {
  return (raw || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
}

function arrayToRoles(arr: string[]): string {
  return arr.join(',');
}

export function SupportUsersPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'support-users'],
    queryFn: async () => {
      const r = await api.get<ListResponse>('/api/admin/support-users');
      return r.data;
    },
  });

  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SupportUser | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const users = useMemo(() => data?.users ?? [], [data]);
  const filtered = useMemo(() => {
    if (!query.trim()) return users;
    const needle = query.trim().toLowerCase();
    return users.filter(
      u =>
        u.username.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle) ||
        u.roles.toLowerCase().includes(needle),
    );
  }, [users, query]);

  const toggleMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: number }) => {
      const r = await api.patch<SupportUser>(
        `/api/admin/support-users/${id}/active`,
        { isActive: next },
      );
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'support-users'] });
      flash(
        `${fresh.isActive === 1 ? 'Enabled' : 'Disabled'} ${fresh.username}`,
      );
    },
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
            <Users size={22} /> Support Users
          </h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading ? 'Loading…' : `${users.length} accounts`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by username, email, role…"
            className="w-72 rounded-lg border-2 border-secondary-200 px-4 py-2 font-semibold focus:border-primary-500 focus:outline-none"
          />
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-primary-500 px-3 py-2 text-sm font-bold text-primary-700 hover:bg-primary-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-sm font-bold text-white hover:bg-primary-600"
          >
            <UserPlus size={14} /> New user
          </button>
        </div>
      </div>

      {toast ? (
        <div className="mb-4 rounded-lg bg-success-soft px-4 py-2 text-sm font-bold text-success">
          {toast}
        </div>
      ) : null}

      {isLoading ? (
        <Loading label="Loading users…" />
      ) : isError ? (
        <ErrorState message="Couldn't load support users." />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <Users size={40} className="mx-auto text-secondary-300" />
          <p className="mt-2 font-semibold text-secondary-800">
            {query ? `No users matched "${query}".` : 'No users yet.'}
          </p>
        </div>
      ) : (
        // Header stays fixed; only rows scroll, scrollbar hidden —
        // same treatment as the Customers table.
        <div className="no-scrollbar max-h-[65vh] overflow-y-auto rounded-xl border border-secondary-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-primary-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Username</th>
                <th className="px-4 py-3 text-left font-bold">Roles</th>
                <th className="px-4 py-3 text-left font-bold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr
                  key={u.id}
                  className="border-t border-secondary-100 hover:bg-primary-50"
                >
                  <td className="px-4 py-3">
                    <div className="font-bold text-gray-900">{u.username}</div>
                    {u.failCount > 3 ? (
                      <div className="text-xs font-bold text-danger">
                        locked ({u.failCount} failed attempts)
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {rolesToArray(u.roles).map(r => (
                        <RoleChip key={r} role={r} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.isActive === 1 ? (
                      <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-secondary-100 px-3 py-1 text-xs font-bold text-secondary-800">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditing(u)}
                        className="rounded-lg px-2 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50"
                      >
                        <KeyRound size={12} className="inline" /> Edit
                      </button>
                      <button
                        onClick={() =>
                          toggleMut.mutate({
                            id: u.id,
                            next: u.isActive === 1 ? 0 : 1,
                          })
                        }
                        disabled={toggleMut.isPending}
                        className={`rounded-lg px-2 py-1 text-xs font-bold ${
                          u.isActive === 1
                            ? 'text-secondary-800 hover:bg-secondary-100'
                            : 'text-success hover:bg-success-soft'
                        } disabled:opacity-50`}
                      >
                        {u.isActive === 1 ? (
                          <>
                            <EyeOff size={12} className="inline" /> Disable
                          </>
                        ) : (
                          <>
                            <Eye size={12} className="inline" /> Enable
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate ? (
        <CreateUserModal
          onCancel={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['admin', 'support-users'] });
            flash('User created');
          }}
        />
      ) : null}

      {editing ? (
        <EditUserModal
          user={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['admin', 'support-users'] });
            flash('User updated');
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────

function CreateUserModal({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<string[]>(['ADMIN']);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      const r = await api.post<SupportUser>('/api/admin/support-users', {
        username: username.trim(),
        password,
        // Email removed from the form — support users log in by
        // username; the API accepts an empty email.
        email: '',
        roles: arrayToRoles(roles),
      });
      return r.data;
    },
    onSuccess: () => onCreated(),
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err?.message ?? 'Could not create user.',
      ),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || password.length < 4 || roles.length === 0) return;
    mut.mutate();
  };

  return (
    <ModalShell title="New support user" onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username" required>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className={inputCls}
            placeholder="e.g. rajesh.k"
            maxLength={60}
            required
            autoFocus
            disabled={mut.isPending}
          />
        </Field>
        <Field label="Password" required>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={inputCls}
            placeholder="At least 4 characters"
            required
            minLength={4}
            disabled={mut.isPending}
          />
        </Field>
        <Field label="Roles" required>
          <RolesPicker value={roles} onChange={setRoles} disabled={mut.isPending} />
        </Field>

        {error ? (
          <div className="rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
            {error}
          </div>
        ) : null}

        <ModalActions
          submitting={mut.isPending}
          submitLabel="Create user"
          onCancel={onCancel}
          disabled={
            !username.trim() || password.length < 4 || roles.length === 0
          }
        />
      </form>
    </ModalShell>
  );
}

function EditUserModal({
  user,
  onCancel,
  onSaved,
}: {
  user: SupportUser;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [roles, setRoles] = useState<string[]>(rolesToArray(user.roles));
  const [resetPassword, setResetPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      const body: any = {
        username: username.trim(),
        roles: arrayToRoles(roles),
        // Email field removed from the form — pass the stored value
        // through unchanged so editing never wipes it.
        email: user.email ?? '',
      };
      if (resetPassword && password.trim().length >= 4) {
        body.password = password;
      }
      const r = await api.put<SupportUser>(
        `/api/admin/support-users/${user.id}`,
        body,
      );
      return r.data;
    },
    onSuccess: () => onSaved(),
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err?.message ?? 'Could not save changes.',
      ),
  });

  const disabled =
    !username.trim() ||
    roles.length === 0 ||
    (resetPassword && password.length < 4);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    mut.mutate();
  };

  return (
    <ModalShell title={`Edit ${user.username}`} onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username" required>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className={inputCls}
            maxLength={60}
            required
            autoFocus
            disabled={mut.isPending}
          />
        </Field>
        <Field label="Roles" required>
          <RolesPicker value={roles} onChange={setRoles} disabled={mut.isPending} />
        </Field>

        <div className="rounded-lg border border-secondary-200 bg-secondary-50 p-3">
          <label className="flex items-center gap-2 text-sm font-bold text-gray-800">
            <input
              type="checkbox"
              checked={resetPassword}
              onChange={e => setResetPassword(e.target.checked)}
              disabled={mut.isPending}
            />
            Reset password
          </label>
          {resetPassword ? (
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={`${inputCls} mt-2`}
              placeholder="New password (min 4 chars)"
              minLength={4}
              disabled={mut.isPending}
              autoFocus
            />
          ) : (
            <p className="mt-1 text-xs font-semibold text-secondary-700">
              Existing password stays in place.
            </p>
          )}
        </div>

        {error ? (
          <div className="rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
            {error}
          </div>
        ) : null}

        <ModalActions
          submitting={mut.isPending}
          submitLabel="Save changes"
          onCancel={onCancel}
          disabled={disabled}
        />
      </form>
    </ModalShell>
  );
}

// ─── Building blocks ──────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none disabled:opacity-60';

function ModalShell({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-primary-700">{title}</h2>
          <button
            onClick={onCancel}
            className="rounded p-1 text-secondary-800 hover:bg-secondary-100"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  submitting,
  submitLabel,
  onCancel,
  disabled,
}: {
  submitting: boolean;
  submitLabel: string;
  onCancel: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="rounded-lg border-2 border-secondary-300 px-4 py-2 font-bold text-gray-800 hover:bg-secondary-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting || disabled}
        className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 font-bold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-secondary-300"
      >
        {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
        {submitLabel}
      </button>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-bold text-gray-800">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {children}
    </div>
  );
}

function RolesPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (roles: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (role: string) => {
    if (value.includes(role)) {
      onChange(value.filter(r => r !== role));
    } else {
      onChange([...value, role]);
    }
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ROLE_OPTIONS.map(o => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            disabled={disabled}
            className={`flex items-start gap-2 rounded-lg border-2 p-3 text-left transition-colors ${
              on
                ? 'border-primary-500 bg-primary-50'
                : 'border-secondary-200 hover:bg-secondary-50'
            } disabled:opacity-60`}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => toggle(o.value)}
              onClick={e => e.stopPropagation()}
              disabled={disabled}
              className="mt-1"
            />
            <div>
              <div className="text-sm font-bold text-gray-900">{o.label}</div>
              <div className="text-xs font-semibold text-secondary-700">
                {o.hint}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function RoleChip({ role }: { role: string }) {
  const label =
    ROLE_OPTIONS.find(o => o.value === role)?.label ??
    role.replace(/_/g, ' ');
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-extrabold uppercase text-primary-700">
      <Shield size={9} /> {label}
    </span>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-secondary-200 bg-white py-12">
      <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
      <span className="font-semibold text-secondary-800">{label}</span>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-danger bg-danger-soft px-6 py-8 text-center">
      <p className="font-bold text-danger">{message}</p>
    </div>
  );
}
