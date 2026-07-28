import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Edit2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Marketing gallery items (homepage hero + secondary tiles).
 * Grouped by code, ordered by position within a group.
 *
 * No hard delete — the shop templates key off code+position, so a
 * missing row can break layouts. Toggle active instead. Mirrors the
 * Categories and Quantity Options patterns.
 */

interface GalleryItem {
  id: number;
  code: string;
  heading: string;
  description: string;
  name: string;
  image: string;
  imageRaw: string;
  orientation: string;
  isActive: number;
  position: number;
  section: number;
}

interface ListResponse {
  count: number;
  gallery: GalleryItem[];
}

interface FormValues {
  id: number;
  code: string;
  heading: string;
  description: string;
  name: string;
  /** RAW path stored in the DB (S3 filename) — what gets saved. */
  image: string;
  /** Resolved URL for the form preview only — never sent to the API. */
  imagePreview: string;
  orientation: string;
  position: string;
  section: string;
  isActive: number;
}

// New items are always home-hero backgrounds: code MAIN_GALLERY,
// landscape orientation, no text fields — the shop overlays its own
// fixed copy, so heading/name/description/section stay empty. When
// EDITING an existing row, itemToForm preserves whatever values the
// row already has (they're kept in form state, just not shown), so
// saving never wipes legacy data.
const EMPTY_FORM: FormValues = {
  id: 0,
  code: 'MAIN_GALLERY',
  heading: '',
  description: '',
  name: '',
  image: '',
  imagePreview: '',
  // Matches the legacy constant the Thymeleaf flow writes — the rest
  // of the system keys off 'HORIZONTAL', not CSS-style 'landscape'.
  orientation: 'HORIZONTAL',
  position: '0',
  section: '0',
  isActive: 1,
};

function itemToForm(g: GalleryItem): FormValues {
  return {
    id: g.id,
    code: g.code,
    heading: g.heading,
    description: g.description,
    name: g.name,
    // Save the raw path, not the resolved CDN URL — otherwise saves
    // would round-trip the CDN prefix into the DB. The resolved URL
    // is kept separately so the edit form can PREVIEW the current
    // image (a raw filename isn't loadable by the browser).
    image: g.imageRaw,
    imagePreview: g.image,
    orientation: g.orientation,
    position: String(g.position),
    section: String(g.section),
    isActive: g.isActive,
  };
}

function formToPayload(f: FormValues) {
  return {
    code: f.code.trim(),
    heading: f.heading,
    description: f.description,
    name: f.name,
    image: f.image.trim(),
    orientation: f.orientation.trim(),
    position: Number(f.position) || 0,
    section: Number(f.section) || 0,
    isActive: f.isActive,
  };
}

