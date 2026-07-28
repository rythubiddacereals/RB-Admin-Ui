import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  ChevronRight,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { api } from '@/lib/api';

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
  // Populated from the qty options on the server. `startingFromPrice`
  // is what the shop customer sees on the first variant slot; the
  // card falls back to Product.price only when there are no variants.
  qtyOptions: QtyOptionRow[];
  startingFromPrice: number;
  startingFromMrp: number;
  startingFromLabel: string;
}

interface ProductsResponse {
  count: number;
  products: ProductRow[];
}

const PAGE_SIZE = 30;

/**
 * Best available image URL — thumbnail first, then small image,
 * then a small placeholder so the row still lays out even if the
 * product record has no imagery at all.
 */
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
  // Prefer the first qty-variant slot (startingFromPrice) — that's
  // what the shop shows and what legacy admin's products.html shows
  // too. Only fall back to Product.price / specialPrice when the
  // product has no variants (bare products, rare in the RB catalog).
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

export function ProductsListPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: async () => {
      const r = await api.get<ProductsResponse>('/api/admin/products');
      return r.data;
    },
  });

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const all = data?.products ?? [];
    if (!query.trim()) return all;
    const needle = query.trim().toLowerCase();
    return all.filter(
      p =>
        p.name.toLowerCase().includes(needle) ||
        p.sku.toLowerCase().includes(needle) ||
        p.mainCategoryName.toLowerCase().includes(needle) ||
        p.subCategoryName.toLowerCase().includes(needle),
    );
  }, [data, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-primary-700">Products</h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading
              ? 'Loading…'
              : `${filtered.length} products${query ? ` matching "${query}"` : ''}`}
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
            placeholder="Search by name, SKU, or category…"
            className="w-72 rounded-lg border-2 border-secondary-200 px-4 py-2 font-semibold focus:border-primary-500 focus:outline-none"
          />
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-primary-500 px-3 py-2 text-sm font-bold text-primary-700 transition-colors hover:bg-primary-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link
            to="/products/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary-600"
          >
            <Plus size={14} />
            New product
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-secondary-200 bg-white py-12">
          <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
          <span className="font-semibold text-secondary-800">Loading products…</span>
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-danger bg-danger-soft px-6 py-8 text-center">
          <p className="font-bold text-danger">Couldn't load products.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <Package size={40} className="mx-auto text-secondary-300" />
          <p className="mt-2 font-semibold text-secondary-800">
            {query ? `No products matched "${query}".` : 'No products yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map(p => {
              const price = displayPrice(p);
              const outOfStock = p.outOfStock === 1;
              return (
                <Link
                  key={p.id}
                  to={`/products/${p.id}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="relative aspect-square bg-secondary-50">
                    <img
                      src={productImage(p)}
                      alt={p.name}
                      className="h-full w-full object-cover"
                      onError={e => {
                        (e.currentTarget as HTMLImageElement).src = '/placeholder-product.svg';
                      }}
                    />
                    {/* Badges */}
                    <div className="absolute left-2 top-2 flex flex-col gap-1">
                      {p.bestSeller === 1 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-secondary-400 px-2 py-0.5 text-[10px] font-extrabold text-primary-900">
                          <Award size={10} /> Best Seller
                        </span>
                      ) : null}
                      {p.newArrival === 1 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
                          <Zap size={10} /> New
                        </span>
                      ) : null}
                    </div>
                    {outOfStock ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <span className="rounded-md bg-white px-3 py-1 text-xs font-extrabold text-danger">
                          OUT OF STOCK
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-secondary-700">
                      {p.mainCategoryName || '—'}
                    </div>
                    <div className="mt-1 line-clamp-2 min-h-[2.5em] text-sm font-bold text-gray-900">
                      {p.name}
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-lg font-extrabold text-primary-700">
                        {price.price > 0 ? `₹${price.price.toFixed(2)}` : 'Call us'}
                      </span>
                      {price.mrp !== null && price.price > 0 ? (
                        <span className="text-xs font-bold text-secondary-700 line-through">
                          ₹{price.mrp.toFixed(2)}
                        </span>
                      ) : null}
                      {price.unit ? (
                        <span className="text-xs font-semibold text-secondary-700">
                          / {price.unit}
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
                    <div className="mt-3 flex items-center justify-between border-t border-secondary-100 pt-2">
                      <span className="text-xs font-bold text-secondary-700">
                        #{p.id}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 group-hover:underline">
                        Open <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div className="text-xs font-semibold text-secondary-800">
              Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of{' '}
              {filtered.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded-lg border-2 border-primary-500 px-3 py-1.5 text-sm font-bold text-primary-700 transition-colors hover:bg-primary-50 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm font-bold text-gray-800">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-lg border-2 border-primary-500 px-3 py-1.5 text-sm font-bold text-primary-700 transition-colors hover:bg-primary-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
