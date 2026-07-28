import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Categories management — flat list from the API, rendered as an
 * expandable tree client-side.
 *
 * Actions:
 *   • Add category (top-level or under a parent)
 *   • Edit an existing category
 *   • Toggle active (soft-delete equivalent — see backend comment
 *     on why we don't hard-delete)
 *
 * Cascade concern: toggling a PARENT off doesn't touch its children.
 * That mirrors the current Thymeleaf behaviour and lets the admin
 * hide a parent temporarily without losing its subtree.
 */

interface CategoryDto {
  id: number;
  name: string;
  parentCategoryId: number;
  position: number;
  level: number;
  image: string;
  isActive: number;
  childrenCount: number;
  description: string;
  urlKey: string;
}

interface ListResponse {
  count: number;
  categories: CategoryDto[];
}

interface CategoryFormValues {
  categoryId: number; // 0 = create
  name: string;
  parentCategoryId: number;
  position: number;
  image: string;
  isActive: number;
}

const EMPTY_FORM: CategoryFormValues = {
  categoryId: 0,
  name: '',
  parentCategoryId: 0,
  position: 0,
  image: '',
  isActive: 1,
};

export function CategoriesPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: async () => {
      const r = await api.get<ListResponse>('/api/admin/categories');
      return r.data;
    },
  });

  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [form, setForm] = useState<CategoryFormValues | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Group by parent for tree render.
  const byParent = useMemo(() => {
    const map = new Map<number, CategoryDto[]>();
    (data?.categories ?? []).forEach(c => {
      const key = c.parentCategoryId || 0;
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    });
    // Sort each bucket by position, then name for stable rendering.
    map.forEach(list =>
      list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    );
    return map;
  }, [data]);

  const parentOptions = useMemo(
    () =>
      (data?.categories ?? [])
        .filter(c => (c.parentCategoryId || 0) === 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data],
  );

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const toggleMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: number }) => {
      const r = await api.patch<CategoryDto>(`/api/admin/categories/${id}/active`, {
        isActive: next,
      });
      return r.data;
    },
    onSuccess: fresh => {
      qc.setQueryData<ListResponse>(['admin', 'categories'], prev => {
        if (!prev) return prev;
        return {
          ...prev,
          categories: prev.categories.map(c => (c.id === fresh.id ? fresh : c)),
        };
      });
      flash(`${fresh.isActive === 1 ? 'Activated' : 'Deactivated'} · ${fresh.name}`);
    },
  });

  const saveMut = useMutation({
    mutationFn: async (payload: CategoryFormValues) => {
      if (payload.categoryId > 0) {
        const r = await api.put<CategoryDto>(
          `/api/admin/categories/${payload.categoryId}`,
          payload,
        );
        return r.data;
      }
      const r = await api.post<CategoryDto>('/api/admin/categories', payload);
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
      setForm(null);
      flash(`Saved · ${fresh.name}`);
    },
  });

  const openCreate = (parentCategoryId: number) =>
    setForm({ ...EMPTY_FORM, parentCategoryId });

  const openEdit = (c: CategoryDto) =>
    setForm({
      categoryId: c.id,
      name: c.name,
      parentCategoryId: c.parentCategoryId || 0,
      position: c.position,
      image: c.image,
      isActive: c.isActive,
    });

  const renderRow = (c: CategoryDto, depth: number) => {
    const children = byParent.get(c.id) ?? [];
    const hasChildren = children.length > 0;
    const isOpen = expanded[c.id] ?? false;
    return (
      <div key={c.id}>
        <div
          className="flex items-center gap-2 border-t border-secondary-100 px-3 py-2 hover:bg-secondary-50"
          style={{ paddingLeft: `${12 + depth * 24}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => setExpanded(x => ({ ...x, [c.id]: !isOpen }))}
              className="rounded p-1 text-secondary-800 hover:bg-secondary-100"
              aria-label={isOpen ? 'Collapse' : 'Expand'}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-6" />
          )}
          <div className="flex flex-1 items-center gap-3">
            <span
              className={`h-2 w-2 flex-shrink-0 rounded-full ${
                c.isActive === 1 ? 'bg-success' : 'bg-secondary-300'
              }`}
              title={c.isActive === 1 ? 'Active' : 'Inactive'}
            />
            <span className="font-bold text-gray-900">{c.name}</span>
            {c.parentCategoryId === 0 ? (
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-extrabold text-primary-700">
                PARENT
              </span>
            ) : null}
            {hasChildren ? (
              <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-[10px] font-bold text-secondary-800">
                {children.length} child{children.length === 1 ? '' : 'ren'}
              </span>
            ) : null}
            <span className="text-xs text-secondary-700">#{c.id}</span>
          </div>
          <div className="flex items-center gap-1">
            {c.parentCategoryId === 0 ? (
              <button
                onClick={() => openCreate(c.id)}
                className="rounded-lg px-2 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50"
                title="Add subcategory"
              >
                <Plus size={14} className="inline" /> Subcategory
              </button>
            ) : null}
            <button
              onClick={() => openEdit(c)}
              className="rounded-lg px-2 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50"
              title="Edit"
            >
              <Edit2 size={14} className="inline" /> Edit
            </button>
            <button
              onClick={() =>
                toggleMut.mutate({ id: c.id, next: c.isActive === 1 ? 0 : 1 })
              }
              disabled={toggleMut.isPending}
              className={`rounded-lg px-2 py-1 text-xs font-bold ${
                c.isActive === 1
                  ? 'text-danger hover:bg-danger-soft'
                  : 'text-success hover:bg-success-soft'
              }`}
              title={c.isActive === 1 ? 'Deactivate' : 'Activate'}
            >
              {c.isActive === 1 ? (
                <>
                  <EyeOff size={14} className="inline" /> Hide
                </>
              ) : (
                <>
                  <Eye size={14} className="inline" /> Show
                </>
              )}
            </button>
          </div>
        </div>
        {hasChildren && isOpen ? (
          <div>{children.map(child => renderRow(child, depth + 1))}</div>
        ) : null}
      </div>
    );
  };

  const roots = byParent.get(0) ?? [];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-primary-700">Categories</h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading
              ? 'Loading…'
              : `${data?.count ?? 0} categories · ${roots.length} at root`}
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
            onClick={() => openCreate(0)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-sm font-bold text-white hover:bg-primary-600"
          >
            <Plus size={14} />
            New parent category
          </button>
        </div>
      </div>

      {toast ? (
        <div className="mb-4 rounded-lg bg-success-soft px-4 py-2 text-sm font-bold text-success">
          {toast}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-secondary-200 bg-white py-12">
          <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
          <span className="font-semibold text-secondary-800">Loading categories…</span>
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-danger bg-danger-soft px-6 py-8 text-center">
          <p className="font-bold text-danger">Couldn't load categories.</p>
        </div>
      ) : roots.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <p className="font-semibold text-secondary-800">No categories yet.</p>
          <button
            onClick={() => openCreate(0)}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-sm font-bold text-white hover:bg-primary-600"
          >
            <Plus size={14} /> Create first category
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
          <div className="border-b border-secondary-200 bg-primary-600 px-3 py-2 text-xs font-extrabold uppercase tracking-wider text-white">
            Category tree
          </div>
          {roots.map(root => renderRow(root, 0))}
        </div>
      )}

      {/* Add / edit modal */}
      {form ? (
        <CategoryFormModal
          value={form}
          onChange={setForm}
          onCancel={() => setForm(null)}
          onSubmit={values => saveMut.mutate(values)}
          submitting={saveMut.isPending}
          parents={parentOptions}
        />
      ) : null}
    </div>
  );
}

// ─── Modal ─────────────────────────────────────────────────────────

function CategoryFormModal({
  value,
  onChange,
  onCancel,
  onSubmit,
  submitting,
  parents,
}: {
  value: CategoryFormValues;
  onChange: (v: CategoryFormValues) => void;
  onCancel: () => void;
  onSubmit: (v: CategoryFormValues) => void;
  submitting: boolean;
  parents: CategoryDto[];
}) {
  const isEdit = value.categoryId > 0;
  const set = (patch: Partial<CategoryFormValues>) =>
    onChange({ ...value, ...patch });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.name.trim()) return;
    onSubmit({ ...value, name: value.name.trim() });
  };

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
          <h2 className="text-lg font-extrabold text-primary-700">
            {isEdit ? 'Edit category' : 'New category'}
          </h2>
          <button
            onClick={onCancel}
            className="rounded p-1 text-secondary-800 hover:bg-secondary-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-bold text-gray-800">
              Name<span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={value.name}
              onChange={e => set({ name: e.target.value })}
              className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none"
              placeholder="e.g. Rice"
              disabled={submitting}
              maxLength={200}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-gray-800">
              Parent category
            </label>
            <select
              value={value.parentCategoryId}
              onChange={e => set({ parentCategoryId: Number(e.target.value) })}
              className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none"
              disabled={submitting}
            >
              <option value={0}>— None (top-level parent) —</option>
              {parents
                .filter(p => p.id !== value.categoryId) // can't parent to self
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-bold text-gray-800">
                Position
              </label>
              <input
                type="number"
                min={0}
                value={value.position}
                onChange={e => set({ position: Number(e.target.value) || 0 })}
                className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none"
                disabled={submitting}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-gray-800">
                Status
              </label>
              <select
                value={value.isActive}
                onChange={e => set({ isActive: Number(e.target.value) })}
                className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none"
                disabled={submitting}
              >
                <option value={1}>Active</option>
                <option value={0}>Inactive</option>
              </select>
            </div>
          </div>

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
              disabled={submitting || !value.name.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 font-bold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-secondary-300"
            >
              {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
              {isEdit ? 'Save changes' : 'Create category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
