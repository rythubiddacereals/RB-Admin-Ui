import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  ChevronRight,
  Loader2,
  Package,
  RefreshCw,
  Sparkles,
  Star,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Filtered product view — one component drives four routes
 * (Best Sellers, New Arrivals, Featured, Out of Stock). Each route
 * mounts this page with a different `preset`; everything else is
 * shared (data fetching, search, pagination, quick-toggle).
 *
 * Reuses the existing /api/admin/products list — the flag values
 * are already on every row, so filtering + toggling both work
 * without a per-flag list endpoint. The toggle hits
 * PATCH /api/admin/products/:id/flag which the backend guards
 * against arbitrary field writes.
 */

type FlagKey = 'bestSeller' | 'newArrival' | 'smFeatured' | 'outOfStock';

export interface FlagPreset {
  flag: FlagKey;
  title: string;
  subtitle: string;
  Icon: typeof Award;
  positiveVerb: string; // e.g. "In stock"     (label when value=1)
  negativeVerb: string; // e.g. "Add to list"  (button label when value=0)
  removeVerb: string;   // e.g. "Remove"       (button label when value=1)
  emptyText: string;
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
  sku: string;
  thumbNail: string;
  smallImage: string;
  price: number;
  specialPrice: number;
  mainCategoryName: string;
  subCategoryName: string;
  outOfStock: number;
  bestSeller: number;
  newArrival: number;
  smFeatured: number;
  // Same shape the main Products list uses. The real per-variant
  // pricing lives here (Product.price is 0 for most RB rows).
  qtyOptions: QtyOptionRow[];
  startingFromPrice: number;
  startingFromMrp: number;
  startingFromLabel: string;
}

interface ProductsResponse {
  count: number;
  products: ProductRow[];
}

const PAGE_SIZE = 24;

function productImage(p: ProductRow): string {
  if (p.thumbNail && p.thumbNail.trim()) return p.thumbNail;
  if (p.smallImage && p.smallImage.trim()) return p.smallImage;
  return '/placeholder-product.svg';
}

function displayPrice(p: ProductRow): {
  price: number;
  mrp: number | null;
  unit: string;
} {
  // Prefer the first qty-variant's price. Falls back to Product.price
  // only when the product has no variants — matches ProductsList.
  if (p.startingFromPrice > 0) {
    return {
      price: p.startingFromPrice,
      mrp: p.startingFromMrp > 0 ? p.startingFromMrp : null,
      unit: p.startingFromLabel,
    };
  }
  if (p.specialPrice > 0 && p.specialPrice < p.price) {
    return { price: p.specialPrice, mrp: p.price, unit: '' };
  }
  return { price: p.price, mrp: null, unit: '' };
}

