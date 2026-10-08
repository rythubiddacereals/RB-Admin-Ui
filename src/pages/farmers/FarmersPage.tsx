import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Edit2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Sprout,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Farmer partner directory — powers the Meet Today's Farmer overlay
 * on the home hero and the /farmers list on the shop.
 *
 * Hard delete IS exposed here; farmers aren't referenced by other
 * tables. `Hide` is the reversible option; `Delete` is not.
 *
 * The "today's farmer" flag is mutually exclusive: clicking Set as
 * Today's on any row atomically clears the flag on every other
 * farmer server-side, so exactly one row is featured at a time.
 *
 * `storyFull` is a rich-text HTML field — MVP renders a plain
 * textarea; upgrade to react-quill (or similar) later without any
 * API change since we already store raw HTML.
 */

interface Farmer {
  id: number;
  name: string;
  location: string;
  cropSpecialty: string;
  storyShort: string;
  storyFull: string;
  yearsFarming: number | null;
  harvestedDaysAgo: number | null;
  isActive: number;
  isTodaysFarmer: number;
  sortOrder: number;
  updatedAt: string;
}

interface ListResponse {
  count: number;
  farmers: Farmer[];
}

interface FormValues {
  id: number;
  name: string;
  location: string;
  cropSpecialty: string;
  storyShort: string;
  storyFull: string;
  yearsFarming: string;
  harvestedDaysAgo: string;
  isActive: number;
  sortOrder: string;
}

const EMPTY_FORM: FormValues = {
  id: 0,
  name: '',
  location: '',
  cropSpecialty: '',
  storyShort: '',
  storyFull: '',
  yearsFarming: '',
  harvestedDaysAgo: '',
  isActive: 1,
  sortOrder: '0',
};

function farmerToForm(f: Farmer): FormValues {
  return {
    id: f.id,
    name: f.name,
    location: f.location,
    cropSpecialty: f.cropSpecialty,
    storyShort: f.storyShort,
    storyFull: f.storyFull,
    yearsFarming: f.yearsFarming != null ? String(f.yearsFarming) : '',
    harvestedDaysAgo: f.harvestedDaysAgo != null ? String(f.harvestedDaysAgo) : '',
    isActive: f.isActive,
    sortOrder: String(f.sortOrder),
  };
}

function formToPayload(f: FormValues) {
  return {
    name: f.name.trim(),
    location: f.location.trim(),
    cropSpecialty: f.cropSpecialty.trim(),
    storyShort: f.storyShort,
    storyFull: f.storyFull,
    yearsFarming: f.yearsFarming.trim() === '' ? null : Number(f.yearsFarming),
    harvestedDaysAgo: f.harvestedDaysAgo.trim() === '' ? null : Number(f.harvestedDaysAgo),
    isActive: f.isActive,
    sortOrder: Number(f.sortOrder) || 0,
  };
}

