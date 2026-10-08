import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Edit2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Customer coupons.
 *
 * A coupon is a flat rupee amount the admin hands to specific customers.
 * The shop applies it (once, from the customer's second order onward,
 * only when the cart's items subtotal is at least the amount) — this page
 * only defines coupons and decides who holds them.
 *
 *   • Add / edit coupon (code, title, amount, optional validity window)
 *   • Activate / deactivate (inactive = hidden from every customer)
 *   • Assign to customers (pick from the customer list, or everyone)
 *   • See who holds it, who used it and on which order; withdraw an
 *     unused assignment
 */

interface CouponDto {
  id: number;
  code: string;
  title: string;
  amount: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: number;
  createdAt: string | null;
  assignedCount: number;
  usedCount: number;
}

interface AssignmentDto {
  id: number;
  customerId: number;
  customerName: string;
  phone: string;
  email: string;
  status: 'ASSIGNED' | 'USED' | string;
  assignedAt: string | null;
  usedAt: string | null;
  orderId: number | null;
}

interface CustomerRow {
  id: number;
  firstname: string;
  lastname?: string;
  email: string;
  phone: string;
  isActive?: number;
}

interface FormValues {
  id: number; // 0 = create
  code: string;
  title: string;
  amount: string;
  startsAt: string; // datetime-local
  endsAt: string;
}

/** Server sends IST "yyyy-MM-dd HH:mm"; the admin is used from India, so local parse is right. */
function couponLifecycle(c: { startsAt: string | null; endsAt: string | null; isActive: number }):
  'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'SCHEDULED' {
  if (c.isActive !== 1) return 'INACTIVE';
  const now = Date.now();
  const toMs = (s: string | null) => (s ? new Date(s.replace(' ', 'T')).getTime() : NaN);
  const end = toMs(c.endsAt);
  if (!Number.isNaN(end) && end < now) return 'EXPIRED';
  const start = toMs(c.startsAt);
  if (!Number.isNaN(start) && start > now) return 'SCHEDULED';
  return 'ACTIVE';
}

const EMPTY_FORM: FormValues = { id: 0, code: '', title: '', amount: '', startsAt: '', endsAt: '' };

// 'yyyy-MM-dd HH:mm' (IST, from the API) → datetime-local value
const toDatetimeLocal = (s: string | null): string => (s ? s.replace(' ', 'T').slice(0, 16) : '');