export function ProductFlagListPage({ preset }: { preset: FlagPreset }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: async () => {
      const r = await api.get<ProductsResponse>('/api/admin/products');
      return r.data;
    },
  });

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const filtered = useMemo(() => {
    const all = data?.products ?? [];
    const matching = all.filter(p => p[preset.flag] === 1);
    if (!query.trim()) return matching;
    const needle = query.trim().toLowerCase();
    return matching.filter(
      p =>
        p.name.toLowerCase().includes(needle) ||
        p.sku.toLowerCase().includes(needle) ||
        p.mainCategoryName.toLowerCase().includes(needle) ||
        p.subCategoryName.toLowerCase().includes(needle),
    );
  }, [data, query, preset.flag]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  const toggleMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: number }) => {
      setPendingId(id);
      await api.patch(`/api/admin/products/${id}/flag`, {
        flag: preset.flag,
        value: next,
      });
      return { id, next };
    },
    onSuccess: ({ id, next }) => {
      // Optimistically flip the flag in cache so the tile leaves the
      // list right away — no wait for the refetch to feel snappy.
      qc.setQueryData<ProductsResponse | undefined>(
        ['admin', 'products'],
        old => {
          if (!old) return old;
          return {
            ...old,
            products: old.products.map(p =>
              p.id === id ? { ...p, [preset.flag]: next } : p,
            ),
          };
        },
      );
      qc.invalidateQueries({ queryKey: ['admin', 'product', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard', 'stats'] });
      flash(
        next === 1
          ? `Added #${id} to ${preset.title}`
          : `Removed #${id} from ${preset.title}`,
      );
      setPendingId(null);
    },
    onError: (err: any) => {
      setPendingId(null);
      flash(
        err?.response?.data?.message ??
          err?.message ??
          'Toggle failed — try again.',
      );
    },
  });

  const Icon = preset.Icon;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
            <Icon size={22} /> {preset.title}
          </h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading ? 'Loading…' : `${filtered.length} products · ${preset.subtitle}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search…"
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
          <Link
            to="/products"
            className="rounded-lg border-2 border-secondary-300 px-3 py-2 text-sm font-bold text-gray-800 hover:bg-secondary-50"
          >
            All products
          </Link>
        </div>
      </div>

      {toast ? (
        <div className="mb-4 rounded-lg bg-primary-50 px-4 py-2 text-sm font-bold text-primary-700">
          {toast}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-secondary-200 bg-white py-12">
          <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
          <span className="font-semibold text-secondary-800">
            Loading products…
          </span>
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-danger bg-danger-soft px-6 py-8 text-center">
          <p className="font-bold text-danger">Couldn't load products.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <Icon size={40} className="mx-auto text-secondary-300" />
          <p className="mt-2 font-semibold text-secondary-800">
            {query ? `No matches for "${query}".` : preset.emptyText}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map(p => {
              const dp = displayPrice(p);
              const busy = pendingId === p.id;
              return (
                <div
                  key={p.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm transition-transform hover:-translate-y-0.5"
                >
                  <Link
                    to={`/products/${p.id}`}
                    className="block aspect-square overflow-hidden bg-secondary-50"
                  >
                    <img
                      src={productImage(p)}
                      alt={p.name}
                      className="h-full w-full object-cover"
                      onError={e => {
                        (e.currentTarget as HTMLImageElement).src =
                          '/placeholder-product.svg';
                      }}
                    />
                  </Link>
                  <div className="flex flex-1 flex-col p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-secondary-700">
                      {p.mainCategoryName || '—'}
                    </div>
                    <Link
                      to={`/products/${p.id}`}
                      className="mt-1 line-clamp-2 text-sm font-bold text-gray-900 hover:text-primary-700"
                    >
                      {p.name}
                    </Link>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-lg font-extrabold text-primary-700">
                        {dp.price > 0 ? `₹${dp.price.toFixed(2)}` : 'Call us'}
                      </span>
                      {dp.mrp !== null && dp.price > 0 ? (
                        <span className="text-xs font-bold text-secondary-500 line-through">
                          ₹{dp.mrp.toFixed(2)}
                        </span>
                      ) : null}
                      {dp.unit ? (
                        <span className="text-xs font-semibold text-secondary-700">
                          / {dp.unit}
                        </span>
                      ) : null}
                    </div>
                    {p.qtyOptions && p.qtyOptions.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.qtyOptions.map(q => (
                          <span
                            key={q.id}
                            className="rounded bg-secondary-100 px-1.5 py-0.5 text-[10px] font-bold text-secondary-800"
                            title={
                              q.price > 0
                                ? `₹${q.price.toFixed(2)}${
                                    q.marketPrice > q.price
                                      ? ` (MRP ₹${q.marketPrice.toFixed(2)})`
                                      : ''
                                  }`
                                : 'Call us'
                            }
                          >
                            {q.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-secondary-100 pt-3">
                      <button
                        onClick={() =>
                          toggleMut.mutate({ id: p.id, next: 0 })
                        }
                        disabled={busy}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border-2 border-danger px-2 py-1.5 text-xs font-bold text-danger hover:bg-danger-soft disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="animate-spin" size={12} />
                        ) : (
                          <XCircle size={12} />
                        )}
                        {preset.removeVerb}
                      </button>
                      <Link
                        to={`/products/${p.id}`}
                        className="rounded-lg p-1.5 text-secondary-700 hover:bg-secondary-100"
                        title="View"
                      >
                        <ChevronRight size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 ? (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-xs font-semibold text-secondary-800">
                Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of{' '}
                {filtered.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="rounded-lg border-2 border-primary-500 px-3 py-1.5 text-sm font-bold text-primary-700 hover:bg-primary-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm font-bold text-gray-800">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded-lg border-2 border-primary-500 px-3 py-1.5 text-sm font-bold text-primary-700 hover:bg-primary-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ─── Presets — one route per flag ─────────────────────────────────

export const BEST_SELLERS: FlagPreset = {
  flag: 'bestSeller',
  title: 'Best Sellers',
  subtitle: 'Marked as best seller',
  Icon: Award,
  positiveVerb: 'Best seller',
  negativeVerb: 'Mark as best seller',
  removeVerb: 'Remove',
  emptyText:
    'No products are marked as best sellers yet. Set the flag from a product\'s edit page.',
};

export const NEW_ARRIVALS: FlagPreset = {
  flag: 'newArrival',
  title: 'New Arrivals',
  subtitle: 'Marked as new arrival',
  Icon: Sparkles,
  positiveVerb: 'New arrival',
  negativeVerb: 'Mark as new arrival',
  removeVerb: 'Remove',
  emptyText:
    'No products are marked as new arrivals. Set the flag from a product\'s edit page.',
};

export const FEATURED: FlagPreset = {
  flag: 'smFeatured',
  title: 'Featured',
  subtitle: 'Highlighted on the home page',
  Icon: Star,
  positiveVerb: 'Featured',
  negativeVerb: 'Feature this product',
  removeVerb: 'Unfeature',
  emptyText:
    'Nothing is featured right now. Feature a product from its edit page or the products list.',
};

export const OUT_OF_STOCK: FlagPreset = {
  flag: 'outOfStock',
  title: 'Out of Stock',
  subtitle: 'Hidden from the shop until restocked',
  Icon: Package,
  positiveVerb: 'Out of stock',
  negativeVerb: 'Mark out of stock',
  removeVerb: 'Back in stock',
  emptyText:
    'Nothing is marked out of stock. Good news — everything is available.',
};
