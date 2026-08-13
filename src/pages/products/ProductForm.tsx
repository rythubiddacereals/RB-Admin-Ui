import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload as UploadIcon,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Product add / edit form.
 *
 * Same component serves both routes:
 *   • /products/new           — no productId → create
 *   • /products/:id/edit      — productId in URL → edit
 *
 * Design notes:
 *   - Single POST/PUT for the whole product (basic fields + category
 *     + qty options). The backend diffs qty options by id, so the
 *     form can just submit the desired state — no need to track
 *     per-row create/update/delete deltas here.
 *   - Image handling is URL-only for now (matches the detail view).
 *     Actual multipart upload is a separate feature — dropping it in
 *     here would double the size of the form and delay basic edits.
 *   - Category picker only shows leaf categories (no children) so
 *     products can't be linked to a parent-only node.
 */

interface CategoryRow {
  id: number;
  parentCategoryId: number;
  name: string;
  level: number;
  isActive: number;
}

interface CategoriesResponse {
  count: number;
  categories: CategoryRow[];
}

interface QuantityOptionCatalog {
  id: number;
  name: string;
  active: number;
}

interface QuantityOptionsResponse {
  count: number;
  options: QuantityOptionCatalog[];
}

interface QtyOption {
  id: number;
  name: string;
  price: number;
  marketPrice: number;
  displayOrder: number;
}

interface ProductDetail {
  id: number;
  name: string;
  thumbNail: string;
  smallImage: string;
  hoverImage: string;
  swatchImage: string;
  outOfStock: number;
  bestSeller: number;
  newArrival: number;
  hide: number;
  description: string;
  shortDescription: string;
  categoryId: number;
  qtyOptions: QtyOption[];
}

interface FormValues {
  name: string;
  shortDescription: string;
  description: string;
  categoryId: number;
  thumbNail: string;
  smallImage: string;
  hoverImage: string;
  swatchImage: string;
  outOfStock: number;
  bestSeller: number;
  newArrival: number;
  hide: number;
  qtyOptions: QtyOption[];
}

const EMPTY_FORM: FormValues = {
  name: '',
  shortDescription: '',
  description: '',
  categoryId: 0,
  thumbNail: '',
  smallImage: '',
  hoverImage: '',
  swatchImage: '',
  outOfStock: 0,
  bestSeller: 0,
  newArrival: 0,
  hide: 0,
  qtyOptions: [],
};

function detailToForm(d: ProductDetail): FormValues {
  return {
    name: d.name ?? '',
    shortDescription: d.shortDescription ?? '',
    description: d.description ?? '',
    categoryId: d.categoryId ?? 0,
    thumbNail: d.thumbNail ?? '',
    smallImage: d.smallImage ?? '',
    hoverImage: d.hoverImage ?? '',
    swatchImage: d.swatchImage ?? '',
    outOfStock: d.outOfStock ?? 0,
    bestSeller: d.bestSeller ?? 0,
    newArrival: d.newArrival ?? 0,
    hide: d.hide ?? 0,
    qtyOptions: (d.qtyOptions ?? []).map(q => ({ ...q })),
  };
}

function formToPayload(f: FormValues) {
  return {
    name: f.name.trim(),
    // SKU dropped from the form (not used in the RB catalog). Send an
    // empty string so the backend's non-null column contract is met
    // without persisting a stale value.
    sku: '',
    shortDescription: f.shortDescription,
    description: f.description,
    // Base price is dropped — every product's real price is on the
    // qty-option variants (1kg / 5kg / etc).
    price: 0,
    specialPrice: 0,
    categoryId: f.categoryId,
    thumbNail: f.thumbNail.trim(),
    smallImage: f.smallImage.trim(),
    hoverImage: f.hoverImage.trim(),
    swatchImage: f.swatchImage.trim(),
    outOfStock: f.outOfStock,
    bestSeller: f.bestSeller,
    newArrival: f.newArrival,
    // "Featured" toggle removed — always send 0 so an edit never
    // accidentally flips this bit.
    smFeatured: 0,
    hide: f.hide,
    qtyOptions: f.qtyOptions.map((q, idx) => ({
      id: q.id ?? 0,
      name: q.name,
      price: q.price,
      marketPrice: q.marketPrice,
      displayOrder: q.displayOrder || idx + 1,
    })),
  };
}