const inr = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CouponsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: async () => (await api.get<{ coupons: CouponDto[] }>('/api/admin/coupons')).data,
  });
  const coupons = useMemo(() => data?.coupons ?? [], [data]);

  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormValues | null>(null);
  const [assignFor, setAssignFor] = useState<CouponDto | null>(null);
  const [holdersFor, setHoldersFor] = useState<CouponDto | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return coupons;
    return coupons.filter(c => `${c.code} ${c.title}`.toLowerCase().includes(needle));
  }, [coupons, query]);

  const saveMut = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload = {
        code: v.code.trim().toUpperCase(),
        title: v.title.trim(),
        amount: Number(v.amount),
        startsAt: v.startsAt || null,
        endsAt: v.endsAt || null,
      };
      if (v.id > 0) return (await api.put<CouponDto>(`/api/admin/coupons/${v.id}`, payload)).data;
      return (await api.post<CouponDto>('/api/admin/coupons', payload)).data;
    },
    onSuccess: c => {
      qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      setForm(null);
      flash(`Saved · ${c.code}`);
    },
  });

  const toggleMut = useMutation({
    mutationFn: async (c: CouponDto) =>
      (await api.patch<CouponDto>(`/api/admin/coupons/${c.id}/active`, { isActive: c.isActive === 1 ? 0 : 1 })).data,
    onSuccess: c => {
      qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      flash(c.isActive === 1 ? `${c.code} is active` : `${c.code} deactivated`);
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
            <Ticket size={22} /> Coupons
          </h1>
          <p className="mt-1 text-sm font-semibold text-secondary-800">
            Flat-amount coupons you hand to specific customers. Usable once, from their second
            order onward, when the cart is at least the coupon amount.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search code or title…"
            className="rounded-lg border-2 border-secondary-200 px-3 py-2 text-sm font-semibold focus:border-primary-500 focus:outline-none"
          />
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1 rounded-lg border-2 border-secondary-300 px-3 py-2 text-sm font-bold text-gray-800 hover:bg-secondary-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={() => setForm(EMPTY_FORM)}
            className="inline-flex items-center gap-1 rounded-lg bg-primary-500 px-3 py-2 text-sm font-bold text-white hover:bg-primary-600"
          >
            <Plus size={14} /> New coupon
          </button>
        </div>
      </header>

      {toast ? (
        <div className="rounded-lg bg-success-soft px-4 py-2 text-sm font-bold text-success">{toast}</div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-secondary-200 bg-white py-12">
          <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
          <span className="font-semibold text-secondary-800">Loading coupons…</span>
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-danger bg-danger-soft px-6 py-8 text-center font-bold text-danger">
          Couldn't load coupons. Try refreshing.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center font-semibold text-secondary-700">
          {coupons.length === 0
            ? 'No coupons yet. Create one, then assign it to customers.'
            : `No coupons match "${query.trim()}".`}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-secondary-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Code</th>
                <th className="px-4 py-3 text-left font-bold">Title</th>
                <th className="px-4 py-3 text-right font-bold">Amount</th>
                <th className="px-4 py-3 text-left font-bold">Valid</th>
                <th className="px-4 py-3 text-center font-bold">Assigned</th>
                <th className="px-4 py-3 text-center font-bold">Used</th>
                <th className="px-4 py-3 text-left font-bold">Status</th>
                <th className="px-4 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-t border-secondary-100 hover:bg-primary-50">
                  <td className="px-4 py-3 font-extrabold text-gray-900">{c.code}</td>
                  <td className="px-4 py-3 text-gray-800">{c.title || '—'}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{inr(c.amount)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-secondary-800">
                    {c.startsAt || c.endsAt
                      ? `${c.startsAt ?? 'now'} → ${c.endsAt ?? 'no expiry'}`
                      : 'No expiry'}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-gray-900">{c.assignedCount}</td>
                  <td className="px-4 py-3 text-center font-bold text-gray-900">{c.usedCount}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const lc = couponLifecycle(c);
                      const cls =
                        lc === 'ACTIVE'
                          ? 'bg-success-soft text-success'
                          : lc === 'EXPIRED'
                          ? 'bg-danger-soft text-danger'
                          : lc === 'SCHEDULED'
                          ? 'bg-warning-soft text-warning'
                          : 'bg-secondary-100 text-secondary-800';
                      const label =
                        lc === 'ACTIVE' ? 'Active' : lc === 'EXPIRED' ? 'Expired' : lc === 'SCHEDULED' ? 'Scheduled' : 'Inactive';
                      return <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${cls}`}>{label}</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setAssignFor(c)}
                        title={couponLifecycle(c) === 'EXPIRED' ? 'Expired - extend the validity first' : 'Assign to customers'}
                        disabled={couponLifecycle(c) === 'EXPIRED'}
                        className="inline-flex items-center gap-1 rounded-lg border-2 border-primary-500 px-2.5 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-50"
                      >
                        <Users size={13} /> Assign
                      </button>
                      <button
                        onClick={() => setHoldersFor(c)}
                        title="Who has this coupon"
                        className="rounded-lg px-2 py-1.5 text-xs font-bold text-gray-800 hover:bg-secondary-100"
                      >
                        Holders
                      </button>
                      <button
                        onClick={() =>
                          setForm({
                            id: c.id,
                            code: c.code,
                            title: c.title,
                            amount: String(c.amount),
                            startsAt: toDatetimeLocal(c.startsAt),
                            endsAt: toDatetimeLocal(c.endsAt),
                          })
                        }
                        title="Edit"
                        className="rounded-lg p-1.5 text-gray-800 hover:bg-secondary-100"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => toggleMut.mutate(c)}
                        title={c.isActive === 1 ? 'Deactivate' : 'Activate'}
                        className="rounded-lg p-1.5 text-gray-800 hover:bg-secondary-100"
                      >
                        {c.isActive === 1 ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form ? (
        <CouponFormModal
          value={form}
          onChange={setForm}
          onCancel={() => setForm(null)}
          onSubmit={v => saveMut.mutate(v)}
          submitting={saveMut.isPending}
          error={
            saveMut.isError
              ? ((saveMut.error as any)?.response?.data?.message ?? 'Could not save coupon.')
              : null
          }
        />
      ) : null}

      {assignFor ? (
        <AssignModal
          coupon={assignFor}
          onCancel={() => setAssignFor(null)}
          onDone={n => {
            qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
            setAssignFor(null);
            flash(`${assignFor.code} assigned to ${n} customer${n === 1 ? '' : 's'}`);
          }}
        />
      ) : null}

      {holdersFor ? (
        <HoldersModal
          coupon={holdersFor}
          onCancel={() => setHoldersFor(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ['admin', 'coupons'] })}
        />
      ) : null}
    </div>
  );
}

// ─── Create / edit ────────────────────────────────────────────────

function CouponFormModal({
  value,
  onChange,
  onCancel,
  onSubmit,
  submitting,
  error,
}: {
  value: FormValues;
  onChange: (v: FormValues) => void;
  onCancel: () => void;
  onSubmit: (v: FormValues) => void;
  submitting: boolean;
  error: string | null;
}) {
  const isEdit = value.id > 0;
  const set = (patch: Partial<FormValues>) => onChange({ ...value, ...patch });
  const codeOk = /^[A-Z0-9]{3,20}$/.test(value.code.trim().toUpperCase());
  const amountOk = Number(value.amount) > 0;
  const titleOk = value.title.trim().length > 0;
  // datetime-local `min` — current local minute, so the picker greys out the past.
  const nowLocal = (() => {
    const d = new Date();
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();
  const startOk = !value.startsAt || isEdit || value.startsAt >= nowLocal;
  const endOk = !value.endsAt || value.endsAt > nowLocal;
  const orderOk = !value.startsAt || !value.endsAt || value.endsAt > value.startsAt;
  const datesOk = startOk && endOk && orderOk;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeOk || !amountOk || !titleOk || !datesOk) return;
    onSubmit(value);
  };
  return (
    <ModalShell title={isEdit ? `Edit ${value.code}` : 'New coupon'} onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" required>
            <input
              type="text"
              value={value.code}
              onChange={e => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
              className={inputCls}
              placeholder="e.g. SAVE150"
              maxLength={20}
              required
              autoFocus
              disabled={submitting}
            />
            <p className={hintCls}>3–20 letters/digits. Customers see this code.</p>
          </Field>
          <Field label="Amount (₹)" required>
            <input
              type="number"
              min={1}
              step="0.01"
              value={value.amount}
              onChange={e => set({ amount: e.target.value })}
              className={inputCls}
              placeholder="150"
              required
              disabled={submitting}
            />
            <p className={hintCls}>Cart must be at least this much to use it.</p>
          </Field>
        </div>
        <Field label="Title" required>
          <input
            type="text"
            value={value.title}
            onChange={e => set({ title: e.target.value })}
            className={inputCls}
            placeholder="e.g. Festival gift"
            maxLength={120}
            required
            disabled={submitting}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valid from">
            <input
              type="datetime-local"
              value={value.startsAt}
              min={isEdit ? undefined : nowLocal}
              onChange={e => set({ startsAt: e.target.value })}
              className={inputCls}
              disabled={submitting}
            />
            <p className={hintCls}>Blank = usable immediately.</p>
            {!startOk ? <p className="mt-1 text-xs font-bold text-danger">'Valid from' cannot be in the past.</p> : null}
          </Field>
          <Field label="Valid till">
            <input
              type="datetime-local"
              value={value.endsAt}
              min={value.startsAt && value.startsAt > nowLocal ? value.startsAt : nowLocal}
              onChange={e => set({ endsAt: e.target.value })}
              className={inputCls}
              disabled={submitting}
            />
            <p className={hintCls}>Blank = no expiry. Past dates are not accepted.</p>
            {!endOk ? <p className="mt-1 text-xs font-bold text-danger">'Valid till' must be in the future.</p> : null}
            {!orderOk ? <p className="mt-1 text-xs font-bold text-danger">'Valid till' must be after 'Valid from'.</p> : null}
          </Field>
        </div>
        {error ? <p className="text-sm font-bold text-danger">{error}</p> : null}
        <ModalActions
          submitting={submitting}
          submitLabel={isEdit ? 'Save changes' : 'Create coupon'}
          onCancel={onCancel}
          disabled={!codeOk || !amountOk || !titleOk || !datesOk}
        />
      </form>
    </ModalShell>
  );
}

// ─── Assign to customers ──────────────────────────────────────────

function AssignModal({
  coupon,
  onCancel,
  onDone,
}: {
  coupon: CouponDto;
  onCancel: () => void;
  onDone: (assigned: number) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'customers'],
    queryFn: async () => (await api.get<{ customers: CustomerRow[] }>('/api/admin/customers')).data,
  });
  const customers = useMemo(() => (data?.customers ?? []).filter(c => c.isActive !== 0), [data]);
  // Who already has this coupon - shown as a badge and not selectable again.
  const { data: heldData } = useQuery({
    queryKey: ['admin', 'coupons', coupon.id, 'assignments'],
    queryFn: async () =>
      (await api.get<{ assignments: AssignmentDto[] }>(`/api/admin/coupons/${coupon.id}/assignments`)).data,
  });
  const heldBy = useMemo(() => {
    const m = new Map<number, string>();
    (heldData?.assignments ?? []).forEach(a => m.set(a.customerId, a.status));
    return m;
  }, [heldData]);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? customers.filter(c =>
          `${c.firstname} ${c.lastname ?? ''} ${c.phone} ${c.email}`.toLowerCase().includes(needle),
        )
      : customers;
    return list.slice(0, 200);
  }, [customers, q]);

  const toggle = (id: number) =>
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const mut = useMutation({
    mutationFn: async (body: { customerIds?: number[]; all?: boolean }) =>
      (await api.post<{ assigned: number; requested: number }>(`/api/admin/coupons/${coupon.id}/assign`, body)).data,
    onSuccess: r => onDone(r.assigned),
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Could not assign.'),
  });

  return (
    <ModalShell title={`Assign ${coupon.code} (${inr(coupon.amount)})`} onCancel={onCancel}>
      <div className="space-y-3">
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          className={inputCls}
          placeholder="Search customers by name, phone or email…"
          autoFocus
        />
        <div className="max-h-72 overflow-y-auto rounded-lg border-2 border-secondary-200">
          {isLoading ? (
            <div className="px-3 py-6 text-center text-sm font-semibold text-secondary-700">Loading customers…</div>
          ) : shown.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm font-semibold text-secondary-700">No customers match.</div>
          ) : (
            shown.map(c => {
              const on = picked.has(c.id);
              const held = heldBy.get(c.id);
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-3 border-b border-secondary-100 px-3 py-2 last:border-b-0 ${
                    held ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                  } ${on ? 'bg-primary-50' : held ? '' : 'hover:bg-secondary-50'}`}
                  title={held ? 'This customer already has this coupon' : undefined}
                >
                  <input type="checkbox" checked={on} disabled={!!held} onChange={() => toggle(c.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-gray-900">
                      {`${c.firstname} ${c.lastname ?? ''}`.trim() || `Customer #${c.id}`}
                    </div>
                    <div className="truncate text-xs font-semibold text-secondary-700">
                      {[c.phone, c.email].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {held ? (
                    <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-[10px] font-bold text-secondary-800">
                      {held === 'USED' ? 'Already used' : 'Already assigned'}
                    </span>
                  ) : null}
                  {on ? <CheckCircle2 size={16} className="text-primary-600" /> : null}
                </label>
              );
            })
          )}
        </div>
        <p className={hintCls}>
          {picked.size} selected · customers who already hold this coupon are skipped automatically.
        </p>
        {error ? <p className="text-sm font-bold text-danger">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Give ${coupon.code} to ALL ${customers.length} active customers?`)) {
                mut.mutate({ all: true });
              }
            }}
            disabled={mut.isPending}
            className="rounded-lg border-2 border-secondary-300 px-3 py-2 text-sm font-bold text-gray-800 hover:bg-secondary-50"
          >
            Assign to all customers
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={mut.isPending}
              className="rounded-lg border-2 border-secondary-300 px-4 py-2 font-bold text-gray-800 hover:bg-secondary-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => mut.mutate({ customerIds: Array.from(picked) })}
              disabled={mut.isPending || picked.size === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 font-bold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-secondary-300"
            >
              {mut.isPending ? <Loader2 className="animate-spin" size={16} /> : null}
              Assign to {picked.size || ''} selected
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Holders ──────────────────────────────────────────────────────

function HoldersModal({
  coupon,
  onCancel,
  onChanged,
}: {
  coupon: CouponDto;
  onCancel: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'coupons', coupon.id, 'assignments'],
    queryFn: async () =>
      (await api.get<{ assignments: AssignmentDto[] }>(`/api/admin/coupons/${coupon.id}/assignments`)).data,
  });
  const rows = data?.assignments ?? [];
  const removeMut = useMutation({
    mutationFn: async (customerId: number) =>
      api.delete(`/api/admin/coupons/${coupon.id}/assign/${customerId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'coupons', coupon.id, 'assignments'] });
      onChanged();
    },
  });
  return (
    <ModalShell title={`${coupon.code} · holders`} onCancel={onCancel}>
      {isLoading ? (
        <div className="py-6 text-center text-sm font-semibold text-secondary-700">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-sm font-semibold text-secondary-700">
          Nobody holds this coupon yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-secondary-200">
          <table className="w-full text-sm">
            <thead className="bg-secondary-50 text-secondary-800">
              <tr>
                <th className="px-3 py-2 text-left font-bold">Customer</th>
                <th className="px-3 py-2 text-left font-bold">Status</th>
                <th className="px-3 py-2 text-left font-bold">Assigned</th>
                <th className="px-3 py-2 text-left font-bold">Used</th>
                <th className="px-3 py-2 text-right font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id} className="border-t border-secondary-100">
                  <td className="px-3 py-2">
                    <div className="font-bold text-gray-900">{a.customerName || `Customer #${a.customerId}`}</div>
                    <div className="text-xs font-semibold text-secondary-700">
                      {[a.phone, a.email].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        a.status === 'USED' ? 'bg-secondary-100 text-secondary-800' : 'bg-success-soft text-success'
                      }`}
                    >
                      {a.status === 'USED' ? 'Used' : 'Available'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs font-semibold text-secondary-800">{a.assignedAt ?? '—'}</td>
                  <td className="px-3 py-2 text-xs font-semibold text-secondary-800">
                    {a.status === 'USED' ? `${a.usedAt ?? ''}${a.orderId ? ` · order #${a.orderId}` : ''}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {a.status !== 'USED' ? (
                      <button
                        onClick={() => removeMut.mutate(a.customerId)}
                        disabled={removeMut.isPending}
                        className="text-xs font-bold text-danger hover:underline"
                      >
                        Withdraw
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border-2 border-secondary-300 px-4 py-2 font-bold text-gray-800 hover:bg-secondary-50"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
}

// ─── shared bits (same look as the other admin pages) ─────────────

const inputCls =
  'w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none disabled:opacity-60';
const hintCls = 'mt-1 text-xs font-semibold text-secondary-700';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-primary-700">{title}</h2>
          <button onClick={onCancel} className="rounded p-1 text-secondary-800 hover:bg-secondary-100">
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
  disabled?: boolean;
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
        {required ? <span className="text-danger">*</span> : null}
      </label>
      {children}
    </div>
  );
}
