import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Edit2,
  Eye,
  EyeOff,
  Flag,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Home-page banner rows — top badge line (two lines) + scrolling
 * marquee text. Ops swaps promo copy from here without a redeploy.
 *
 * Hard delete IS exposed on this page (unlike Categories or
 * Quantity Options) because banners aren't referenced by other
 * tables — deleting a promo just drops it from the marquee.
 */

interface Banner {
  id: number;
  bannerType: string;
  badgeTextLine1: string;
  badgeTextLine2: string;
  scrollingText: string;
  isActive: number;
  displayOrder: number;
  updatedAt: string;
}

interface ListResponse {
  count: number;
  banners: Banner[];
}

interface FormValues {
  id: number;
  bannerType: string;
  badgeTextLine1: string;
  badgeTextLine2: string;
  scrollingText: string;
  isActive: number;
  displayOrder: string;
}

const EMPTY_FORM: FormValues = {
  id: 0,
  bannerType: '',
  badgeTextLine1: '',
  badgeTextLine2: '',
  scrollingText: '',
  isActive: 1,
  displayOrder: '0',
};

function bannerToForm(b: Banner): FormValues {
  return {
    id: b.id,
    bannerType: b.bannerType,
    badgeTextLine1: b.badgeTextLine1,
    badgeTextLine2: b.badgeTextLine2,
    scrollingText: b.scrollingText,
    isActive: b.isActive,
    displayOrder: String(b.displayOrder),
  };
}

function formToPayload(f: FormValues) {
  return {
    bannerType: f.bannerType.trim(),
    badgeTextLine1: f.badgeTextLine1,
    badgeTextLine2: f.badgeTextLine2,
    scrollingText: f.scrollingText,
    isActive: f.isActive,
    displayOrder: Number(f.displayOrder) || 0,
  };
}

