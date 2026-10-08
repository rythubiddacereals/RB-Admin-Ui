import { useEffect, useMemo, useState } from 'react';
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

// Pack sizes are never typed as free text: a number plus a unit from this
// list. That is what stops "250 gms", "250grams" and "250g" from becoming
// three different options.
const PACK_UNITS: { value: string; label: string }[] = [
  { value: 'g', label: 'g (grams)' },
  { value: 'kg', label: 'kg (kilograms)' },
  { value: 'ml', label: 'ml (millilitres)' },
  { value: 'litre', label: 'litre' },
  { value: 'piece', label: 'piece' },
  { value: 'bundle', label: 'bundle' },
  { value: 'packet', label: 'packet' },
  { value: 'dozen', label: 'dozen' },
];
const PLURAL_UNITS = ['litre', 'piece', 'bundle', 'packet'];

function composePack(amount: string, unit: string): string {
  const n = Number(amount.trim());
  // Must be above 0; the label uses the clean number ("05" -> "5", "0.50" -> "0.5").
  if (!amount.trim() || !Number.isFinite(n) || n <= 0) return '';
  const a = String(n);
  return `${a} ${unit}${n !== 1 && PLURAL_UNITS.includes(unit) ? 's' : ''}`;
}

function parsePack(name: string): { amount: string; unit: string } {
  const m = name
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*(g|kg|ml|litres?|pieces?|bundles?|packets?|dozen)$/);
  if (!m) return { amount: '', unit: 'kg' };
  return { amount: m[1], unit: m[2] === 'dozen' ? 'dozen' : m[2].replace(/s$/, '') };
}

function PackSizePicker({
  value,
  onChange,
  disabled,
  autoFocus,
  onEnter,
  onEscape,
}: {
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  onEnter?: () => void;
  onEscape?: () => void;
}) {
  const initial = parsePack(value);
  const [amount, setAmount] = useState(initial.amount);
  const [unit, setUnit] = useState(initial.unit);
  // Parent cleared the value (after a successful add) - reset the fields.
  useEffect(() => {
    if (value === '') setAmount('');
  }, [value]);
  const push = (a: string, u: string) => onChange(composePack(a, u));
  return (
    <span className="inline-flex items-center gap-2">
      <input
        type="number"
        min={0.001}
        step="any"
        value={amount}
        onChange={e => {
          // No leading zeros: "05" becomes "5" as you type ("0." is allowed while typing a decimal).
          const v = e.target.value.replace(/^0+(?=\d)/, '');
          setAmount(v);
          push(v, unit);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault();
            onEnter();
          }
          if (e.key === 'Escape' && onEscape) onEscape();
        }}
        placeholder="e.g. 250"
        className="w-28 rounded-lg border-2 border-secondary-200 px-3 py-2 font-semibold focus:border-primary-500 focus:outline-none"
        disabled={disabled}
        autoFocus={autoFocus}
      />
      <select
        value={unit}
        onChange={e => {
          setUnit(e.target.value);
          push(amount, e.target.value);
        }}
        className="rounded-lg border-2 border-secondary-200 px-3 py-2 font-semibold focus:border-primary-500 focus:outline-none"
        disabled={disabled}
      >
        {PACK_UNITS.map(u => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </select>
      <span className="min-w-[70px] text-sm font-bold text-primary-700">
        {composePack(amount, unit) || ''}
      </span>
    </span>
  );
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
        <PackSizePicker
          value={newName}
          onChange={setNewName}
          disabled={createMut.isPending}
        />
        <span className="flex-1" />
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
                        <PackSizePicker
                          key={o.id}
                          value={editingValue}
                          onChange={setEditingValue}
                          onEnter={saveEdit}
                          onEscape={cancelEdit}
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
