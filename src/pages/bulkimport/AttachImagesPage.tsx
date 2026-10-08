import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Attach Images — the second half of the ZIP-free bulk import flow.
 *
 * Import the Excel alone, then give each product its photo HERE by
 * clicking (or dropping a file on) its card. No filename matching, no
 * ZIP building — the two things that made imports painful.
 *
 * Upload path per product: POST /products/upload-image (returns the
 * S3/CDN URL) → PATCH /products/:id/images setting thumbnail + small
 * image to that URL. Small and thumbnail get the same file — that's
 * what the shop tiles read; hover/swatch stay per-product manual work
 * in the full product form for the rare products that use them.
 */

interface ProductRow {
  id: number;
  name: string;
  sku: string;
  thumbNail: string;
  smallImage: string;
  hoverImage: string;
  swatchImage: string;
  mainCategoryName: string;
  subCategoryName: string;
  hide: number;
}

interface ListResponse {
  count: number;
  products: ProductRow[];
}

const hasImage = (p: ProductRow) => !!(p.thumbNail && p.thumbNail.trim() !== '');

export function AttachImagesPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: async () => {
      const r = await api.get<ListResponse>('/api/admin/products?includeHidden=1');
      return r.data;
    },
  });

  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const products = useMemo(() => data?.products ?? [], [data]);
  const missingCount = useMemo(() => products.filter(p => !hasImage(p)).length, [products]);

  const visible = useMemo(() => {
    let list = showAll ? products : products.filter(p => !hasImage(p));
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      list = list.filter(
        p =>
          p.name.toLowerCase().includes(needle) ||
          p.mainCategoryName.toLowerCase().includes(needle) ||
          p.subCategoryName.toLowerCase().includes(needle),
      );
    }
    // Photo-less products first so the work queue is always on top.
    return [...list].sort((a, b) => Number(hasImage(a)) - Number(hasImage(b)));
  }, [products, showAll, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
            <ImagePlus size={22} /> Attach Images
          </h1>
          <p className="mt-1 text-sm font-semibold text-secondary-800">
            {isLoading
              ? 'Loading products…'
              : missingCount > 0
                ? `${missingCount} product${missingCount === 1 ? '' : 's'} without a photo. Click a card (or drop an image on it) to attach one.`
                : 'Every product has a photo. 🎉'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/bulk-import"
            className="inline-flex items-center gap-2 rounded-lg border-2 border-secondary-300 px-3 py-2 text-sm font-bold text-gray-800 hover:bg-secondary-50"
          >
            <ArrowLeft size={14} /> Bulk Import
          </Link>
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-500" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or category…"
            className="w-72 rounded-lg border-2 border-secondary-200 py-2 pl-9 pr-4 font-semibold focus:border-primary-500 focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-secondary-800">
          <input
            type="checkbox"
            checked={showAll}
            onChange={e => setShowAll(e.target.checked)}
          />
          Show products that already have photos
        </label>
      </div>

      {toast ? (
        <div className="rounded-lg bg-success-soft px-4 py-2 text-sm font-bold text-success">
          {toast}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-secondary-200 bg-white py-12">
          <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
          <span className="font-semibold text-secondary-800">Loading products…</span>
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-danger bg-danger-soft px-6 py-8 text-center">
          <p className="font-bold text-danger">Couldn't load products.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <CheckCircle2 size={40} className="mx-auto text-success" />
          <p className="mt-2 font-semibold text-secondary-800">
            {query
              ? `No products matched "${query}".`
              : 'Nothing left to do — every product has a photo.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map(p => (
            <ProductImageCard key={p.id} product={p} onDone={name => {
              qc.invalidateQueries({ queryKey: ['admin', 'products'] });
              flash(`Photo attached to ${name}`);
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The four image slots a product has. Only "main" decides shop visibility. */
const IMAGE_SLOTS: { field: 'thumbNail' | 'smallImage' | 'swatchImage' | 'hoverImage'; label: string }[] = [
  { field: 'thumbNail', label: 'Main' },
  { field: 'smallImage', label: 'Small' },
  { field: 'swatchImage', label: 'Swatch' },
  { field: 'hoverImage', label: 'Hover' },
];

function ProductImageCard({
  product,
  onDone,
}: {
  product: ProductRow;
  onDone: (name: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const withMain = hasImage(product);

  return (
    <div
      className={`overflow-hidden rounded-xl border-2 bg-white shadow-sm ${
        withMain ? 'border-secondary-200' : 'border-dashed border-danger'
      }`}
    >
      <div className="p-2.5 pb-1">
        <div className="truncate text-sm font-bold text-gray-900" title={product.name}>
          {product.name}
        </div>
        <div className="truncate text-xs font-semibold text-secondary-700">
          {product.subCategoryName || product.mainCategoryName || 'No category'}
          {product.hide === 1 ? ' · hidden' : ''}
        </div>
        {!withMain ? (
          <div className="mt-1 text-[11px] font-bold text-danger">
            No main image - not shown in the shop
          </div>
        ) : null}
      </div>

      {/* Four separate slots: each upload fills ONLY its own slot. */}
      <div className="grid grid-cols-4 gap-1.5 p-2.5 pt-1.5">
        {IMAGE_SLOTS.map(slot => (
          <ImageSlot
            key={slot.field}
            productId={product.id}
            field={slot.field}
            label={slot.label}
            url={(product[slot.field] || '').trim()}
            onError={setError}
            onDone={() => onDone(`${product.name} (${slot.label.toLowerCase()} image)`)}
          />
        ))}
      </div>
      {error ? <div className="px-2.5 pb-2 text-xs font-bold text-danger">{error}</div> : null}
    </div>
  );
}

function ImageSlot({
  productId,
  field,
  label,
  url,
  onError,
  onDone,
}: {
  productId: number;
  field: 'thumbNail' | 'smallImage' | 'swatchImage' | 'hoverImage';
  label: string;
  url: string;
  onError: (msg: string | null) => void;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const mut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const up = await api.post<{ url: string }>('/api/admin/products/upload-image', form, {
        timeout: 60_000,
      });
      // Only this slot is sent - the server keeps the other three as they are.
      await api.patch(`/api/admin/products/${productId}/images`, { [field]: up.data.url });
    },
    onSuccess: () => onDone(),
    onError: (err: any) =>
      onError(err?.response?.data?.message ?? err?.message ?? 'Upload failed.'),
  });

  const pick = (file: File | undefined | null) => {
    onError(null);
    if (!file) return;
    if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(file.name)) {
      onError('Only PNG / JPG / GIF / WEBP / SVG.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onError('Max 10 MB.');
      return;
    }
    mut.mutate(file);
  };

  return (
    <div className="text-center">
      <div
        onClick={() => !mut.isPending && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0]); }}
        title={`Upload ${label.toLowerCase()} image`}
        className={`relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 bg-secondary-50 transition-all ${
          dragOver
            ? 'border-primary-500 ring-2 ring-primary-200'
            : url
              ? 'border-secondary-200 hover:border-primary-300'
              : 'border-dashed border-secondary-300 hover:border-primary-400'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.gif,.webp,.svg"
          className="hidden"
          onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }}
        />
        {mut.isPending ? (
          <Loader2 size={18} className="animate-spin text-primary-500" />
        ) : url ? (
          <img
            src={url}
            alt={label}
            className="h-full w-full object-contain"
            onError={e => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
          />
        ) : (
          <ImagePlus size={16} className="text-secondary-400" />
        )}
      </div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary-800">
        {label}
      </div>
    </div>
  );
}