export function BannersPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'banners'],
    queryFn: async () => {
      const r = await api.get<ListResponse>('/api/admin/banners');
      return r.data;
    },
  });

  const [form, setForm] = useState<FormValues | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Banner | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const banners = useMemo(() => data?.banners ?? [], [data]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const saveMut = useMutation({
    mutationFn: async (payload: FormValues) => {
      const body = formToPayload(payload);
      if (payload.id > 0) {
        const r = await api.put<Banner>(`/api/admin/banners/${payload.id}`, body);
        return r.data;
      }
      const r = await api.post<Banner>('/api/admin/banners', body);
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'banners'] });
      setForm(null);
      setSaveError(null);
      flash(`Saved · ${fresh.bannerType}`);
    },
    onError: (err: any) => {
      setSaveError(
        err?.response?.data?.message ??
          err?.message ??
          'Could not save banner.',
      );
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: number }) => {
      const r = await api.patch<Banner>(`/api/admin/banners/${id}/active`, {
        isActive: next,
      });
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'banners'] });
      flash(
        `${fresh.isActive === 1 ? 'Activated' : 'Deactivated'} ${fresh.bannerType}`,
      );
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/admin/banners/${id}`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'banners'] });
      setConfirmDelete(null);
      flash('Banner deleted');
    },
  });

  const openCreate = () => {
    setSaveError(null);
    setForm({ ...EMPTY_FORM });
  };
  const openEdit = (b: Banner) => {
    setSaveError(null);
    setForm(bannerToForm(b));
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
            <Flag size={22} /> Banners
          </h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading ? 'Loading…' : `${banners.length} configured`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-primary-500 px-3 py-2 text-sm font-bold text-primary-700 hover:bg-primary-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-sm font-bold text-white hover:bg-primary-600"
          >
            <Plus size={14} /> New banner
          </button>
        </div>
      </div>

      {toast ? (
        <div className="mb-4 rounded-lg bg-success-soft px-4 py-2 text-sm font-bold text-success">
          {toast}
        </div>
      ) : null}

      {isLoading ? (
        <Loading label="Loading banners…" />
      ) : isError ? (
        <ErrorState message="Couldn't load banners." />
      ) : banners.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <Flag size={40} className="mx-auto text-secondary-300" />
          <p className="mt-2 font-semibold text-secondary-800">
            No banners yet. Add one to control the promo strip at the top of
            the shop.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Type</th>
                <th className="px-4 py-3 text-left font-bold">Content</th>
                <th className="px-4 py-3 text-right font-bold">Order</th>
                <th className="px-4 py-3 text-left font-bold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {banners.map(b => (
                <tr
                  key={b.id}
                  className="border-t border-secondary-100 hover:bg-primary-50"
                >
                  <td className="px-4 py-3">
                    <div className="font-bold text-gray-900">{b.bannerType}</div>
                    {b.updatedAt ? (
                      <div className="text-xs text-secondary-700">
                        Updated {b.updatedAt}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {b.badgeTextLine1 || b.badgeTextLine2 ? (
                      <div className="text-gray-800">
                        {b.badgeTextLine1 ? (
                          <div className="font-semibold">{b.badgeTextLine1}</div>
                        ) : null}
                        {b.badgeTextLine2 ? (
                          <div className="text-xs">{b.badgeTextLine2}</div>
                        ) : null}
                      </div>
                    ) : null}
                    {b.scrollingText ? (
                      <div className="mt-1 line-clamp-1 text-xs text-secondary-700">
                        <span className="font-bold uppercase">marquee: </span>
                        {b.scrollingText}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {b.displayOrder}
                  </td>
                  <td className="px-4 py-3">
                    {b.isActive === 1 ? (
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
                        onClick={() => openEdit(b)}
                        className="rounded-lg px-2 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50"
                      >
                        <Edit2 size={12} className="inline" /> Edit
                      </button>
                      <button
                        onClick={() =>
                          toggleMut.mutate({
                            id: b.id,
                            next: b.isActive === 1 ? 0 : 1,
                          })
                        }
                        disabled={toggleMut.isPending}
                        className={`rounded-lg px-2 py-1 text-xs font-bold ${
                          b.isActive === 1
                            ? 'text-secondary-800 hover:bg-secondary-100'
                            : 'text-success hover:bg-success-soft'
                        } disabled:opacity-50`}
                      >
                        {b.isActive === 1 ? (
                          <>
                            <EyeOff size={12} className="inline" /> Hide
                          </>
                        ) : (
                          <>
                            <Eye size={12} className="inline" /> Show
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(b)}
                        className="rounded-lg px-2 py-1 text-xs font-bold text-danger hover:bg-danger-soft"
                      >
                        <Trash2 size={12} className="inline" /> Delete
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
        <BannerFormModal
          value={form}
          onChange={v => {
            setForm(v);
            setSaveError(null);
          }}
          onCancel={() => setForm(null)}
          onSubmit={v => saveMut.mutate(v)}
          submitting={saveMut.isPending}
          error={saveError}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDelete
          banner={confirmDelete}
          submitting={deleteMut.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteMut.mutate(confirmDelete.id)}
        />
      ) : null}
    </div>
  );
}

// ─── Form modal ───────────────────────────────────────────────────

function BannerFormModal({
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.bannerType.trim()) return;
    onSubmit(value);
  };

  return (
    <ModalShell
      title={isEdit ? `Edit ${value.bannerType || 'banner'}` : 'New banner'}
      onCancel={onCancel}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Banner type" required>
          <input
            type="text"
            value={value.bannerType}
            onChange={e => set({ bannerType: e.target.value })}
            className={inputCls}
            placeholder="e.g. MAIN_BANNER, TOP_STRIP"
            maxLength={50}
            required
            autoFocus
            disabled={submitting}
          />
          <p className={hintCls}>
            Uppercase snake-case identifier the shop uses to pick the row.
          </p>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Badge text — line 1">
            <input
              type="text"
              value={value.badgeTextLine1}
              onChange={e => set({ badgeTextLine1: e.target.value })}
              className={inputCls}
              placeholder="FLAT 20% OFF"
              disabled={submitting}
            />
          </Field>
          <Field label="Badge text — line 2">
            <input
              type="text"
              value={value.badgeTextLine2}
              onChange={e => set({ badgeTextLine2: e.target.value })}
              className={inputCls}
              placeholder="on orders above ₹499"
              disabled={submitting}
            />
          </Field>
        </div>
        <Field label="Scrolling marquee text">
          <input
            type="text"
            value={value.scrollingText}
            onChange={e => set({ scrollingText: e.target.value })}
            className={inputCls}
            placeholder="Free delivery in Hyderabad · Same-day dispatch before 3 PM"
            disabled={submitting}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display order">
            <input
              type="number"
              value={value.displayOrder}
              onChange={e => set({ displayOrder: e.target.value })}
              className={inputCls}
              disabled={submitting}
            />
            <p className={hintCls}>Lower numbers sort first.</p>
          </Field>
          <Field label="Status">
            <select
              value={value.isActive}
              onChange={e => set({ isActive: Number(e.target.value) })}
              className={inputCls}
              disabled={submitting}
            >
              <option value={1}>Active</option>
              <option value={0}>Inactive</option>
            </select>
          </Field>
        </div>

        {error ? (
          <div className="rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
            {error}
          </div>
        ) : null}

        <ModalActions
          submitting={submitting}
          submitLabel={isEdit ? 'Save changes' : 'Create banner'}
          onCancel={onCancel}
          disabled={!value.bannerType.trim()}
        />
      </form>
    </ModalShell>
  );
}

function ConfirmDelete({
  banner,
  submitting,
  onCancel,
  onConfirm,
}: {
  banner: Banner;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell title="Delete this banner?" onCancel={onCancel}>
      <p className="text-sm text-gray-800">
        <b>{banner.bannerType}</b> will be permanently removed from the promo
        strip.
      </p>
      <p className="mt-2 text-xs text-secondary-800">
        Tip: <b>Hide</b> is reversible; delete is not.
      </p>
      <div className="mt-6 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border-2 border-secondary-300 px-4 py-2 font-bold text-gray-800 hover:bg-secondary-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2 font-bold text-white hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
          Delete
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Shared building blocks (small enough to inline) ──────────────

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xl rounded-xl bg-white p-6 shadow-2xl"
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