export function ProductFormPage() {
  const { productId } = useParams<{ productId: string }>();
  const isEdit = Boolean(productId);
  const idNum = Number(productId);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Existing product (edit mode)
  const productQuery = useQuery({
    queryKey: ['admin', 'product', idNum],
    queryFn: async () => {
      const r = await api.get<ProductDetail>(`/api/admin/products/${idNum}`);
      return r.data;
    },
    enabled: isEdit && Number.isFinite(idNum) && idNum > 0,
  });

  // Categories for the picker
  const categoriesQuery = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: async () => {
      const r = await api.get<CategoriesResponse>('/api/admin/categories');
      return r.data;
    },
  });

  // Master quantity-option catalog — populates the variant name
  // dropdown so operators pick from a curated list ("1 kg", "500 g",
  // "2 L", …) instead of typing free text. Cached across the app so
  // switching between products doesn't refetch.
  const quantityOptionsQuery = useQuery({
    queryKey: ['admin', 'quantity-options'],
    queryFn: async () => {
      const r = await api.get<QuantityOptionsResponse>('/api/admin/quantity-options');
      return r.data;
    },
  });

  // Hydrate the form when the product loads (edit mode only)
  useEffect(() => {
    if (productQuery.data) {
      setForm(detailToForm(productQuery.data));
    }
  }, [productQuery.data]);

  // Active options from the catalog + any names already on the
  // product that aren't in the catalog (legacy data). Union keeps
  // edit forms working even if someone hid an option after using it.
  const qtyNameChoices = useMemo(() => {
    const active = (quantityOptionsQuery.data?.options ?? [])
      .filter(o => o.active === 1)
      .map(o => o.name)
      .filter(Boolean);
    const inUse = form.qtyOptions.map(q => q.name).filter(Boolean);
    const set = new Set<string>([...active, ...inUse]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [quantityOptionsQuery.data, form.qtyOptions]);

  const leafCategories = useMemo(() => {
    const all = categoriesQuery.data?.categories ?? [];
    // A leaf category has no other rows citing it as parent.
    const parentIds = new Set(all.map(c => c.parentCategoryId).filter(id => id > 0));
    return all
      .filter(c => !parentIds.has(c.id) && c.isActive === 1)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categoriesQuery.data]);

  const parentNameById = useMemo(() => {
    const all = categoriesQuery.data?.categories ?? [];
    const map = new Map<number, string>();
    all.forEach(c => map.set(c.id, c.name));
    return map;
  }, [categoriesQuery.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = formToPayload(form);
      if (isEdit) {
        const r = await api.put(`/api/admin/products/${idNum}`, body);
        return r.data;
      }
      const r = await api.post('/api/admin/products', body);
      return r.data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      qc.invalidateQueries({ queryKey: ['admin', 'product', idNum] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard', 'stats'] });
      const newId = data?.id ?? idNum;
      navigate(`/products/${newId}`);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        'Save failed — try again.';
      setSaveError(msg);
    },
  });

  const set = (patch: Partial<FormValues>) => {
    setForm(f => ({ ...f, ...patch }));
    setSaveError(null);
  };

  const setOption = (idx: number, patch: Partial<QtyOption>) => {
    setForm(f => ({
      ...f,
      qtyOptions: f.qtyOptions.map((q, i) =>
        i === idx ? { ...q, ...patch } : q,
      ),
    }));
    setSaveError(null);
  };

  const addOption = () =>
    setForm(f => ({
      ...f,
      qtyOptions: [
        ...f.qtyOptions,
        {
          id: 0,
          name: '',
          price: 0,
          marketPrice: 0,
          displayOrder: f.qtyOptions.length + 1,
        },
      ],
    }));

  const removeOption = (idx: number) =>
    setForm(f => ({
      ...f,
      qtyOptions: f.qtyOptions.filter((_, i) => i !== idx),
    }));

  const moveOption = (idx: number, dir: -1 | 1) => {
    setForm(f => {
      const next = [...f.qtyOptions];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return f;
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...f, qtyOptions: next.map((q, i) => ({ ...q, displayOrder: i + 1 })) };
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || form.categoryId <= 0) {
      setSaveError('Product name and category are required.');
      return;
    }
    saveMut.mutate();
  };

  const loading = isEdit && productQuery.isLoading;
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
        <span className="font-semibold text-secondary-800">Loading product…</span>
      </div>
    );
  }

  if (isEdit && productQuery.isError) {
    return (
      <div className="rounded-xl border border-danger bg-danger-soft p-6">
        <p className="font-bold text-danger">Couldn't load product #{idNum}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link
        to={isEdit ? `/products/${idNum}` : '/products'}
        className="inline-flex items-center gap-1 text-sm font-bold text-primary-700 hover:underline"
      >
        <ArrowLeft size={14} /> Back
      </Link>

      <div>
        <h1 className="text-2xl font-extrabold text-primary-700">
          {isEdit ? `Edit product #${idNum}` : 'New product'}
        </h1>
        <p className="mt-1 text-sm font-semibold text-secondary-800">
          {isEdit
            ? 'Update fields, adjust variants, and save. Cache reloads automatically.'
            : 'Fill out the basics and at least one quantity option. You can polish images and copy later.'}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {/* Basics */}
        <SectionCard title="Basics">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name" required>
              <input
                type="text"
                value={form.name}
                onChange={e => set({ name: e.target.value })}
                className={inputCls}
                placeholder="e.g. Sona Masuri Rice"
                maxLength={250}
                required
                disabled={saveMut.isPending}
              />
            </Field>
            <Field label="Category" required>
              <select
                value={form.categoryId}
                onChange={e => set({ categoryId: Number(e.target.value) })}
                className={inputCls}
                required
                disabled={saveMut.isPending || categoriesQuery.isLoading}
              >
                <option value={0}>
                  {categoriesQuery.isLoading ? 'Loading…' : '— Select a category —'}
                </option>
                {leafCategories.map(c => {
                  const parent =
                    c.parentCategoryId > 0
                      ? parentNameById.get(c.parentCategoryId)
                      : null;
                  return (
                    <option key={c.id} value={c.id}>
                      {parent ? `${parent} › ${c.name}` : c.name}
                    </option>
                  );
                })}
              </select>
            </Field>
          </div>
          <p className={hintCls}>
            Pricing is defined per variant in the "Quantity variants"
            section below (₹ on each row). This page has no
            product-level price.
          </p>
        </SectionCard>

        {/* Description */}
        <SectionCard title="Description">
          <Field label="Short description">
            <textarea
              value={form.shortDescription}
              onChange={e => set({ shortDescription: e.target.value })}
              className={inputCls}
              rows={2}
              placeholder="One line shown in product cards."
              disabled={saveMut.isPending}
            />
          </Field>
          <Field label="Full description">
            <textarea
              value={form.description}
              onChange={e => set({ description: e.target.value })}
              className={inputCls}
              rows={6}
              placeholder="HTML allowed — describe the product, sourcing, storage, etc."
              disabled={saveMut.isPending}
            />
          </Field>
        </SectionCard>

        {/* Images — same four slots the legacy admin exposes:
            thumbnail (grid), small (product page), hover (rollover
            swap), swatch (variant chip). All optional — shop falls
            back to the thumbnail if a later slot is empty. */}
        <SectionCard title="Images">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ImageUpload
              label="Thumbnail"
              value={form.thumbNail}
              onChange={v => set({ thumbNail: v })}
              disabled={saveMut.isPending}
            />
            <ImageUpload
              label="Small image"
              value={form.smallImage}
              onChange={v => set({ smallImage: v })}
              disabled={saveMut.isPending}
            />
            <ImageUpload
              label="Hover image"
              value={form.hoverImage}
              onChange={v => set({ hoverImage: v })}
              disabled={saveMut.isPending}
            />
            <ImageUpload
              label="Swatch image"
              value={form.swatchImage}
              onChange={v => set({ swatchImage: v })}
              disabled={saveMut.isPending}
            />
          </div>
          <p className="text-xs font-semibold text-secondary-700">
            PNG / JPG / WEBP up to 10 MB per file. Uploaded to the same S3
            bucket the shop reads from — URL is stored on the product row
            automatically. Thumbnail is the primary image; the shop uses
            hover / small / swatch when the layout calls for them.
          </p>
        </SectionCard>

        {/* Flags */}
        <SectionCard title="Badges & visibility">
          <div className="grid gap-3 sm:grid-cols-2">
            <FlagToggle
              label="Best seller"
              value={form.bestSeller}
              onChange={v => set({ bestSeller: v })}
              disabled={saveMut.isPending}
            />
            <FlagToggle
              label="New arrival"
              value={form.newArrival}
              onChange={v => set({ newArrival: v })}
              disabled={saveMut.isPending}
            />
            <FlagToggle
              label="Out of stock"
              value={form.outOfStock}
              onChange={v => set({ outOfStock: v })}
              disabled={saveMut.isPending}
            />
            <FlagToggle
              label="Hide from shop"
              value={form.hide}
              onChange={v => set({ hide: v })}
              disabled={saveMut.isPending}
            />
          </div>
          <p className="text-xs font-semibold text-secondary-700">
            <b>Hide from shop</b> completely removes the product from the
            catalog listing — different from Out of stock, which keeps the
            tile visible but disables checkout. Use hide when you're
            retiring a product or staging one that isn't ready yet.
          </p>
        </SectionCard>

        {/* Qty options */}
        <SectionCard
          title="Quantity variants"
          action={
            <button
              type="button"
              onClick={addOption}
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-600"
            >
              <Plus size={12} /> Add variant
            </button>
          }
        >
          {form.qtyOptions.length === 0 ? (
            <p className="rounded-lg border-2 border-dashed border-secondary-200 px-4 py-6 text-center text-sm font-semibold text-secondary-700">
              No variants yet. Add one to define pricing (e.g. "1 kg" @ ₹100,
              "5 kg" @ ₹480).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-secondary-50 text-xs uppercase tracking-wide text-secondary-800">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold">#</th>
                    <th className="px-3 py-2 text-left font-bold">Name</th>
                    <th className="px-3 py-2 text-right font-bold">Price (₹)</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {form.qtyOptions.map((q, idx) => (
                    <tr key={idx} className="border-t border-secondary-100">
                      <td className="px-3 py-2 font-bold text-gray-800">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={q.name}
                          onChange={e => setOption(idx, { name: e.target.value })}
                          className="w-full rounded-md border border-secondary-200 bg-white px-2 py-1.5 font-semibold focus:border-primary-500 focus:outline-none"
                          disabled={saveMut.isPending || quantityOptionsQuery.isLoading}
                        >
                          <option value="">
                            {quantityOptionsQuery.isLoading
                              ? 'Loading…'
                              : '— Select —'}
                          </option>
                          {qtyNameChoices.map(name => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={q.price}
                          onChange={e =>
                            setOption(idx, { price: Number(e.target.value) || 0 })
                          }
                          className="w-28 rounded-md border border-secondary-200 px-2 py-1.5 text-right font-semibold focus:border-primary-500 focus:outline-none"
                          disabled={saveMut.isPending}
                        />
                      </td>
                      {/* Market price (MRP) removed from the UI — the
                          field still rides through the payload untouched
                          so existing rows keep their stored values. */}
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => moveOption(idx, -1)}
                            disabled={idx === 0 || saveMut.isPending}
                            className="rounded p-1 text-secondary-700 hover:bg-secondary-100 disabled:opacity-30"
                            title="Move up"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveOption(idx, 1)}
                            disabled={
                              idx === form.qtyOptions.length - 1 || saveMut.isPending
                            }
                            className="rounded p-1 text-secondary-700 hover:bg-secondary-100 disabled:opacity-30"
                            title="Move down"
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeOption(idx)}
                            disabled={saveMut.isPending}
                            className="rounded p-1 text-danger hover:bg-danger-soft"
                            title="Remove"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {saveError ? (
          <div className="rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
            {saveError}
          </div>
        ) : null}

        {/* Submit bar */}
        <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-secondary-200 bg-white/95 px-4 py-3 backdrop-blur">
          <Link
            to={isEdit ? `/products/${idNum}` : '/products'}
            className="rounded-lg border-2 border-secondary-300 px-4 py-2 font-bold text-gray-800 hover:bg-secondary-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2 font-bold text-white shadow-sm hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-secondary-300"
          >
            {saveMut.isPending ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Save size={16} />
            )}
            {isEdit ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Small building blocks ────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none disabled:opacity-60';
const hintCls = 'mt-1 text-xs font-semibold text-secondary-700';

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-secondary-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-secondary-200 px-5 py-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-secondary-800">
          {title}
        </h2>
        {action}
      </header>
      <div className="space-y-4 px-5 py-4">{children}</div>
    </section>
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

function ImageUpload({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
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
      // 60 s so a slow S3 upload doesn't hit the shared axios 15 s
      // default. Multipart body — axios auto-sets the Content-Type
      // with the boundary.
      const r = await api.post<{ url: string }>(
        '/api/admin/products/upload-image',
        form,
        { timeout: 60_000 },
      );
      onChange(r.data.url);
    } catch (e: any) {
      setError(
        e?.response?.data?.message ?? e?.message ?? 'Upload failed.',
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-bold text-gray-800">
        {label}
      </label>
      <div className="flex items-start gap-3">
        {value ? (
          <img
            src={value}
            alt=""
            className="h-20 w-20 rounded-lg border border-secondary-200 object-cover"
            onError={e => {
              (e.target as HTMLImageElement).src = '/placeholder-product.svg';
            }}
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-secondary-300 text-xs font-semibold text-secondary-500">
            no image
          </div>
        )}
        <div className="flex flex-1 flex-col gap-2">
          <button
            type="button"
            onClick={pick}
            disabled={disabled || uploading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-primary-500 px-3 py-2 text-sm font-bold text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <UploadIcon size={14} />
            )}
            {uploading ? 'Uploading…' : value ? 'Replace image' : 'Choose image'}
          </button>
          {value ? (
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={disabled || uploading}
              className="text-left text-xs font-bold text-danger hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
          {error ? (
            <p className="text-xs font-semibold text-danger">{error}</p>
          ) : null}
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
    </div>
  );
}

function FlagToggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const on = value === 1;
  return (
    <button
      type="button"
      onClick={() => onChange(on ? 0 : 1)}
      disabled={disabled}
      aria-pressed={on}
      className={`flex items-center justify-between rounded-lg border-2 px-4 py-2.5 text-sm font-bold transition-colors ${
        on
          ? 'border-success bg-success-soft text-success'
          : 'border-secondary-300 bg-white text-gray-600 hover:bg-secondary-50'
      } disabled:opacity-60`}
    >
      {label}
      {/* Explicit ON / OFF text next to a switch, so the state is
          unambiguous even without color perception. Previously the
          pill alone flipped from red to grey — which reads as "off
          looks disabled" and gets confused with the whole button's
          disabled state. */}
      <span
        className={`ml-3 inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
          on ? 'bg-success text-white' : 'bg-secondary-200 text-secondary-700'
        }`}
      >
        <span
          className={`relative inline-block h-3 w-6 rounded-full ${
            on ? 'bg-white/40' : 'bg-white/70'
          }`}
        >
          <span
            className={`absolute top-0.5 h-2 w-2 rounded-full bg-white shadow transition-transform ${
              on ? 'translate-x-3.5' : 'translate-x-0.5'
            }`}
          />
        </span>
        {on ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}
