import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
  Instagram,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Curated Instagram reels for the website's "Follow us on Instagram"
 * strip. Paste the link Instagram gives you (Share → Copy link) —
 * the backend canonicalizes it and the shop renders the official
 * embed player, so there's nothing else to upload.
 *
 * Hard delete IS exposed here — a reel row isn't referenced by
 * anything else; deleting it just drops the embed from the site.
 */

interface Reel {
  id: number;
  reelUrl: string;
  caption: string;
  /** Raw S3 filename stored in the DB (what gets saved back). */
  videoUrl: string;
  /** Resolved URL for previewing the uploaded video. */
  videoPreview: string;
  isActive: number;
  sortOrder: number;
}

interface ListResponse {
  count: number;
  reels: Reel[];
}

interface FormValues {
  id: number;
  reelUrl: string;
  caption: string;
  videoUrl: string;
  videoPreview: string;
  isActive: number;
  sortOrder: string;
}

const EMPTY_FORM: FormValues = {
  id: 0,
  reelUrl: '',
  caption: '',
  videoUrl: '',
  videoPreview: '',
  isActive: 1,
  sortOrder: '0',
};

function reelToForm(r: Reel): FormValues {
  return {
    id: r.id,
    reelUrl: r.reelUrl,
    caption: r.caption,
    videoUrl: r.videoUrl,
    videoPreview: r.videoPreview,
    isActive: r.isActive,
    sortOrder: String(r.sortOrder),
  };
}

function formToPayload(f: FormValues) {
  return {
    reelUrl: f.reelUrl.trim(),
    caption: f.caption.trim(),
    videoUrl: f.videoUrl.trim(),
    isActive: f.isActive,
    sortOrder: Number(f.sortOrder) || 0,
  };
}