export function GalleryPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'gallery'],
    queryFn: async () => {
      const r = await api.get<ListResponse>('/api/admin/gallery');
      return r.data;
    },
  });

  const [form, setForm] = useState<FormValues | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const items = useMemo(() => data?.gallery ?? [], [data]);

  // Distinct codes for the filter chip row — useful when the gallery
  // spans many home-page sections.
  const codes = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => i.code && s.add(i.code));
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (!filter) return items;
    return items.filter(i => i.code === filter);
  }, [items, filter]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const saveMut = useMutation({
    mutationFn: async (payload: FormValues) => {
      const body = formToPayload(payload);
      if (payload.id > 0) {
        const r = await api.put<GalleryItem>(
          `/api/admin/gallery/${payload.id}`,
          body,
        );
        return r.data;
      }
      const r = await api.post<GalleryItem>('/api/admin/gallery', body);
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'gallery'] });
      setForm(null);
      setSaveError(null);
      flash(`Saved · ${fresh.code}${fresh.name ? ` · ${fresh.name}` : ''}`);
    },
    onError: (err: any) => {
      setSaveError(
        err?.response?.data?.message ??
          err?.message ??
          'Could not save gallery item.',
      );
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: number }) => {
      const r = await api.patch<GalleryItem>(
        `/api/admin/gallery/${id}/active`,
        { isActive: next },
      );
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'gallery'] });
      flash(
        `${fresh.isActive === 1 ? 'Activated' : 'Deactivated'} ${fresh.code}`,
      );
    },
  });

  const openCreate = () => {
    setSaveError(null);
    setForm({ ...EMPTY_FORM });
  };
  const openEdit = (g: GalleryItem) => {
    setSaveError(null);
    setForm(itemToForm(g));
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
            <ImageIcon size={22} /> Gallery
          </h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading ? 'Loading…' : `${items.length} images configured`}
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
            <Plus size={14} /> New image
          </button>
        </div>
      </div>

      {toast ? (
        <div className="mb-4 rounded-lg bg-success-soft px-4 py-2 text-sm font-bold text-success">
          {toast}
        </div>
      ) : null}

      {codes.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('')}
            className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
              filter === ''
                ? 'bg-primary-500 text-white'
                : 'border border-secondary-200 bg-white text-gray-800 hover:bg-primary-50'
            }`}
          >
            All ({items.length})
          </button>
          {codes.map(c => {
            const count = items.filter(i => i.code === c).length;
            return (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                  filter === c
                    ? 'bg-primary-500 text-white'
                    : 'border border-secondary-200 bg-white text-gray-800 hover:bg-primary-50'
                }`}
              >
                {c} ({count})
              </button>
            );
          })}
        </div>
      ) : null}

      {isLoading ? (
        <Loading label="Loading gallery…" />
      ) : isError ? (
        <ErrorState message="Couldn't load gallery." />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <ImageIcon size={40} className="mx-auto text-secondary-300" />
          <p className="mt-2 font-semibold text-secondary-800">
            {filter
              ? `No images in "${filter}".`
              : 'No gallery items yet. Add one above.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(g => (
            <div
              key={g.id}
              className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm"
            >
              <div className="relative aspect-video overflow-hidden bg-secondary-50">
                {g.image ? (
                  <img
                    src={g.image}
                    alt={g.name || g.code}
                    className="h-full w-full object-cover"
                    onError={e => {
                      (e.currentTarget as HTMLImageElement).src =
                        '/placeholder-product.svg';
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-secondary-400">
                    <ImageIcon size={32} />
                  </div>
                )}
                <span
                  className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                    g.isActive === 1
                      ? 'bg-success text-white'
                      : 'bg-secondary-800 text-white'
                  }`}
                >
                  {g.isActive === 1 ? 'Active' : 'Hidden'}
                </span>
              </div>
              <div className="p-3">
                <div className="text-xs font-bold uppercase tracking-wide text-secondary-700">
                  {g.code}
                  {g.orientation ? ` · ${g.orientation}` : ''}
                  {' · #'}
                  {g.position}
                </div>
                <div className="mt-1 font-bold text-gray-900">
                  {g.heading || g.name || '(untitled)'}
                </div>
                {g.description ? (
                  <div className="mt-1 line-clamp-2 text-xs text-secondary-700">
                    {g.description}
                  </div>
                ) : null}
                <div className="mt-3 flex items-center justify-end gap-1 border-t border-secondary-100 pt-2">
                  <button
                    onClick={() => openEdit(g)}
                    className="rounded-lg px-2 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50"
                  >
                    <Edit2 size={12} className="inline" /> Edit
                  </button>
                  <button
                    onClick={() =>
                      toggleMut.mutate({
                        id: g.id,
                        next: g.isActive === 1 ? 0 : 1,
                      })
                    }
                    disabled={toggleMut.isPending}
                    className={`rounded-lg px-2 py-1 text-xs font-bold ${
                      g.isActive === 1
                        ? 'text-secondary-800 hover:bg-secondary-100'
                        : 'text-success hover:bg-success-soft'
                    } disabled:opacity-50`}
                  >
                    {g.isActive === 1 ? (
                      <>
                        <EyeOff size={12} className="inline" /> Hide
                      </>
                    ) : (
                      <>
                        <Eye size={12} className="inline" /> Show
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form ? (
        <GalleryFormModal
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
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────

function GalleryFormModal({
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
  // Validation feedback shown on click — the button itself stays
  // clickable so a missing image produces a visible message instead
  // of a silently-greyed button.
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.image.trim()) {
      setLocalError('Please upload an image first — click "Choose image".');
      return;
    }
    // Self-heal: the code field is no longer shown, and stale form
    // state (e.g. modal open across a hot-reload) can carry an empty
    // code that would fail backend validation. Always fall back.
    onSubmit({ ...value, code: value.code.trim() || 'MAIN_GALLERY' });
  };

  return (
    <ModalShell
      title={isEdit ? `Edit gallery item #${value.id}` : 'New gallery item'}
      onCancel={onCancel}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Image" required>
          <GalleryImageUpload
            preview={value.imagePreview}
            onChange={(path, url) => {
              setLocalError(null);
              set({ image: path, imagePreview: url });
            }}
            disabled={submitting}
          />
        </Field>

        <Field label="Heading">
          <input
            type="text"
            value={value.heading}
            onChange={e => set({ heading: e.target.value })}
            className={inputCls}
            placeholder="Title for this image."
            disabled={submitting}
          />
        </Field>

        <Field label="Description">
          <textarea
            value={value.description}
            onChange={e => set({ description: e.target.value })}
            className={inputCls}
            rows={2}
            placeholder="Notes about this image."
            disabled={submitting}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Position">
            <input
              type="number"
              value={value.position}
              onChange={e => set({ position: e.target.value })}
              className={inputCls}
              disabled={submitting}
            />
            <p className={hintCls}>Lower numbers show first in the rotation.</p>
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

        <p className={hintCls}>
          Every image goes to the home-page hero rotation (Main Gallery) as a
          landscape background — no other settings needed.
        </p>

        {(error || localError) ? (
          <div className="rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
            {error || localError}
          </div>
        ) : null}

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
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 font-bold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-secondary-300"
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
            {isEdit ? 'Save changes' : 'Create item'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Image upload ─────────────────────────────────────────────────
// Direct file upload (no URL/path typing). Posts to the gallery's
// own multipart endpoint, which returns:
//   path — raw S3 filename, STORED in the DB (same convention as
//          legacy rows; CacheService.getPath resolves it on read, so
//          no absolute bucket URLs land in the database)
//   url  — resolved URL used purely for the live preview here
function GalleryImageUpload({
  preview,
  onChange,
  disabled,
}: {
  preview: string;
  onChange: (path: string, url: string) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = () => {
    if (disabled || uploading) return;
    inputRef.current?.click();
  };

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      // 60 s so a slow S3 upload doesn't hit the shared axios default.
      const r = await api.post<{ path: string; url: string }>(
        '/api/admin/gallery/upload-image',
        form,
        { timeout: 60_000 },
      );
      onChange(r.data.path, r.data.url);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-start gap-3">
      {preview ? (
        <img
          src={preview}
          alt=""
          className="h-24 w-40 flex-shrink-0 rounded-lg border border-secondary-200 object-cover"
          onError={e => {
            (e.target as HTMLImageElement).src = '/placeholder-product.svg';
          }}
        />
      ) : (
        <div className="flex h-24 w-40 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-secondary-300 text-xs font-semibold text-secondary-500">
          no image
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2">
        <button
          type="button"
          onClick={pick}
          disabled={disabled || uploading}
          className="inline-flex w-fit items-center gap-2 rounded-lg border-2 border-primary-500 px-3 py-2 text-sm font-bold text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <Upload size={14} />
          )}
          {uploading ? 'Uploading…' : preview ? 'Replace image' : 'Choose image'}
        </button>
        {preview ? (
          <button
            type="button"
            onClick={() => onChange('', '')}
            disabled={disabled || uploading}
            className="text-left text-xs font-bold text-danger hover:underline disabled:opacity-50"
          >
            Remove
          </button>
        ) : null}
        {error ? (
          <p className="text-xs font-semibold text-danger">{error}</p>
        ) : null}
        <p className={hintCls}>
          PNG / JPG / GIF / WEBP / SVG, up to 10 MB. Uploads straight to the
          image store — no URL typing. After replacing, click Save changes.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        className="hidden"
        disabled={disabled || uploading}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
    </div>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────

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
  // items-center + max-h + internal scroll: the form is taller than
  // small laptop viewports, and without a height cap the fixed panel
  // overflowed past the top/bottom edges (the "misaligned popup").
  // The header is sticky so the title + close stay visible while the
  // long form scrolls underneath.
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-secondary-100 bg-white px-6 py-4">
          <h2 className="text-lg font-extrabold text-primary-700">{title}</h2>
          <button
            onClick={onCancel}
            className="rounded p-1 text-secondary-800 hover:bg-secondary-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6 pt-4">{children}</div>
      </div>
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