export function FarmersPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'farmers'],
    queryFn: async () => {
      const r = await api.get<ListResponse>('/api/admin/farmers');
      return r.data;
    },
  });

  const [form, setForm] = useState<FormValues | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Farmer | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const farmers = useMemo(() => data?.farmers ?? [], [data]);

  // Client-side filter across the three fields the admin thinks in:
  // who (name), what they grow (crop), where (location).
  const filtered = useMemo(() => {
    if (!query.trim()) return farmers;
    const needle = query.trim().toLowerCase();
    return farmers.filter(
      f =>
        (f.name ?? '').toLowerCase().includes(needle) ||
        (f.cropSpecialty ?? '').toLowerCase().includes(needle) ||
        (f.location ?? '').toLowerCase().includes(needle),
    );
  }, [farmers, query]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const saveMut = useMutation({
    mutationFn: async (payload: FormValues) => {
      const body = formToPayload(payload);
      if (payload.id > 0) {
        const r = await api.put<Farmer>(`/api/admin/farmers/${payload.id}`, body);
        return r.data;
      }
      const r = await api.post<Farmer>('/api/admin/farmers', body);
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'farmers'] });
      setForm(null);
      setSaveError(null);
      flash(`Saved · ${fresh.name}`);
    },
    onError: (err: any) => {
      setSaveError(
        err?.response?.data?.message ?? err?.message ?? 'Could not save farmer.',
      );
    },
  });

  const toggleActiveMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: number }) => {
      const r = await api.patch<Farmer>(`/api/admin/farmers/${id}/active`, {
        isActive: next,
      });
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'farmers'] });
      flash(`${fresh.isActive === 1 ? 'Activated' : 'Hidden'} ${fresh.name}`);
    },
  });

  const todaysMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await api.patch<Farmer>(`/api/admin/farmers/${id}/todays`, {});
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'farmers'] });
      flash(`Now featured: ${fresh.name}`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/admin/farmers/${id}`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'farmers'] });
      setConfirmDelete(null);
      flash('Farmer deleted');
    },
  });

  const openCreate = () => {
    setSaveError(null);
    setForm({ ...EMPTY_FORM });
  };
  const openEdit = (f: Farmer) => {
    setSaveError(null);
    setForm(farmerToForm(f));
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
            <Sprout size={22} /> Farmers
          </h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading ? 'Loading…' : `${farmers.length} on file`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, crop, location…"
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
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-sm font-bold text-white hover:bg-primary-600"
          >
            <Plus size={14} /> New farmer
          </button>
        </div>
      </div>

      {toast ? (
        <div className="mb-4 rounded-lg bg-success-soft px-4 py-2 text-sm font-bold text-success">
          {toast}
        </div>
      ) : null}

      {isLoading ? (
        <Loading label="Loading farmers…" />
      ) : isError ? (
        <ErrorState message="Couldn't load farmers." />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <Sprout size={40} className="mx-auto text-secondary-300" />
          <p className="mt-2 font-semibold text-secondary-800">
            {query.trim()
              ? `No farmers matched "${query.trim()}".`
              : 'No farmers yet. Add one to feature it on the shop\'s "Meet Today\'s Farmer" card.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Farmer</th>
                <th className="px-4 py-3 text-left font-bold">Location</th>
                <th className="px-4 py-3 text-left font-bold">Crop</th>
                <th className="px-4 py-3 text-right font-bold">Order</th>
                <th className="px-4 py-3 text-left font-bold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr
                  key={f.id}
                  className="border-t border-secondary-100 hover:bg-primary-50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-gray-900">{f.name}</div>
                      {f.isTodaysFarmer === 1 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold uppercase text-primary-700">
                          <Star size={10} className="fill-current" /> Today
                        </span>
                      ) : null}
                    </div>
                    {f.storyShort ? (
                      <div className="mt-0.5 line-clamp-1 text-xs text-secondary-700">
                        {f.storyShort}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-gray-800">{f.location || '—'}</td>
                  <td className="px-4 py-3 text-gray-800">{f.cropSpecialty || '—'}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {f.sortOrder}
                  </td>
                  <td className="px-4 py-3">
                    {f.isActive === 1 ? (
                      <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-secondary-100 px-3 py-1 text-xs font-bold text-secondary-800">
                        Hidden
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEdit(f)}
                        className="rounded-lg px-2 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50"
                      >
                        <Edit2 size={12} className="inline" /> Edit
                      </button>
                      {f.isTodaysFarmer !== 1 ? (
                        <button
                          onClick={() => todaysMut.mutate(f.id)}
                          disabled={todaysMut.isPending || f.isActive !== 1}
                          title={
                            f.isActive !== 1
                              ? 'Farmer must be Active before being featured'
                              : 'Feature as Today\'s Farmer'
                          }
                          className="rounded-lg px-2 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Award size={12} className="inline" /> Set as Today
                        </button>
                      ) : null}
                      <button
                        onClick={() =>
                          toggleActiveMut.mutate({
                            id: f.id,
                            next: f.isActive === 1 ? 0 : 1,
                          })
                        }
                        disabled={toggleActiveMut.isPending}
                        className={`rounded-lg px-2 py-1 text-xs font-bold ${
                          f.isActive === 1
                            ? 'text-secondary-800 hover:bg-secondary-100'
                            : 'text-success hover:bg-success-soft'
                        } disabled:opacity-50`}
                      >
                        {f.isActive === 1 ? (
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
                        onClick={() => setConfirmDelete(f)}
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
        <FarmerFormModal
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
          farmer={confirmDelete}
          submitting={deleteMut.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteMut.mutate(confirmDelete.id)}
        />
      ) : null}
    </div>
  );
}

// ─── Form modal ───────────────────────────────────────────────────

function FarmerFormModal({
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
    if (!value.name.trim() || !value.location.trim() || !value.cropSpecialty.trim()) return;
    onSubmit(value);
  };

  return (
    <ModalShell
      title={isEdit ? `Edit ${value.name || 'farmer'}` : 'New farmer'}
      onCancel={onCancel}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" required>
          <input
            type="text"
            value={value.name}
            onChange={e => set({ name: e.target.value })}
            className={inputCls}
            placeholder="Ramesh Garu"
            maxLength={120}
            required
            autoFocus
            disabled={submitting}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location" required>
            <input
              type="text"
              value={value.location}
              onChange={e => set({ location: e.target.value })}
              className={inputCls}
              placeholder="Nizamabad"
              maxLength={120}
              required
              disabled={submitting}
            />
          </Field>
          <Field label="Crop specialty" required>
            <input
              type="text"
              value={value.cropSpecialty}
              onChange={e => set({ cropSpecialty: e.target.value })}
              className={inputCls}
              placeholder="Sona Masoori"
              maxLength={120}
              required
              disabled={submitting}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Years farming">
            <input
              type="number"
              min={0}
              value={value.yearsFarming}
              onChange={e => set({ yearsFarming: e.target.value })}
              className={inputCls}
              placeholder="12"
              disabled={submitting}
            />
          </Field>
          <Field label="Harvested — days ago">
            <input
              type="number"
              min={0}
              value={value.harvestedDaysAgo}
              onChange={e => set({ harvestedDaysAgo: e.target.value })}
              className={inputCls}
              placeholder="3"
              disabled={submitting}
            />
            <p className={hintCls}>
              Drives the "Harvested N days ago" line on the shop overlay.
            </p>
          </Field>
        </div>
        <Field label="Short bio (for the overlay + cards)">
          <textarea
            value={value.storyShort}
            onChange={e => set({ storyShort: e.target.value })}
            className={inputCls + ' h-20 resize-none'}
            placeholder="One or two lines · plain text · max 500 chars"
            maxLength={500}
            disabled={submitting}
          />
        </Field>
        <Field label="Full story (for /farmers/:id detail page)">
          <textarea
            value={value.storyFull}
            onChange={e => set({ storyFull: e.target.value })}
            className={inputCls + ' h-40 font-mono text-xs'}
            placeholder={'<p>Rich text — accepts HTML tags:</p>\n<p><b>Bold</b>, <i>italic</i>, <ul><li>lists</li></ul>, <a href="#">links</a>.</p>'}
            disabled={submitting}
          />
          <p className={hintCls}>
            Rich-text HTML. Rendered on the shop's farmer detail page. A visual
            editor is a follow-up — for now, paste HTML directly.
          </p>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display order">
            <input
              type="number"
              value={value.sortOrder}
              onChange={e => set({ sortOrder: e.target.value })}
              className={inputCls}
              disabled={submitting}
            />
            <p className={hintCls}>Lower numbers sort first on the shop.</p>
          </Field>
          <Field label="Status">
            <select
              value={value.isActive}
              onChange={e => set({ isActive: Number(e.target.value) })}
              className={inputCls}
              disabled={submitting}
            >
              <option value={1}>Active</option>
              <option value={0}>Hidden</option>
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
          submitLabel={isEdit ? 'Save changes' : 'Create farmer'}
          onCancel={onCancel}
          disabled={!value.name.trim()}
        />
      </form>
    </ModalShell>
  );
}

function ConfirmDelete({
  farmer,
  submitting,
  onCancel,
  onConfirm,
}: {
  farmer: Farmer;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell title="Delete this farmer?" onCancel={onCancel}>
      <p className="text-sm text-gray-800">
        <b>{farmer.name}</b> will be permanently removed.
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
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
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