/** Shortcode part of the permalink — compact display label for the table. */
function reelCode(url: string): string {
  const m = url.match(/instagram\.com\/(?:reels?|p)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : url;
}

export function InstagramReelsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'instagram-reels'],
    queryFn: async () => {
      const r = await api.get<ListResponse>('/api/admin/instagram-reels');
      return r.data;
    },
  });

  const [form, setForm] = useState<FormValues | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Reel | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const reels = useMemo(() => data?.reels ?? [], [data]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const saveMut = useMutation({
    mutationFn: async (payload: FormValues) => {
      const body = formToPayload(payload);
      if (payload.id > 0) {
        const r = await api.put<Reel>(`/api/admin/instagram-reels/${payload.id}`, body);
        return r.data;
      }
      const r = await api.post<Reel>('/api/admin/instagram-reels', body);
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'instagram-reels'] });
      setForm(null);
      setSaveError(null);
      flash(`Saved · ${fresh.caption || reelCode(fresh.reelUrl)}`);
    },
    onError: (err: any) => {
      setSaveError(
        err?.response?.data?.message ??
          err?.message ??
          'Could not save reel.',
      );
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: number }) => {
      const r = await api.patch<Reel>(`/api/admin/instagram-reels/${id}/active`, {
        isActive: next,
      });
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'instagram-reels'] });
      flash(
        `${fresh.isActive === 1 ? 'Now showing' : 'Hidden'} · ${fresh.caption || reelCode(fresh.reelUrl)}`,
      );
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/admin/instagram-reels/${id}`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'instagram-reels'] });
      setConfirmDelete(null);
      flash('Reel removed');
    },
  });

  const openCreate = () => {
    setSaveError(null);
    setForm({ ...EMPTY_FORM });
  };
  const openEdit = (r: Reel) => {
    setSaveError(null);
    setForm(reelToForm(r));
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
            <Instagram size={22} /> Instagram Reels
          </h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading ? 'Loading…' : `${reels.length} configured`}
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
            <Plus size={14} /> Add reel
          </button>
        </div>
      </div>

      {toast ? (
        <div className="mb-4 rounded-lg bg-success-soft px-4 py-2 text-sm font-bold text-success">
          {toast}
        </div>
      ) : null}

      {isLoading ? (
        <Loading label="Loading reels…" />
      ) : isError ? (
        <ErrorState message="Couldn't load reels." />
      ) : reels.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <Instagram size={40} className="mx-auto text-secondary-300" />
          <p className="mt-2 font-semibold text-secondary-800">
            No reels yet. Add one and the website shows a "Follow us on
            Instagram" section with it — remove them all and the section
            disappears again.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Reel</th>
                <th className="px-4 py-3 text-right font-bold">Order</th>
                <th className="px-4 py-3 text-left font-bold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {reels.map(r => (
                <tr
                  key={r.id}
                  className="border-t border-secondary-100 hover:bg-primary-50"
                >
                  <td className="px-4 py-3">
                    <div className="font-bold text-gray-900">
                      {r.caption || `Reel ${reelCode(r.reelUrl)}`}
                    </div>
                    <a
                      href={r.reelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
                    >
                      <ExternalLink size={11} /> {r.reelUrl}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {r.sortOrder}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.isActive === 1 ? (
                        <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">
                          Showing
                        </span>
                      ) : (
                        <span className="rounded-full bg-secondary-100 px-3 py-1 text-xs font-bold text-secondary-800">
                          Hidden
                        </span>
                      )}
                      {r.videoUrl ? (
                        <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">
                          Plays in site
                        </span>
                      ) : (
                        <span
                          className="rounded-full bg-warning-soft px-3 py-1 text-xs font-bold text-warning"
                          title="No video uploaded — the site uses Instagram's embed, which stops after one play"
                        >
                          Embed only
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEdit(r)}
                        className="rounded-lg px-2 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50"
                      >
                        <Edit2 size={12} className="inline" /> Edit
                      </button>
                      <button
                        onClick={() =>
                          toggleMut.mutate({
                            id: r.id,
                            next: r.isActive === 1 ? 0 : 1,
                          })
                        }
                        disabled={toggleMut.isPending}
                        className={`rounded-lg px-2 py-1 text-xs font-bold ${
                          r.isActive === 1
                            ? 'text-secondary-800 hover:bg-secondary-100'
                            : 'text-success hover:bg-success-soft'
                        } disabled:opacity-50`}
                      >
                        {r.isActive === 1 ? (
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
                        onClick={() => setConfirmDelete(r)}
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
        <ReelFormModal
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
          reel={confirmDelete}
          submitting={deleteMut.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteMut.mutate(confirmDelete.id)}
        />
      ) : null}
    </div>
  );
}

// ─── Form modal ───────────────────────────────────────────────────

function ReelFormModal({
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

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadVideo = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api.post<{ path: string; url: string }>(
        '/api/admin/instagram-reels/upload-video',
        form,
        // Big files stream slowly — don't let the default 15s timeout
        // kill a legitimate upload.
        { timeout: 300_000 },
      );
      set({ videoUrl: r.data.path, videoPreview: r.data.url });
    } catch (err: any) {
      setUploadError(
        err?.response?.data?.message ?? err?.message ?? 'Upload failed.',
      );
    } finally {
      setUploading(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.reelUrl.trim() || uploading) return;
    onSubmit(value);
  };

  return (
    <ModalShell
      title={isEdit ? 'Edit reel' : 'Add reel'}
      onCancel={onCancel}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Reel link" required>
          <input
            type="url"
            value={value.reelUrl}
            onChange={e => set({ reelUrl: e.target.value })}
            className={inputCls}
            placeholder="https://www.instagram.com/reel/ABC123xyz/"
            maxLength={500}
            required
            autoFocus
            disabled={submitting}
          />
          <p className={hintCls}>
            On the reel, tap Share → Copy link and paste it here.
          </p>
        </Field>
        <Field label="Label (optional)">
          <input
            type="text"
            value={value.caption}
            onChange={e => set({ caption: e.target.value })}
            className={inputCls}
            placeholder="e.g. Ragi harvest video"
            maxLength={255}
            disabled={submitting}
          />
          <p className={hintCls}>
            Only shown in this list so you can tell reels apart — the
            website shows Instagram's own caption.
          </p>
        </Field>
        <Field label="Video file (recommended)">
          {value.videoUrl ? (
            <div className="flex items-center gap-3 rounded-lg border-2 border-secondary-200 p-3">
              {value.videoPreview ? (
                <video
                  src={value.videoPreview}
                  className="h-24 w-14 rounded-md object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-success">
                  ✓ Video attached — plays inside the website
                </p>
                <p className="truncate text-xs text-secondary-700">{value.videoUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => set({ videoUrl: '', videoPreview: '' })}
                disabled={submitting || uploading}
                className="rounded-lg px-2 py-1 text-xs font-bold text-danger hover:bg-danger-soft"
              >
                Remove
              </button>
            </div>
          ) : (
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) uploadVideo(f);
                e.target.value = '';
              }}
              className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:font-bold file:text-primary-700 disabled:opacity-60"
              disabled={submitting || uploading}
            />
          )}
          {uploading ? (
            <p className="mt-1 flex items-center gap-2 text-xs font-bold text-primary-700">
              <Loader2 className="animate-spin" size={12} /> Uploading video…
            </p>
          ) : null}
          {uploadError ? (
            <p className="mt-1 text-xs font-bold text-danger">{uploadError}</p>
          ) : null}
          <p className={hintCls}>
            Upload the same video you posted as the reel (MP4, max 100 MB).
            With a video, it plays and repeats inside the website. Without
            one, Instagram's player is used — it stops after one play and
            shows "Watch again on Instagram".
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
            <p className={hintCls}>Lower numbers sort first.</p>
          </Field>
          <Field label="Status">
            <select
              value={value.isActive}
              onChange={e => set({ isActive: Number(e.target.value) })}
              className={inputCls}
              disabled={submitting}
            >
              <option value={1}>Showing</option>
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
          submitLabel={isEdit ? 'Save changes' : 'Add reel'}
          onCancel={onCancel}
          disabled={!value.reelUrl.trim() || uploading}
        />
      </form>
    </ModalShell>
  );
}

function ConfirmDelete({
  reel,
  submitting,
  onCancel,
  onConfirm,
}: {
  reel: Reel;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell title="Remove this reel?" onCancel={onCancel}>
      <p className="text-sm text-gray-800">
        <b>{reel.caption || reelCode(reel.reelUrl)}</b> will be removed from
        the website's Instagram section.
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
