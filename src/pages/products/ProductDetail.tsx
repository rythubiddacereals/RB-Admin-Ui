import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Award, Edit2, Loader2, Package, Zap } from 'lucide-react';
import { api } from '@/lib/api';

interface QtyOption {
  id: number;
  name: string;
  type: string;
  price: number;
  marketPrice: number;
  displayOrder: number;
}

interface ProductDetail {
  id: number;
  name: string;
  sku: string;
  thumbNail: string;
  smallImage: string;
  mainCategoryName: string;
  subCategoryName: string;
  outOfStock: number;
  bestSeller: number;
  newArrival: number;
  smFeatured: number;
  description: string;
  shortDescription: string;
  qtyOptions: QtyOption[];
}

function bestImage(p: ProductDetail): string {
  return (
    (p.thumbNail && p.thumbNail.trim()) ||
    (p.smallImage && p.smallImage.trim()) ||
    '/placeholder-product.svg'
  );
}

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const id = Number(productId);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'product', id],
    queryFn: async () => {
      const r = await api.get<ProductDetail>(`/api/admin/products/${id}`);
      return r.data;
    },
    enabled: Number.isFinite(id) && id > 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
        <span className="font-semibold text-secondary-800">Loading product…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-danger bg-danger-soft p-6">
        <p className="font-bold text-danger">Couldn't load product #{id}.</p>
      </div>
    );
  }

  const p = data;
  const outOfStock = p.outOfStock === 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/products"
          className="inline-flex items-center gap-1 text-sm font-bold text-primary-700 hover:underline"
        >
          <ArrowLeft size={14} /> Back to products
        </Link>
        <Link
          to={`/products/${p.id}/edit`}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary-600"
        >
          <Edit2 size={14} />
          Edit product
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Image */}
        <div className="lg:col-span-2">
          <div className="relative aspect-square overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
            <img
              src={bestImage(p)}
              alt={p.name}
              className="h-full w-full object-cover"
              onError={e => {
                (e.currentTarget as HTMLImageElement).src = '/placeholder-product.svg';
              }}
            />
            {outOfStock ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="rounded-md bg-white px-4 py-1.5 text-sm font-extrabold text-danger">
                  OUT OF STOCK
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Info */}
        <div className="space-y-4 lg:col-span-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-secondary-700">
              {p.mainCategoryName || '—'}
              {p.subCategoryName ? ` · ${p.subCategoryName}` : ''}
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-primary-700">
              {p.name}
            </h1>
            <div className="mt-1 text-sm font-semibold text-secondary-800">
              Product #{p.id}{p.sku ? ` · SKU ${p.sku}` : ''}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {p.bestSeller === 1 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary-400 px-3 py-1 text-xs font-extrabold text-primary-900">
                <Award size={12} /> Best Seller
              </span>
            ) : null}
            {p.newArrival === 1 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-500 px-3 py-1 text-xs font-extrabold text-white">
                <Zap size={12} /> New Arrival
              </span>
            ) : null}
            {p.smFeatured === 1 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary-300 px-3 py-1 text-xs font-extrabold text-primary-900">
                Featured
              </span>
            ) : null}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold ${
                outOfStock
                  ? 'bg-danger-soft text-danger'
                  : 'bg-success-soft text-success'
              }`}
            >
              <Package size={12} /> {outOfStock ? 'Out of stock' : 'In stock'}
            </span>
          </div>

          {/* Starting-from tile — the actual price lives on the qty
              options. Uses the FIRST variant (lowest displayOrder)
              which matches how the shop presents the product. If a
              variant has no price yet, we render "Price on request"
              per the legacy admin "Call us" convention. */}
          {p.qtyOptions.length > 0 ? (
            <div className="flex items-baseline gap-3">
              {p.qtyOptions[0].price > 0 ? (
                <>
                  <span className="text-3xl font-extrabold text-primary-700">
                    ₹{p.qtyOptions[0].price.toFixed(2)}
                  </span>
                  {p.qtyOptions[0].marketPrice > p.qtyOptions[0].price ? (
                    <span className="text-lg font-bold text-secondary-700 line-through">
                      ₹{p.qtyOptions[0].marketPrice.toFixed(2)}
                    </span>
                  ) : null}
                  <span className="text-xs font-bold uppercase text-secondary-700">
                    / {p.qtyOptions[0].name}
                  </span>
                </>
              ) : (
                <span className="text-xl font-extrabold text-secondary-800">
                  Price on request
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm font-semibold italic text-secondary-700">
              No variants configured — add at least one on the edit page.
            </p>
          )}

          {p.shortDescription ? (
            <p className="text-sm font-semibold text-gray-800">
              {p.shortDescription}
            </p>
          ) : null}

          {p.description ? (
            <details className="rounded-lg border border-secondary-200 bg-white p-4 open:shadow-sm">
              <summary className="cursor-pointer text-sm font-extrabold uppercase tracking-wider text-secondary-800">
                Full description
              </summary>
              <div
                className="mt-3 max-w-none text-sm text-gray-800"
                // Backend descriptions include HTML markup. Rendered
                // as-is here because the current admin already trusts
                // this content — no user-generated input, only admin
                // authored via the current product form.
                dangerouslySetInnerHTML={{ __html: p.description }}
              />
            </details>
          ) : null}
        </div>
      </div>

      {/* Qty options */}
      <div className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
        <h2 className="border-b border-secondary-200 bg-secondary-50 px-5 py-3 text-sm font-extrabold uppercase tracking-wider text-secondary-800">
          Variants ({p.qtyOptions.length})
        </h2>
        {p.qtyOptions.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm font-semibold text-secondary-700">
            No variants yet. Click <b>Edit product</b> above to add one.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="px-4 py-2 text-left font-bold">#</th>
                <th className="px-4 py-2 text-left font-bold">Label</th>
                <th className="px-4 py-2 text-left font-bold">Type</th>
                <th className="px-4 py-2 text-right font-bold">Price</th>
                <th className="px-4 py-2 text-right font-bold">MRP</th>
                <th className="px-4 py-2 text-right font-bold">Discount</th>
              </tr>
            </thead>
            <tbody>
              {p.qtyOptions.map(q => {
                const discount =
                  q.marketPrice > 0 && q.marketPrice > q.price
                    ? Math.round(
                        ((q.marketPrice - q.price) / q.marketPrice) * 100,
                      )
                    : 0;
                return (
                  <tr key={q.id} className="border-t border-secondary-100">
                    <td className="px-4 py-3 text-gray-700">{q.displayOrder}</td>
                    <td className="px-4 py-3 font-bold text-gray-900">
                      {q.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-800">{q.type || '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-primary-700">
                      ₹{q.price.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-secondary-700">
                      {q.marketPrice > 0 ? `₹${q.marketPrice.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {discount > 0 ? (
                        <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger">
                          -{discount}%
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
