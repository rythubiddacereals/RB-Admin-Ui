import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Edit2,
  ExternalLink,
  Loader2,
  Plus,
  PlayCircle,
  RefreshCw,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Product intro / how-to video catalog. One page across all
 * products so ops can moderate the whole set without hunting
 * product-by-product.
 *
 * Hard delete IS exposed here — nothing else in the schema
 * references a specific video row, so removal is safe.
 *
 * Preview: when the URL is a YouTube link, we surface a thumbnail
 * via the standard `img.youtube.com/vi/<id>/hqdefault.jpg` pattern.
 * Anything else falls back to a generic video icon.
 */

interface VideoRow {
  id: number;
  productId: number;
  productName: string;
  videoUrl: string;
  status: number;
}

interface ListResponse {
  count: number;
  videos: VideoRow[];
}

interface ProductRow {
  id: number;
  name: string;
  sku: string;
}

interface ProductsResponse {
  count: number;
  products: ProductRow[];
}

interface FormValues {
  id: number;
  productId: number;
  videoUrl: string;
  status: number;
}

const EMPTY_FORM: FormValues = {
  id: 0,
  productId: 0,
  videoUrl: '',
  status: 1,
};

/**
 * Extract a YouTube video ID from a URL, if possible. Returns null
 * for non-YouTube URLs — we only preview those we can be sure of.
 */
function youtubeThumb(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    let id: string | null = null;
    if (u.hostname.includes('youtube.com')) {
      id = u.searchParams.get('v');
      if (!id && u.pathname.startsWith('/shorts/')) {
        id = u.pathname.split('/')[2] || null;
      }
    } else if (u.hostname.includes('youtu.be')) {
      id = u.pathname.slice(1);
    }
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  } catch {
    return null;
  }
}

