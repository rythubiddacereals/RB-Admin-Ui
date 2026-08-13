import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Save, Trash2, Truck } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Shipping Rules — the distance-banded free-shipping policy.
 *
 * Each row: "between MIN and MAX km, orders above ₹X ship FREE"
 * (blank = never free in that band). Below the threshold the customer
 * pays the normal per-km price. By product decision the ONLY thing that
 * varies per band is the cart threshold — the fee-above-threshold
 * concept was dropped from the UI (the API field is always sent as 0,
 * which the calculator treats as fully free).
 *
 * The whole ladder is edited locally and saved in one PUT — the backend
 * validates contiguity (starts at 0, no gaps/overlaps) and swaps the
 * set atomically, so the live shop never sees a half-edited policy.
 */

interface Band {
  minKm: number | '';
  maxKm: number | '';
  freeAboveAmount: number | '';
}

interface ApiBand {
  id: number;
  minKm: number;
  maxKm: number;
  freeAboveAmount: number | null;
  feeAboveThreshold: number;
  isActive: number;
}

interface ListResponse {
  count: number;
  bands: ApiBand[];
}

function toEditable(b: ApiBand): Band {
  return {
    minKm: b.minKm,
    maxKm: b.maxKm,
    freeAboveAmount: b.freeAboveAmount ?? '',
  };
}

export function ShippingRulesPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'shipping-rules'],
    queryFn: async () => {
      const r = await api.get<ListResponse>('/api/admin/shipping-rules');
      return r.data;
    },
  });

  const [bands, setBands] = useState<Band[]>([]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Hydrate the editable rows once from the server copy (and again on
  // refetch as long as the admin hasn't started editing).
  useEffect(() => {
    if (data?.bands && !dirty) {
      setBands(data.bands.map(toEditable));
    }
  }, [data, dirty]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        bands: bands.map(b => ({
          minKm: b.minKm === '' ? null : b.minKm,
          maxKm: b.maxKm === '' ? null : b.maxKm,
          freeAboveAmount: b.freeAboveAmount === '' ? null : b.freeAboveAmount,
          // Fee-above-threshold was dropped from the product: reaching
          // the band's cart value always means fully free delivery.
          feeAboveThreshold: 0,
        })),
      };
      const r = await api.put<ListResponse>('/api/admin/shipping-rules', payload);
      return r.data;
    },
    onSuccess: fresh => {
      qc.setQueryData(['admin', 'shipping-rules'], fresh);
      setBands(fresh.bands.map(toEditable));
      setDirty(false);
      setError(null);
      setToast('Shipping rules saved — live for all new checkouts.');
      setTimeout(() => setToast(null), 3200);
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err?.message ?? 'Could not save.'),
  });

  const patch = (i: number, field: keyof Band, value: number | '') => {
    setBands(prev => {
      const next = prev.map((b, idx) => (idx === i ? { ...b, [field]: value } : b));
      // Keep the ladder contiguous as the admin types: the next band
      // always starts where this one ends.
      if (field === 'maxKm' && next[i + 1]) {
        next[i + 1] = { ...next[i + 1], minKm: value };
      }
      return next;
    });
    setDirty(true);
    setError(null);
  };

  const addBand = () => {
    setBands(prev => {
      const lastMax = prev.length > 0 ? prev[prev.length - 1].maxKm : 0;
      return [
        ...prev,
        { minKm: lastMax, maxKm: '', freeAboveAmount: 1000 },
      ];
    });
    setDirty(true);
  };

  const removeBand = (i: number) => {
    setBands(prev => {
      const next = prev.filter((_, idx) => idx !== i);
      // Re-stitch the ladder around the removed rung.
      for (let k = 1; k < next.length; k++) {
        next[k] = { ...next[k], minKm: next[k - 1].maxKm };
      }
      if (next[0]) next[0] = { ...next[0], minKm: 0 };
      return next;
    });
    setDirty(true);
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
            <Truck size={22} /> Shipping Rules
          </h1>
          <p className="text-sm font-semibold text-secondary-800">
            Free-shipping policy by delivery distance. Below the order
            amount, normal ₹/km delivery charges apply.
          </p>
        </div>
        <button
          onClick={() => saveMut.mutate()}
          disabled={!dirty || saveMut.isPending || bands.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-bold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-secondary-300"
        >
          {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save rules
        </button>
      </div>

      {toast ? (
        <div className="mb-4 rounded-lg bg-success-soft px-4 py-2 text-sm font-bold text-success">
          {toast}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-lg bg-danger-soft px-4 py-2 text-sm font-bold text-danger">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-secondary-200 bg-white py-12">
          <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
          <span className="font-semibold text-secondary-800">Loading rules…</span>
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-danger bg-danger-soft px-6 py-8 text-center">
          <p className="font-bold text-danger">Couldn't load shipping rules.</p>
        </div>
      ) : (
        <div className="max-w-3xl">
          {/* ── The ladder ── */}
          <div className="rounded-xl border border-secondary-200 bg-white p-5 shadow-sm">
            <div className="mb-3 grid grid-cols-[1fr_1fr_1.4fr_36px] gap-3 text-xs font-extrabold uppercase text-secondary-700">
              <div>From (km)</div>
              <div>To (km)</div>
              <div>Free delivery above (₹)</div>
              <div />
            </div>

            {bands.map((b, i) => (
              <div
                key={i}
                className="mb-2 grid grid-cols-[1fr_1fr_1.4fr_36px] items-center gap-3"
              >
                {/* From: derived — first band is pinned to 0, later bands
                    to the previous row's end. Editing "To" is what moves
                    the ladder. */}
                <input
                  type="number"
                  value={b.minKm}
                  readOnly
                  className="w-full cursor-not-allowed rounded-lg border-2 border-secondary-100 bg-secondary-50 px-3 py-2 font-semibold text-secondary-700"
                  tabIndex={-1}
                />
                <input
                  type="number"
                  min={0}
                  value={b.maxKm}
                  onChange={e => patch(i, 'maxKm', e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-lg border-2 border-secondary-200 px-3 py-2 font-semibold focus:border-primary-500 focus:outline-none"
                  placeholder="km"
                />
                <input
                  type="number"
                  min={0}
                  value={b.freeAboveAmount}
                  onChange={e => patch(i, 'freeAboveAmount', e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-lg border-2 border-secondary-200 px-3 py-2 font-semibold focus:border-primary-500 focus:outline-none"
                  placeholder="blank = never free"
                />
                <button
                  onClick={() => removeBand(i)}
                  disabled={bands.length <= 1}
                  title={bands.length <= 1 ? 'At least one band is required' : 'Remove band'}
                  className="rounded-lg p-2 text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            <button
              onClick={addBand}
              className="mt-2 inline-flex items-center gap-2 rounded-lg border-2 border-dashed border-secondary-300 px-3 py-2 text-sm font-bold text-secondary-700 hover:border-primary-400 hover:text-primary-700"
            >
              <Plus size={14} /> Add band
            </button>

            <p className="mt-4 text-xs font-semibold text-secondary-700">
              Example: 0–10 km free above ₹1000 · 10–25 km free above ₹1500 ·
              25–60 km free above ₹2000. Below the amount, normal ₹/km
              delivery charges apply. Changes apply to new checkouts the
              moment they're saved — no redeploy.
            </p>
          </div>

        </div>
      )}
    </div>
  );
}
