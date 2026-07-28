import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Edit2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Time-boxed price overrides for the Rythubidda-UI "Today's Deals"
 * card. Only one deal is shown to the shop at a time — the one whose
 * `[startsAt, endsAt]` window contains NOW() and whose sort_order is
 * lowest. Admin picks the product, sets the window + deal price, and
 * the server picks the live one automatically.
 *
 * Live status per row is derived client-side from `startsAt` / `endsAt`
 * so the label updates without a refetch — a ticker on this page
 * refreshes every second and moves rows through
 *   Scheduled → Live → Expired.
 */

interface Deal {
  id: number;
  productId: number;
  productName: string;
  productImage: string;
  qtyOptionId: number | null;
  dealPrice: number;
  discountPct: number;
  variantLabel: string;
  variants: { id: number; label: string; price: number }[];
  maxQtyPerCustomer: number;
  startsAt: string;   // 'yyyy-MM-dd HH:mm' (local wall clock, per server)
  endsAt: string;
  remainingSeconds: number;
  isActive: number;
  sortOrder: number;
  updatedAt: string;
}

interface ListResponse {
  count: number;
  deals: Deal[];
}

interface QtyOptionRow {
  id: number;
  name: string;
  price: number;
  marketPrice: number;
  displayOrder: number;
}

interface ProductRow {
  id: number;
  name: string;
  thumbNail: string;
  smallImage: string;
  price: number;
  specialPrice: number;
  qtyOptions: QtyOptionRow[];
}

interface ProductsResponse {
  count: number;
  products: ProductRow[];
}

interface FormValues {
  id: number;
  productId: number;
  qtyOptionId: number | null;
  dealPrice: string;
  discountPct: string;
  /** Editable variant rows — each becomes a dropdown entry on the shop. */
  variants: { label: string; price: string }[];
  maxQtyPerCustomer: string;
  startsAt: string; // datetime-local: yyyy-MM-ddTHH:mm
  endsAt: string;
  isActive: number;
  sortOrder: string;
}

const EMPTY_FORM: FormValues = {
  id: 0,
  productId: 0,
  qtyOptionId: null,
  dealPrice: '',
  discountPct: '',
  variants: [{ label: '', price: '' }],
  maxQtyPerCustomer: '1',
  startsAt: '',
  endsAt: '',
  isActive: 1,
  sortOrder: '0',
};

function dealToForm(d: Deal): FormValues {
  return {
    id: d.id,
    productId: d.productId,
    qtyOptionId: d.qtyOptionId,
    dealPrice: String(d.dealPrice ?? ''),
    discountPct: String(d.discountPct ?? ''),
    variants: d.variants && d.variants.length > 0
      ? d.variants.map(v => ({ label: v.label, price: String(v.price) }))
      // Legacy single-price deal → seed one editable row from it.
      : [{ label: d.variantLabel ?? '', price: String(d.dealPrice ?? '') }],
    maxQtyPerCustomer: String(d.maxQtyPerCustomer ?? 1),
    startsAt: toDatetimeLocal(d.startsAt),
    endsAt: toDatetimeLocal(d.endsAt),
    isActive: d.isActive,
    sortOrder: String(d.sortOrder),
  };
}

function formToPayload(f: FormValues) {
  return {
    productId: f.productId,
    discountPct: 0,
    // Variant rows carry the prices; the server derives the legacy
    // dealPrice/variantLabel columns from the first row.
    variants: f.variants
      .map(v => ({ label: v.label.trim(), price: Number(v.price) || 0 }))
      .filter(v => v.label && v.price > 0),
    qtyOptionId: null,
    maxQtyPerCustomer: Number(f.maxQtyPerCustomer) || 1,
    startsAt: f.startsAt,
    endsAt: f.endsAt,
    isActive: f.isActive,
    sortOrder: Number(f.sortOrder) || 0,
  };
}

// Convert 'yyyy-MM-dd HH:mm' (server format) → 'yyyy-MM-ddTHH:mm'
// (what <input type="datetime-local"> expects).
function toDatetimeLocal(serverStr: string): string {
  if (!serverStr) return '';
  return serverStr.replace(' ', 'T').slice(0, 16);
}