export function VideosPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'videos'],
    queryFn: async () => {
      const r = await api.get<ListResponse>('/api/admin/videos');
      return r.data;
    },
  });

  // Products for the picker — cached across the app, so this is
  // effectively free on subsequent visits.
  const productsQuery = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: async () => {
      const r = await api.get<ProductsResponse>('/api/admin/products');
      return r.data;
    },
  });

  const [form, setForm] = useState<FormValues | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<VideoRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const videos = useMemo(() => data?.videos ?? [], [data]);
  const filtered = useMemo(() => {
    if (!query.trim()) return videos;
    const needle = query.trim().toLowerCase();
    return videos.filter(v =>
      [v.productName, v.videoUrl, String(v.productId)]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [videos, query]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const saveMut = useMutation({
    mutationFn: async (payload: FormValues) => {
      const body = {
        productId: payload.productId,
        videoUrl: payload.videoUrl.trim(),
        status: payload.status,
      };
      if (payload.id > 0) {
        const r = await api.put<VideoRow>(
          `/api/admin/videos/${payload.id}`,
          body,
        );
        return r.data;
      }
      const r = await api.post<VideoRow>('/api/admin/videos', body);
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'videos'] });
      qc.invalidateQueries({
        queryKey: ['admin', 'product', fresh.productId],
      });
      setForm(null);
      setSaveError(null);
      flash(`Saved · ${fresh.productName || `product #${fresh.productId}`}`);
    },
    onError: (err: any) => {
      setSaveError(
        err?.response?.data?.message ??
          err?.message ??
          'Could not save video.',
      );
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/admin/videos/${id}`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'videos'] });
      setConfirmDelete(null);
      flash('Video deleted');
    },
  });

  const openCreate = () => {
    setSaveError(null);
    setForm({ ...EMPTY_FORM });
  };
  const openEdit = (v: VideoRow) => {
    setSaveError(null);
    setForm({
      id: v.id,
      productId: v.productId,
      videoUrl: v.videoUrl,
      status: v.status,
    });
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
            <Video size={22} /> Videos
          </h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading ? 'Loading…' : `${videos.length} product videos`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-56 rounded-lg border-2 border-secondary-200 px-4 py-2 font-semibold focus:border-primary-500 focus:outline-none"
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
            <Plus size={14} /> New video
          </button>
        </div>
      </div>

      {toast ? (
        <div className="mb-4 rounded-lg bg-success-soft px-4 py-2 text-sm font-bold text-success">
          {toast}
        </div>
      ) : null}

      {isLoading ? (
        <Loading label="Loading videos…" />
      ) : isError ? (
        <ErrorState message="Couldn't load videos." />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <Video size={40} className="mx-auto text-secondary-300" />
          <p className="mt-2 font-semibold text-secondary-800">
            {query ? `No videos matched "${query}".` : 'No videos yet.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(v => {
            const thumb = youtubeThumb(v.videoUrl);
            return (
              <div
                key={v.id}
                className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm"
              >
                <a
                  href={v.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="relative block aspect-video overflow-hidden bg-secondary-50"
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-secondary-400">
                      <PlayCircle size={40} />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/20">
                    <PlayCircle
                      className="text-white opacity-0 transition-opacity hover:opacity-90"
                      size={48}
                    />
                  </div>
                </a>
                <div className="p-3">
                  <Link
                    to={`/products/${v.productId}`}
                    className="line-clamp-1 font-bold text-primary-700 hover:underline"
                  >
                    {v.productName || `Product #${v.productId}`}
                  </Link>
                  <a
                    href={v.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 line-clamp-1 inline-flex items-center gap-1 text-xs font-semibold text-secondary-700 hover:text-primary-700"
                  >
                    {v.videoUrl}
                    <ExternalLink size={10} />
                  </a>
                  <div className="mt-3 flex items-center justify-end gap-1 border-t border-secondary-100 pt-2">
                    <button
                      onClick={() => openEdit(v)}
                      className="rounded-lg px-2 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50"
                    >
                      <Edit2 size={12} className="inline" /> Edit
                    </button>
                    <button
                      onClick={() => setConfirmDelete(v)}
                      className="rounded-lg px-2 py-1 text-xs font-bold text-danger hover:bg-danger-soft"
                    >
                      <Trash2 size={12} className="inline" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form ? (
        <VideoFormModal
          value={form}
          products={productsQuery.data?.products ?? []}
          productsLoading={productsQuery.isLoading}
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
          video={confirmDelete}
          submitting={deleteMut.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteMut.mutate(confirmDelete.id)}
        />
      ) : null}
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────

function VideoFormModal({
  value,
  products,
  productsLoading,
  onChange,
  onCancel,
  onSubmit,
  submitting,
  error,
}: {
  value: FormValues;
  products: ProductRow[];
  productsLoading: boolean;
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
    if (value.productId <= 0 || !value.videoUrl.trim()) return;
    onSubmit(value);
  };

  const thumb = youtubeThumb(value.videoUrl);
  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );

  return (
    <ModalShell
      title={isEdit ? `Edit video #${value.id}` : 'New video'}
      onCancel={onCancel}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Product" required>
          <select
            value={value.productId}
            onChange={e => set({ productId: Number(e.target.value) })}
            className={inputCls}
            required
            disabled={submitting || productsLoading}
          >
            <option value={0}>
              {productsLoading ? 'Loading…' : '— Select a product —'}
            </option>
            {sortedProducts.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.sku ? ` (${p.sku})` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Video URL" required>
          <input
            type="url"
            value={value.videoUrl}
            onChange={e => set({ videoUrl: e.target.value })}
            className={inputCls}
            placeholder="https://youtube.com/watch?v=…"
            maxLength={500}
            required
            autoFocus
            disabled={submitting}
          />
          {thumb ? (
            <img
              src={thumb}
              alt=""
              className="mt-2 h-24 rounded-lg border border-secondary-200 object-cover"
            />
          ) : null}
        </Field>
        <Field label="Status">
          <select
            value={value.status}
            onChange={e => set({ status: Number(e.target.value) })}
            className={inputCls}
            disabled={submitting}
          >
            <option value={1}>Active</option>
            <option value={0}>Hidden</option>
          </select>
        </Field>

        {error ? (
          <div className="rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
            {error}
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
            disabled={
              submitting || value.productId <= 0 || !value.videoUrl.trim()
            }
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 font-bold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-secondary-300"
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
            {isEdit ? 'Save changes' : 'Create video'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ConfirmDelete({
  video,
  submitting,
  onCancel,
  onConfirm,
}: {
  video: VideoRow;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell title="Delete this video?" onCancel={onCancel}>
      <p className="text-sm text-gray-800">
        The video attached to{' '}
        <b>{video.productName || `product #${video.productId}`}</b> will be
        permanently removed.
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
          className="inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2 font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
          Delete
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Shared ───────────────────────────────────────────────────────

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
