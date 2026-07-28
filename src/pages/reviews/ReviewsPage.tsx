import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ExternalLink,
  Loader2,
  MessageSquare,
  RefreshCw,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Product reviews moderation queue.
 *
 * Status values match what the backend/DB use (0/1/2) — the labels
 * ("Pending", "Approved", "Rejected") are cosmetic and only used
 * for the UI. This avoids yet-another-vocabulary bug where the
 * frontend and backend disagree about what "approved" means.
 *
 * Filter defaults to Pending because that's the queue an ops user
 * lives in day-to-day; Approved/Rejected/All are one tab away for
 * audit / undo scenarios.
 */

const STATUS_PENDING = 0;
const STATUS_APPROVED = 1;
const STATUS_REJECTED = 2;

interface Review {
  id: number;
  productId: number;
  productName: string;
  orderId: number;
  customerId: number;
  customerName: string;
  rating: number;
  title: string;
  review: string;
  status: number;
  statusReason: string;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  count: number;
  reviews: Review[];
}

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

const FILTERS: { key: Filter; label: string; predicate: (r: Review) => boolean }[] = [
  { key: 'pending', label: 'Pending', predicate: r => r.status === STATUS_PENDING },
  { key: 'approved', label: 'Approved', predicate: r => r.status === STATUS_APPROVED },
  { key: 'rejected', label: 'Rejected', predicate: r => r.status === STATUS_REJECTED },
  { key: 'all', label: 'All', predicate: () => true },
];

function statusLabel(status: number): { text: string; cls: string } {
  if (status === STATUS_APPROVED) return { text: 'Approved', cls: 'bg-success-soft text-success' };
  if (status === STATUS_REJECTED) return { text: 'Rejected', cls: 'bg-danger-soft text-danger' };
  return { text: 'Pending', cls: 'bg-warning-soft text-warning' };
}