function fromDatetimeLocal(local: string): number {
  // Treat as local time, get epoch ms. Used for the client-side
  // status derivation only; the actual write value is the local
  // string, which the server parses in its own zone.
  if (!local) return 0;
  return new Date(local).getTime();
}

type Status = 'live' | 'scheduled' | 'expired' | 'hidden';
function derivedStatus(d: Deal, now: number): Status {
  if (d.isActive !== 1) return 'hidden';
  const start = fromDatetimeLocal(toDatetimeLocal(d.startsAt));
  const end = fromDatetimeLocal(toDatetimeLocal(d.endsAt));
  if (now < start) return 'scheduled';
  if (now > end) return 'expired';
  return 'live';
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hh >= 24) {
    const days = Math.floor(hh / 24);
    return `${days}d ${pad(hh % 24)}:${pad(mm)}:${pad(ss)}`;
  }
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

export function TodaysDealsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'todays-deals'],
    queryFn: async () => {
      const r = await api.get<ListResponse>('/api/admin/todays-deals');
      return r.data;
    },
  });

  // Tick every second so the countdown + status column stay live
  // without hitting the server. Component-scoped — no memory leak.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [form, setForm] = useState<FormValues | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Deal | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const deals = useMemo(() => data?.deals ?? [], [data]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const saveMut = useMutation({
    mutationFn: async (payload: FormValues) => {
      const body = formToPayload(payload);
      if (payload.id > 0) {
        const r = await api.put<Deal>(`/api/admin/todays-deals/${payload.id}`, body);
        return r.data;
      }
      const r = await api.post<Deal>('/api/admin/todays-deals', body);
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'todays-deals'] });
      setForm(null);
      setSaveError(null);
      flash(`Saved · ${fresh.productName || 'deal'}`);
    },
    onError: (err: any) => {
      setSaveError(
        err?.response?.data?.message ?? err?.message ?? 'Could not save deal.',
      );
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: number }) => {
      const r = await api.patch<Deal>(`/api/admin/todays-deals/${id}/active`, {
        isActive: next,
      });
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'todays-deals'] });
      flash(`${fresh.isActive === 1 ? 'Activated' : 'Hidden'} deal`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/admin/todays-deals/${id}`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'todays-deals'] });
      setConfirmDelete(null);
      flash('Deal deleted');
    },
  });

  const openCreate = () => {
    setSaveError(null);
    setForm({ ...EMPTY_FORM });
  };
  const openEdit = (d: Deal) => {
    setSaveError(null);
    setForm(dealToForm(d));
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
            <Timer size={22} /> Today's Deals
          </h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading ? 'Loading…' : `${deals.length} configured`}
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
            <Plus size={14} /> New deal
          </button>
        </div>
      </div>

      {toast ? (
        <div className="mb-4 rounded-lg bg-success-soft px-4 py-2 text-sm font-bold text-success">
          {toast}
        </div>
      ) : null}

      {isLoading ? (
        <Loading label="Loading deals…" />
      ) : isError ? (
        <ErrorState message="Couldn't load deals." />
      ) : deals.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <Timer size={40} className="mx-auto text-secondary-300" />
          <p className="mt-2 font-semibold text-secondary-800">
            No deals yet. Create one to feature a product with a countdown on
            the shop's Today's Deals card.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Product</th>
                <th className="px-4 py-3 text-right font-bold">Deal price</th>
                <th className="px-4 py-3 text-left font-bold">Window</th>
                <th className="px-4 py-3 text-left font-bold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {deals.map(d => {
                const status = derivedStatus(d, now);
                const end = fromDatetimeLocal(toDatetimeLocal(d.endsAt));
                return (
                  <tr
                    key={d.id}
                    className="border-t border-secondary-100 hover:bg-primary-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-secondary-100">
                          {d.productImage ? (
                            <img
                              src={d.productImage}
                              alt={d.productName}
                              className="h-full w-full object-cover"
                              onError={e => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-bold text-gray-900">
                            {d.productName || `#${d.productId}`}
                          </div>
                          {d.variantLabel ? (
                            <div className="text-xs text-secondary-700">
                              {d.variantLabel}
                            </div>
                          ) : d.qtyOptionId ? (
                            <div className="text-xs text-secondary-700">
                              Variant #{d.qtyOptionId}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-gray-900">
                        ₹{d.dealPrice.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-800">
                      <div>{d.startsAt || '—'}</div>
                      <div className="text-secondary-700">→ {d.endsAt || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={status} remainingMs={end - now} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(d)}
                          className="rounded-lg px-2 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50"
                        >
                          <Edit2 size={12} className="inline" /> Edit
                        </button>
                        <button
                          onClick={() =>
                            toggleMut.mutate({
                              id: d.id,
                              next: d.isActive === 1 ? 0 : 1,
                            })
                          }
                          disabled={toggleMut.isPending}
                          className={`rounded-lg px-2 py-1 text-xs font-bold ${
                            d.isActive === 1
                              ? 'text-secondary-800 hover:bg-secondary-100'
                              : 'text-success hover:bg-success-soft'
                          } disabled:opacity-50`}
                        >
                          {d.isActive === 1 ? (
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
                          onClick={() => setConfirmDelete(d)}
                          className="rounded-lg px-2 py-1 text-xs font-bold text-danger hover:bg-danger-soft"
                        >
                          <Trash2 size={12} className="inline" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form ? (
        <DealFormModal
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
          deal={confirmDelete}
          submitting={deleteMut.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteMut.mutate(confirmDelete.id)}
        />
      ) : null}
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────

function StatusPill({ status, remainingMs }: { status: Status; remainingMs: number }) {
  if (status === 'live') {
    return (
      <div>
        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          Live
        </span>
        <div className="mt-1 font-mono text-xs font-bold text-primary-700">
          {formatRemaining(remainingMs)}
        </div>
      </div>
    );
  }
  if (status === 'scheduled') {
    return (
      <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-700">
        Scheduled
      </span>
    );
  }
  if (status === 'expired') {
    return (
      <span className="rounded-full bg-danger-soft px-3 py-1 text-xs font-bold text-danger">
        Expired
      </span>
    );
  }
  return (
    <span className="rounded-full bg-secondary-100 px-3 py-1 text-xs font-bold text-secondary-800">
      Hidden
    </span>
  );
}

// ─── Form modal ───────────────────────────────────────────────────

function DealFormModal({
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

  // Load products (once, cached by React Query) for the product picker.
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: async () => {
      const r = await api.get<ProductsResponse>('/api/admin/products');
      return r.data;
    },
  });
  const products = productsData?.products ?? [];
  const [productSearch, setProductSearch] = useState('');
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 50);
    const q = productSearch.trim().toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q)).slice(0, 50);
  }, [products, productSearch]);

  const hasValidVariant = value.variants.some(
    v => v.label.trim() && Number(v.price) > 0,
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.productId <= 0) return;
    if (!value.startsAt || !value.endsAt) return;
    if (!hasValidVariant) return;
    onSubmit(value);
  };

  return (
    <ModalShell
      title={isEdit ? 'Edit deal' : 'New deal'}
      onCancel={onCancel}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Product" required>
          {productsLoading ? (
            <div className={inputCls + ' text-secondary-700'}>
              Loading products…
            </div>
          ) : (
            <>
              <input
                type="search"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                className={inputCls + ' mb-2'}
                placeholder="Search products…"
                disabled={submitting}
              />
              <div className="max-h-56 overflow-y-auto rounded-lg border-2 border-secondary-200">
                {filteredProducts.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-secondary-700">
                    No matching products.
                  </div>
                ) : (
                  filteredProducts.map(p => {
                    const active = value.productId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          set({ productId: p.id, qtyOptionId: null })
                        }
                        className={`flex w-full items-center gap-3 border-b border-secondary-100 px-3 py-2 text-left last:border-b-0 ${
                          active
                            ? 'bg-primary-100'
                            : 'hover:bg-primary-50'
                        }`}
                      >
                        <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded bg-secondary-100">
                          {p.thumbNail || p.smallImage ? (
                            <img
                              src={p.thumbNail || p.smallImage}
                              alt=""
                              className="h-full w-full object-cover"
                              onError={e =>
                                ((e.currentTarget as HTMLImageElement).style.display = 'none')
                              }
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-gray-900">
                            {p.name}
                          </div>
                        </div>
                        {active ? (
                          <span className="text-xs font-bold text-primary-700">
                            Selected
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </Field>

        <Field label="Variants" required>
          <div className="space-y-2">
            {value.variants.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={v.label}
                  onChange={e => set({
                    variants: value.variants.map((row, idx) =>
                      idx === i ? { ...row, label: e.target.value } : row),
                  })}
                  className={inputCls}
                  placeholder="Variant (e.g. 500 g)"
                  maxLength={60}
                  disabled={submitting}
                />
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={v.price}
                  onChange={e => set({
                    variants: value.variants.map((row, idx) =>
                      idx === i ? { ...row, price: e.target.value } : row),
                  })}
                  className={inputCls + ' max-w-[140px]'}
                  placeholder="Price ₹"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => set({ variants: value.variants.filter((_, idx) => idx !== i) })}
                  disabled={submitting || value.variants.length <= 1}
                  className="rounded-lg px-2 py-2 text-sm font-bold text-danger hover:bg-danger-soft disabled:opacity-30"
                  aria-label="Remove variant"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => set({ variants: [...value.variants, { label: '', price: '' }] })}
              disabled={submitting}
              className="inline-flex items-center gap-1 rounded-lg border-2 border-primary-500 px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-50"
            >
              + Add variant
            </button>
          </div>
          <p className={hintCls}>
            Each row becomes an option in the shop's dropdown
            (e.g. "500 g · ₹40"). At least one is required.
          </p>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max qty per customer" required>
            <input
              type="number"
              min={1}
              value={value.maxQtyPerCustomer}
              onChange={e => set({ maxQtyPerCustomer: e.target.value })}
              className={inputCls}
              placeholder="1"
              required
              disabled={submitting}
            />
            <p className={hintCls}>
              One order per customer at the deal price, capped at this
              many units. After that the offer hides for them.
            </p>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts at" required>
            <input
              type="datetime-local"
              value={value.startsAt}
              onChange={e => set({ startsAt: e.target.value })}
              className={inputCls}
              required
              disabled={submitting}
            />
          </Field>
          <Field label="Ends at" required>
            <input
              type="datetime-local"
              value={value.endsAt}
              onChange={e => set({ endsAt: e.target.value })}
              className={inputCls}
              required
              disabled={submitting}
            />
            <p className={hintCls}>
              The shop shows the deal only while NOW is in this window.
            </p>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display order">
            <input
              type="number"
              value={value.sortOrder}
              onChange={e => set({ sortOrder: e.target.value })}
              className={inputCls}
              disabled={submitting}
            />
            <p className={hintCls}>
              Lower wins when multiple deals overlap. Only one is shown.
            </p>
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
          submitLabel={isEdit ? 'Save changes' : 'Create deal'}
          onCancel={onCancel}
          disabled={
            value.productId <= 0 ||
            !value.startsAt ||
            !value.endsAt ||
            !hasValidVariant
          }
        />
      </form>
    </ModalShell>
  );
}

function ConfirmDelete({
  deal,
  submitting,
  onCancel,
  onConfirm,
}: {
  deal: Deal;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell title="Delete this deal?" onCancel={onCancel}>
      <p className="text-sm text-gray-800">
        The deal on <b>{deal.productName || `product #${deal.productId}`}</b>
        {' '}will be permanently removed. Tip: <b>Hide</b> is reversible;
        delete is not.
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

// ─── Shared building blocks ───────────────────────────────────────

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
