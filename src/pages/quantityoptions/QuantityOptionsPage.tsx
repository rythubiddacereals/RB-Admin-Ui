import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCircle2,
  Edit2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Ruler,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Master list of allowed variant NAMES ("1 kg", "500g", "2 L", etc.).
 * Every product's quantity variants pick from these — kept out of
 * the per-product form so we don't accumulate "1kg" / "1 kg" / "1 KG"
 * dupes across the catalog.
 *
 * Small entity (id, name, active), so this is a single flat table
 * with inline add / rename / show-hide. No bulk actions needed at
 * current catalog size.
 */

interface QuantityOption {
  id: number;
  name: string;
  active: number;
}

interface ListResponse {
  count: number;
  options: QuantityOption[];
}

export function QuantityOptionsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'quantity-options'],
    queryFn: async () => {
      const r = await api.get<ListResponse>('/api/admin/quantity-options');
      return r.data;
    },
  });

  const [newName, setNewName] = useState('');
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const options = useMemo(() => data?.options ?? [], [data]);
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const needle = query.trim().toLowerCase();
    return options.filter(o => o.name.toLowerCase().includes(needle));
  }, [options, query]);

  const createMut = useMutation({
    mutationFn: async (name: string) => {
      const r = await api.post<QuantityOption>('/api/admin/quantity-options', {
        name,
      });
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'quantity-options'] });
      setNewName('');
      setError(null);
      flash(`Added "${fresh.name}"`);
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message ??
          err?.message ??
          'Could not create option.',
      );
    },
  });

  const renameMut = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const r = await api.patch<QuantityOption>(
        `/api/admin/quantity-options/${id}`,
        { name },
      );
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'quantity-options'] });
      setEditingId(null);
      setEditingValue('');
      setError(null);
      flash(`Renamed to "${fresh.name}"`);
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message ??
          err?.message ??
          'Could not rename option.',
      );
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: number }) => {
      const r = await api.patch<QuantityOption>(
        `/api/admin/quantity-options/${id}/active`,
        { active: next },
      );
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'quantity-options'] });
      flash(`${fresh.active === 1 ? 'Enabled' : 'Disabled'} "${fresh.name}"`);
    },
  });

  const startEdit = (o: QuantityOption) => {
    setEditingId(o.id);
    setEditingValue(o.name);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingValue('');
    setError(null);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const trimmed = editingValue.trim();
    if (!trimmed) return;
    renameMut.mutate({ id: editingId, name: trimmed });
  };

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    createMut.mutate(trimmed);
  };

  const active = options.filter(o => o.active === 1).length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
            <Ruler size={22} /> Quantity Options
          </h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading
              ? 'Loading…'
              : `${options.length} total · ${active} active`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-56 rounded-lg border-2 border-secondary-200 px-4 py-2 font-semibold focus:border-primary-500 focus:outline-none"
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
        <div className="mb-4 rounded-lg bg-success-soft px-4 py-2 text-sm font-bold text-success">
          {toast}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
          {error}
        </div>
      ) : null}

      {/* Add row */}
      <form
        onSubmit={submitCreate}
        className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-secondary-200 bg-white p-4 shadow-sm"
      >
        <span className="text-sm font-bold text-secondary-800">
          Add a new option:
        </span>
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder='e.g. "1 kg", "500g", "2 L"'
          className="flex-1 min-w-[200px] rounded-lg border-2 border-secondary-200 px-4 py-2 font-semibold focus:border-primary-500 focus:outline-none"
          maxLength={50}
          disabled={createMut.isPending}
        />
        <button
          type="submit"
          disabled={!newName.trim() || createMut.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-secondary-300"
        >
          {createMut.isPending ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <Plus size={14} />
          )}
          Add
        </button>
      </form>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-secondary-200 bg-white py-12">
          <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
          <span className="font-semibold text-secondary-800">
            Loading options…
          </span>
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-danger bg-danger-soft px-6 py-8 text-center">
          <p className="font-bold text-danger">Couldn't load options.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <Ruler size={40} className="mx-auto text-secondary-300" />
          <p className="mt-2 font-semibold text-secondary-800">
            {query
              ? `No options matched "${query}".`
              : 'No quantity options yet. Add one above.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Name</th>
                <th className="px-4 py-3 text-left font-bold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => {
                const editing = editingId === o.id;
                return (
                  <tr
                    key={o.id}
                    className="border-t border-secondary-100 hover:bg-primary-50"
                  >
                    <td className="px-4 py-3">
                      {editing ? (
                        <input
                          type="text"
                          value={editingValue}
                          onChange={e => setEditingValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEdit();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className="w-64 rounded-md border-2 border-primary-500 px-3 py-1.5 font-semibold focus:outline-none"
                          maxLength={50}
                          autoFocus
                          disabled={renameMut.isPending}
                        />
                      ) : (
                        <span className="font-bold text-gray-900">{o.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {o.active === 1 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">
                          <CheckCircle2 size={12} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-secondary-100 px-3 py-1 text-xs font-bold text-secondary-800">
                          <XCircle size={12} /> Hidden
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {editing ? (
                          <>
                            <button
                              onClick={saveEdit}
                              disabled={renameMut.isPending || !editingValue.trim()}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary-500 px-2 py-1 text-xs font-bold text-white hover:bg-primary-600 disabled:opacity-50"
                            >
                              {renameMut.isPending ? (
                                <Loader2 className="animate-spin" size={12} />
                              ) : (
                                <Check size={12} />
                              )}
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={renameMut.isPending}
                              className="rounded-lg px-2 py-1 text-xs font-bold text-secondary-800 hover:bg-secondary-100"
                            >
                              <X size={12} className="inline" /> Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(o)}
                              className="rounded-lg px-2 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50"
                            >
                              <Edit2 size={12} className="inline" /> Rename
                            </button>
                            <button
                              onClick={() =>
                                toggleMut.mutate({
                                  id: o.id,
                                  next: o.active === 1 ? 0 : 1,
                                })
                              }
                              disabled={toggleMut.isPending}
                              className={`rounded-lg px-2 py-1 text-xs font-bold ${
                                o.active === 1
                                  ? 'text-secondary-800 hover:bg-secondary-100'
                                  : 'text-success hover:bg-success-soft'
                              } disabled:opacity-50`}
                            >
                              {o.active === 1 ? (
                                <>
                                  <EyeOff size={12} className="inline" /> Hide
                                </>
                              ) : (
                                <>
                                  <Eye size={12} className="inline" /> Show
                                </>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
