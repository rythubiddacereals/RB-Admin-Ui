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
  /** Ids behind the two names (0 when the product has no category / no sub-category). */
  mainCategoryId: number;
  subCategoryId: number;
  outOfStock: number;
  bestSeller: number;
  newArrival: number;
  smFeatured: number;
  /** 1 = hidden from the shop. Present in every row; only rows with
   *  hide=1 are included when "Show hidden" is on. */
  hide: number;
  // Populated from the qty options on the server. `startingFromPrice`
  // is what the shop customer sees on the first variant slot; the
  // card falls back to Product.price only when there are no variants.
  qtyOptions: QtyOptionRow[];
  startingFromPrice: number;
  startingFromMrp: number;
  startingFromLabel: string;
}

interface CategoryRow {
  id: number;
  parentCategoryId: number;
  name: string;
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
  // ONE list for everything: the page always loads every product (visible,
  // hidden, out of stock) so the search bar finds a product whatever state
  // it is in. The Status dropdown narrows it afterwards.
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'products', 'all-states'],
    queryFn: async () => {
      const r = await api.get<ProductsResponse>('/api/admin/products?includeHidden=1');
      return r.data;
    },
  });
  // Category tree for the two pickers (parent first, then its children).
  const categoriesQuery = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: async () =>
      (await api.get<{ categories: CategoryRow[] }>('/api/admin/categories')).data,
  });

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'all' | 'visible' | 'hidden' | 'oos'>('all');
  // 0 = all. The sub-category list only shows children of the chosen parent.
  const [parentId, setParentId] = useState(0);
  const [subId, setSubId] = useState(0);

  const parentOptions = useMemo(
    () =>
      (categoriesQuery.data?.categories ?? [])
        .filter(c => !c.parentCategoryId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categoriesQuery.data],
  );
  const subOptions = useMemo(
    () =>
      parentId > 0
        ? (categoriesQuery.data?.categories ?? [])
            .filter(c => c.parentCategoryId === parentId)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [categoriesQuery.data, parentId],
  );

  const filtered = useMemo(() => {
    let all = data?.products ?? [];
    // "Visible in shop" = what a customer can actually buy right now:
    // not hidden AND in stock (tester: out-of-stock Jeera Rice and hidden
    // Brown Rice were showing up under the positive filters).
    if (status === 'visible') all = all.filter(p => p.hide !== 1 && p.outOfStock !== 1);
    else if (status === 'hidden') all = all.filter(p => p.hide === 1);
    else if (status === 'oos') all = all.filter(p => p.outOfStock === 1);
    if (subId > 0) all = all.filter(p => p.subCategoryId === subId);
    else if (parentId > 0) all = all.filter(p => p.mainCategoryId === parentId);
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      all = all.filter(
        p =>
          p.name.toLowerCase().includes(needle) ||
          p.sku.toLowerCase().includes(needle) ||
          p.mainCategoryName.toLowerCase().includes(needle) ||
          p.subCategoryName.toLowerCase().includes(needle),
      );
    }
    // Category-wise order: parent category, then sub-category, then name -
    // so every product sits with the rest of its category.
    const main = (p: ProductRow) => (p.mainCategoryName || '').trim();
    const sub = (p: ProductRow) => (p.subCategoryName || '').trim();
    return [...all].sort(
      (a, b) =>
        // products with no category go last
        Number(!main(a)) - Number(!main(b)) ||
        main(a).localeCompare(main(b)) ||
        sub(a).localeCompare(sub(b)) ||
        a.name.localeCompare(b.name),
    );
  }, [data, query, status, parentId, subId]);

  const categoryKey = (p: ProductRow) =>
    `${(p.mainCategoryName || '').trim()}|${(p.subCategoryName || '').trim()}`;
  const categoryLabel = (p: ProductRow) => {
    const m = (p.mainCategoryName || '').trim();
    const s = (p.subCategoryName || '').trim();
    if (!m) return 'No category';
    return s ? `${m} › ${s}` : m;
  };
  // How many products each category holds in the current result (all pages).
  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of filtered) totals.set(categoryKey(p), (totals.get(categoryKey(p)) ?? 0) + 1);
    return totals;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  // The page's products split into consecutive category sections.
  const visibleGroups: { key: string; label: string; items: ProductRow[] }[] = [];
  for (const p of visible) {
    const key = categoryKey(p);
    const last = visibleGroups[visibleGroups.length - 1];
    if (last && last.key === key) last.items.push(p);
    else visibleGroups.push({ key, label: categoryLabel(p), items: [p] });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-primary-700">Products</h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading
              ? 'Loading…'
              : `${filtered.length} of ${data?.products.length ?? 0} products${query ? ` matching "${query}"` : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* One search + filters bar. Search covers EVERY product (hidden, out of
          stock, all categories); the three pickers narrow the result. */}
      <div className="mb-5 grid gap-2 rounded-xl border border-secondary-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <input
          type="search"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search all products by name, SKU, category…"
          className="rounded-lg border-2 border-secondary-200 px-4 py-2 font-semibold focus:border-primary-500 focus:outline-none"
        />
        <select
          value={parentId}
          onChange={e => {
            setParentId(Number(e.target.value));
            setSubId(0);
            setPage(1);
          }}
          className="rounded-lg border-2 border-secondary-200 px-3 py-2 font-semibold focus:border-primary-500 focus:outline-none"
          title="Category"
        >
          <option value={0}>All categories</option>
          {parentOptions.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={subId}
          onChange={e => {
            setSubId(Number(e.target.value));
            setPage(1);
          }}
          disabled={parentId <= 0 || subOptions.length === 0}
          className="rounded-lg border-2 border-secondary-200 px-3 py-2 font-semibold focus:border-primary-500 focus:outline-none disabled:bg-secondary-50 disabled:text-secondary-500"
          title="Sub-category"
        >
          <option value={0}>
            {parentId <= 0
              ? 'Select a category first'
              : subOptions.length === 0
              ? 'No sub-categories'
              : 'All sub-categories'}
          </option>
          {subOptions.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={e => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
          className="rounded-lg border-2 border-secondary-200 px-3 py-2 font-semibold focus:border-primary-500 focus:outline-none"
          title="Status"
        >
          <option value="all">All statuses</option>
          <option value="visible">Visible in shop (in stock)</option>
          <option value="hidden">Hidden from shop</option>
          <option value="oos">Out of stock</option>
        </select>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setParentId(0);
            setSubId(0);
            setStatus('all');
            setPage(1);
          }}
          disabled={!query && parentId === 0 && subId === 0 && status === 'all'}
          className="rounded-lg border-2 border-secondary-300 px-3 py-2 text-sm font-bold text-gray-800 hover:bg-secondary-50 disabled:opacity-40"
        >
          Clear
        </button>
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
          <div className="space-y-8">
          {visibleGroups.map(group => (
          <section key={group.key}>
            <div className="mb-3 flex items-center gap-2 border-b-2 border-primary-100 pb-2">
              <h2 className="text-lg font-extrabold text-primary-700">{group.label}</h2>
              <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700">
                {categoryTotals.get(group.key) ?? group.items.length} product
                {(categoryTotals.get(group.key) ?? group.items.length) === 1 ? '' : 's'}
              </span>
            </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {group.items.map(p => {
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
                      {p.hide === 1 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-extrabold text-white">
                          HIDDEN
                        </span>
                      ) : null}
                      {!(p.thumbNail && p.thumbNail.trim()) ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold text-white"
                          title="The shop lists only products with a main image. Add one under Attach Images."
                        >
                          NO PHOTO · NOT IN SHOP
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
                            title={q.price > 0 ? `₹${q.price.toFixed(2)}` : 'Call us'}
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
          </section>
          ))}
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