export function ReviewsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'reviews'],
    queryFn: async () => {
      const r = await api.get<ListResponse>('/api/admin/reviews');
      return r.data;
    },
  });

  const [filter, setFilter] = useState<Filter>('pending');
  const [query, setQuery] = useState('');
  const [rejecting, setRejecting] = useState<Review | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Review | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const reviews = useMemo(() => data?.reviews ?? [], [data]);
  const counts = useMemo(
    () => ({
      pending: reviews.filter(r => r.status === STATUS_PENDING).length,
      approved: reviews.filter(r => r.status === STATUS_APPROVED).length,
      rejected: reviews.filter(r => r.status === STATUS_REJECTED).length,
      all: reviews.length,
    }),
    [reviews],
  );

  const filtered = useMemo(() => {
    const predicate =
      FILTERS.find(f => f.key === filter)?.predicate ?? (() => true);
    const matching = reviews.filter(predicate);
    if (!query.trim()) return matching;
    const needle = query.trim().toLowerCase();
    return matching.filter(r =>
      [r.productName, r.customerName, r.title, r.review, String(r.orderId)]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [reviews, filter, query]);

  const statusMut = useMutation({
    mutationFn: async ({
      id,
      status,
      statusReason,
    }: {
      id: number;
      status: number;
      statusReason?: string;
    }) => {
      setPendingId(id);
      const r = await api.patch<Review>(`/api/admin/reviews/${id}/status`, {
        status,
        statusReason: statusReason ?? '',
      });
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'reviews'] });
      qc.invalidateQueries({
        queryKey: ['admin', 'product', fresh.productId],
      });
      setPendingId(null);
      setRejecting(null);
      flash(
        fresh.status === STATUS_APPROVED
          ? `Approved review #${fresh.id}`
          : fresh.status === STATUS_REJECTED
          ? `Rejected review #${fresh.id}`
          : `Moved review #${fresh.id} to pending`,
      );
    },
    onError: (err: any) => {
      setPendingId(null);
      flash(
        err?.response?.data?.message ??
          err?.message ??
          'Status update failed.',
      );
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/admin/reviews/${id}`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'reviews'] });
      setConfirmDelete(null);
      flash('Review deleted');
    },
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
            <MessageSquare size={22} /> Reviews
          </h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading
              ? 'Loading…'
              : `${counts.pending} pending · ${counts.approved} approved · ${counts.rejected} rejected`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search reviews…"
            className="w-64 rounded-lg border-2 border-secondary-200 px-4 py-2 font-semibold focus:border-primary-500 focus:outline-none"
          />
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-primary-500 px-3 py-2 text-sm font-bold text-primary-700 hover:bg-primary-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {toast ? (
        <div className="mb-4 rounded-lg bg-primary-50 px-4 py-2 text-sm font-bold text-primary-700">
          {toast}
        </div>
      ) : null}

      {/* Filter tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
              filter === f.key
                ? 'bg-primary-500 text-white'
                : 'border border-secondary-200 bg-white text-gray-800 hover:bg-primary-50'
            }`}
          >
            {f.label}
            <span
              className={`inline-flex min-w-[24px] items-center justify-center rounded-full px-2 text-xs font-extrabold ${
                filter === f.key
                  ? 'bg-white/30 text-white'
                  : 'bg-secondary-100 text-secondary-800'
              }`}
            >
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loading label="Loading reviews…" />
      ) : isError ? (
        <ErrorState message="Couldn't load reviews." />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <MessageSquare size={40} className="mx-auto text-secondary-300" />
          <p className="mt-2 font-semibold text-secondary-800">
            {query
              ? `No matches for "${query}".`
              : filter === 'pending'
              ? 'Nothing to moderate — inbox zero.'
              : `No ${filter} reviews.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const status = statusLabel(r.status);
            const busy = pendingId === r.id;
            return (
              <div
                key={r.id}
                className="rounded-xl border border-secondary-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StarRating rating={r.rating} />
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${status.cls}`}
                    >
                      {status.text}
                    </span>
                    {r.orderId > 0 ? (
                      <Link
                        to={`/orders/${r.orderId}`}
                        className="inline-flex items-center gap-1 rounded-full bg-secondary-100 px-3 py-1 text-xs font-bold text-secondary-800 hover:bg-primary-50 hover:text-primary-700"
                      >
                        Order #{r.orderId} <ExternalLink size={10} />
                      </Link>
                    ) : null}
                  </div>
                  <div className="text-xs font-semibold text-secondary-700">
                    {r.createdAt}
                  </div>
                </div>

                {r.title ? (
                  <div className="text-base font-extrabold text-gray-900">
                    {r.title}
                  </div>
                ) : null}
                {r.review ? (
                  <p className="mt-1 text-sm text-gray-800">{r.review}</p>
                ) : (
                  <p className="mt-1 text-sm italic text-secondary-500">
                    (no comment)
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-secondary-800">
                  <span className="font-bold text-gray-900">
                    {r.customerName || 'Anonymous'}
                  </span>
                  <span>on</span>
                  <Link
                    to={`/products/${r.productId}`}
                    className="inline-flex items-center gap-1 font-bold text-primary-700 hover:underline"
                  >
                    {r.productName || `Product #${r.productId}`}
                    <ExternalLink size={10} />
                  </Link>
                </div>

                {r.statusReason ? (
                  <div className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
                    <b>Reason:</b> {r.statusReason}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-secondary-100 pt-3">
                  {/* Actions are the opposite of the current state,
                      so an operator can flip a decision in one click
                      without a two-step "move to pending → then
                      approve/reject" dance.
                        • Pending  → Approve + Reject (both progress)
                        • Approved → Reject (change mind)
                        • Rejected → Approve (change mind)
                      "Move back to pending" is always available on
                      an already-decided row for the case where the
                      operator wants to defer without flipping. */}
                  {r.status !== STATUS_APPROVED ? (
                    <button
                      onClick={() =>
                        statusMut.mutate({ id: r.id, status: STATUS_APPROVED })
                      }
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="animate-spin" size={12} />
                      ) : (
                        <Check size={12} />
                      )}
                      Approve
                    </button>
                  ) : null}
                  {r.status !== STATUS_REJECTED ? (
                    <button
                      onClick={() => setRejecting(r)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg border-2 border-danger px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger-soft disabled:opacity-50"
                    >
                      <X size={12} />
                      Reject
                    </button>
                  ) : null}
                  {r.status !== STATUS_PENDING ? (
                    <button
                      onClick={() =>
                        statusMut.mutate({ id: r.id, status: STATUS_PENDING })
                      }
                      disabled={busy}
                      className="rounded-lg px-3 py-1.5 text-xs font-bold text-secondary-800 hover:bg-secondary-100 disabled:opacity-50"
                    >
                      Move back to pending
                    </button>
                  ) : null}
                  <div className="flex-1" />
                  <button
                    onClick={() => setConfirmDelete(r)}
                    className="rounded-lg px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger-soft"
                  >
                    <Trash2 size={12} className="inline" /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rejecting ? (
        <RejectModal
          review={rejecting}
          submitting={statusMut.isPending}
          onCancel={() => setRejecting(null)}
          onConfirm={reason =>
            statusMut.mutate({
              id: rejecting.id,
              status: STATUS_REJECTED,
              statusReason: reason,
            })
          }
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDelete
          review={confirmDelete}
          submitting={deleteMut.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteMut.mutate(confirmDelete.id)}
        />
      ) : null}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  const stars = Math.max(0, Math.min(5, rating || 0));
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={14}
          className={
            i <= stars
              ? 'fill-warning text-warning'
              : 'text-secondary-300'
          }
        />
      ))}
      <span className="ml-1 text-xs font-bold text-gray-800">{stars}/5</span>
    </span>
  );
}

function RejectModal({
  review,
  submitting,
  onCancel,
  onConfirm,
}: {
  review: Review;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState(review.statusReason || '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onConfirm(reason.trim());
  };

  return (
    <ModalShell title={`Reject review #${review.id}?`} onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-800">
          The review from <b>{review.customerName || 'this customer'}</b> on{' '}
          <b>{review.productName || `product #${review.productId}`}</b> will be
          marked rejected. Leaving a reason helps the next admin understand the
          call.
        </p>
        <div>
          <label className="mb-1 block text-sm font-bold text-gray-800">
            Reason <span className="text-danger">*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none"
            rows={3}
            placeholder="e.g. Spam, contains PII, off-topic…"
            required
            autoFocus
            disabled={submitting}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
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
            disabled={submitting || !reason.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2 font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
            Reject review
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ConfirmDelete({
  review,
  submitting,
  onCancel,
  onConfirm,
}: {
  review: Review;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell title="Delete this review?" onCancel={onCancel}>
      <p className="text-sm text-gray-800">
        Review #{review.id} will be permanently removed. Prefer <b>Reject</b>{' '}
        if you might want to restore it later.
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

// ─── Shared UI ────────────────────────────────────────────────────

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
