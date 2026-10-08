import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Crosshair,
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { loadGoogleMaps } from '@/lib/googleMaps';

/**
 * Delivery Centers management.
 *
 * Every row on this page directly drives the mobile + web apps'
 * shipping math (serviceability radius + per-km fee), so:
 *   - `perKmRate` is nullable → null means "use the global rate"
 *   - `isActive === 0` → the center is excluded from the shop's
 *     "nearest center" pick
 *   - deletes are hard (uses DeliveryCenterAdminService.delete)
 *
 * For picking coordinates, this pass uses:
 *   • typed lat/lng inputs
 *   • "Use my location" browser geolocation button
 *   • external Google Maps preview link
 * An embedded map picker with Places Autocomplete arrives in a
 * follow-up phase — needs the Google Maps JS SDK loaded, which the
 * scaffold intentionally kept out for now.
 */

interface Center {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  maxRadiusKm: number;
  perKmRate: number | null;
  isActive: number;
  address: string;
  contactPhone: string;
}

interface ListResponse {
  count: number;
  centers: Center[];
}

interface FormValues {
  id: number; // 0 = create
  name: string;
  latitude: string; // string in form for controlled inputs
  longitude: string;
  maxRadiusKm: string;
  perKmRate: string; // empty = null = fall back to global
  isActive: number;
  address: string;
  contactPhone: string;
}

const EMPTY_FORM: FormValues = {
  id: 0,
  name: '',
  latitude: '',
  longitude: '',
  maxRadiusKm: '15',
  perKmRate: '',
  isActive: 1,
  address: '',
  contactPhone: '',
};

function centerToForm(c: Center): FormValues {
  return {
    id: c.id,
    name: c.name,
    latitude: String(c.latitude ?? ''),
    longitude: String(c.longitude ?? ''),
    maxRadiusKm: String(c.maxRadiusKm ?? ''),
    perKmRate: c.perKmRate == null ? '' : String(c.perKmRate),
    isActive: c.isActive,
    address: c.address,
    contactPhone: c.contactPhone,
  };
}

function formToPayload(f: FormValues): any {
  const perKmRate = f.perKmRate.trim() === '' ? null : Number(f.perKmRate);
  return {
    name: f.name.trim(),
    latitude: Number(f.latitude),
    longitude: Number(f.longitude),
    maxRadiusKm: Number(f.maxRadiusKm),
    perKmRate,
    isActive: f.isActive,
    address: f.address.trim(),
    contactPhone: f.contactPhone.trim(),
  };
}

export function DeliveryCentersPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'delivery-centers'],
    queryFn: async () => {
      const r = await api.get<ListResponse>('/api/admin/delivery-centers');
      return r.data;
    },
  });

  const [form, setForm] = useState<FormValues | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Center | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const centers = useMemo(() => data?.centers ?? [], [data]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const saveMut = useMutation({
    mutationFn: async (payload: FormValues) => {
      const body = formToPayload(payload);
      if (payload.id > 0) {
        const r = await api.put<Center>(
          `/api/admin/delivery-centers/${payload.id}`,
          body,
        );
        return r.data;
      }
      const r = await api.post<Center>('/api/admin/delivery-centers', body);
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'delivery-centers'] });
      setForm(null);
      setSaveError(null);
      flash(`Saved · ${fresh.name}`);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        'Failed to save delivery center.';
      setSaveError(msg);
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: number }) => {
      const r = await api.patch<Center>(
        `/api/admin/delivery-centers/${id}/active`,
        { isActive: next },
      );
      return r.data;
    },
    onSuccess: fresh => {
      qc.invalidateQueries({ queryKey: ['admin', 'delivery-centers'] });
      flash(`${fresh.isActive === 1 ? 'Activated' : 'Deactivated'} · ${fresh.name}`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/admin/delivery-centers/${id}`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'delivery-centers'] });
      setConfirmDelete(null);
      flash('Center deleted');
    },
  });

  const openCreate = () => {
    setSaveError(null);
    setForm({ ...EMPTY_FORM });
  };
  const openEdit = (c: Center) => {
    setSaveError(null);
    setForm(centerToForm(c));
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-primary-700">
            Delivery Centers
          </h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading ? 'Loading…' : `${centers.length} centers configured`}
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
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-sm font-bold text-white hover:bg-primary-600"
          >
            <Plus size={14} />
            New center
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
          <span className="font-semibold text-secondary-800">Loading centers…</span>
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-danger bg-danger-soft px-6 py-8 text-center">
          <p className="font-bold text-danger">Couldn't load delivery centers.</p>
        </div>
      ) : centers.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <MapPin size={40} className="mx-auto text-secondary-300" />
          <p className="mt-2 font-semibold text-secondary-800">
            No delivery centers yet. Add one to enable shipping.
          </p>
          <button
            onClick={openCreate}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3 py-2 text-sm font-bold text-white hover:bg-primary-600"
          >
            <Plus size={14} /> Create first center
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="px-4 py-3 text-left font-bold">Name</th>
                <th className="px-4 py-3 text-left font-bold">Location</th>
                <th className="px-4 py-3 text-right font-bold">Radius</th>
                <th className="px-4 py-3 text-right font-bold">₹/km</th>
                <th className="px-4 py-3 text-left font-bold">Contact</th>
                <th className="px-4 py-3 text-left font-bold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {centers.map(c => (
                <tr key={c.id} className="border-t border-secondary-100 hover:bg-primary-50">
                  <td className="px-4 py-3">
                    <div className="font-bold text-gray-900">{c.name}</div>
                    {c.address ? (
                      <div className="text-xs text-secondary-800">{c.address}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-gray-800">
                      {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                    </div>
                    <a
                      href={`https://maps.google.com/?q=${c.latitude},${c.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:underline"
                    >
                      View on map <ExternalLink size={10} />
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {c.maxRadiusKm.toFixed(1)} km
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.perKmRate == null ? (
                      <span className="text-xs italic text-secondary-700">global</span>
                    ) : (
                      <span className="font-bold text-primary-700">
                        ₹{Number(c.perKmRate).toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-800">
                    {c.contactPhone ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Phone size={11} className="text-secondary-700" />
                        {c.contactPhone}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.isActive === 1 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary-100 px-3 py-1 text-xs font-bold text-secondary-800">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
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
                            ? 'text-secondary-800 hover:bg-secondary-100'
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
                      <button
                        onClick={() => setConfirmDelete(c)}
                        className="rounded-lg px-2 py-1 text-xs font-bold text-danger hover:bg-danger-soft"
                        title="Delete"
                      >
                        <Trash2 size={14} className="inline" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form ? (
        <CenterFormModal
          value={form}
          onChange={v => {
            setForm(v);
            setSaveError(null);
          }}
          onCancel={() => setForm(null)}
          onSubmit={values => saveMut.mutate(values)}
          submitting={saveMut.isPending}
          error={saveError}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDeleteModal
          center={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteMut.mutate(confirmDelete.id)}
          submitting={deleteMut.isPending}
        />
      ) : null}
    </div>
  );
}

// ─── Form modal ───────────────────────────────────────────────────

function CenterFormModal({
  value,
  onChange,
  onCancel,
  onSubmit,
  submitting,
  error,
}: {
  value: FormValues;
  onChange: (v: FormValues) => void;
  onCancel: () => void;
  onSubmit: (v: FormValues) => void;
  submitting: boolean;
  error: string | null;
}) {
  const isEdit = value.id > 0;
  const set = (patch: Partial<FormValues>) => onChange({ ...value, ...patch });
  // Inline geolocation error (replaces native alert). Cleared once
  // a successful reading comes back or the operator retries.
  const [geoError, setGeoError] = useState<string | null>(null);

  // ── Google Places autocomplete (Places API NEW) ─────────────────
  // Uses the `PlaceAutocompleteElement` web component — the SAME
  // approach the shop's LocationPickerModal uses, because this GCP
  // project only has "Places API (New)" enabled; the legacy
  // `places.Autocomplete` class throws LegacyApiNotActivatedMapError.
  // Pick a suggestion → lat/lng (+ address) fields fill themselves.
  // The select event fires long after this render, so it reads the
  // LATEST form value through refs — closing over `value` directly
  // would wipe whatever the operator typed in the meantime.
  const searchHostRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [mapsStatus, setMapsStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [mapsError, setMapsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pac: HTMLElement | null = null;
    const handleSelect = (evt: Event) => {
      const e = evt as unknown as {
        placePrediction?: { toPlace?: () => any };
        place?: any;
      };
      const place = e.placePrediction?.toPlace?.() ?? e.place;
      if (!place || typeof place.fetchFields !== 'function') return;
      place
        .fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })
        .then(() => {
          const loc = place.location;
          if (!loc) return;
          const prev = valueRef.current;
          onChangeRef.current({
            ...prev,
            latitude: loc.lat().toFixed(6),
            longitude: loc.lng().toFixed(6),
            address: place.formattedAddress ?? prev.address,
            // Only suggest a name when the operator hasn't typed one.
            name: prev.name.trim() ? prev.name : place.displayName ?? '',
          });
        })
        .catch(() => {
          /* keep whatever is typed — operator can enter coords manually */
        });
    };
    loadGoogleMaps()
      .then((maps: any) => {
        if (cancelled || !searchHostRef.current) return;
        if (!maps.places?.PlaceAutocompleteElement) {
          setMapsStatus('error');
          setMapsError(
            'Places autocomplete is unavailable in this Maps build — enter coordinates manually.',
          );
          return;
        }
        pac = new maps.places.PlaceAutocompleteElement({
          componentRestrictions: { country: ['in'] },
        }) as HTMLElement;
        pac.style.width = '100%';
        searchHostRef.current.innerHTML = '';
        searchHostRef.current.appendChild(pac);
        // Maps versions differ on the event name — listen to both.
        pac.addEventListener('gmp-select', handleSelect);
        pac.addEventListener('gmp-placeselect', handleSelect);
        setMapsStatus('ready');
      })
      .catch(err => {
        if (!cancelled) {
          setMapsStatus('error');
          setMapsError(err?.message ?? 'Google Maps failed to load.');
        }
      });
    return () => {
      cancelled = true;
      if (pac) {
        pac.removeEventListener('gmp-select', handleSelect);
        pac.removeEventListener('gmp-placeselect', handleSelect);
        pac.remove();
      }
    };
  }, []);

  const useMyLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        set({
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        });
        setGeoError(null);
      },
      err => {
        setGeoError(`Could not get location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !value.name.trim() ||
      !value.latitude ||
      !value.longitude ||
      !value.maxRadiusKm ||
      value.perKmRate.trim() === ''
    ) {
      return;
    }
    onSubmit(value);
  };

  const previewUrl =
    value.latitude && value.longitude
      ? `https://maps.google.com/?q=${value.latitude},${value.longitude}`
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky header — title + close stay visible while the body
            scrolls (same shell as the Gallery modal). */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-secondary-100 bg-white px-6 py-4">
          <h2 className="text-lg font-extrabold text-primary-700">
            {isEdit ? 'Edit delivery center' : 'New delivery center'}
          </h2>
          <button
            onClick={onCancel}
            className="rounded p-1 text-secondary-800 hover:bg-secondary-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-6 pb-6 pt-4">
          {/* Address search — pick a suggestion and lat/lng fill in.
              The input is Google's PlaceAutocompleteElement web
              component (Places API New), mounted into this host div. */}
          <div>
            <label className="mb-1 block text-sm font-bold text-gray-800">
              Search location on Google Maps
            </label>
            <div
              ref={searchHostRef}
              className={`rounded-lg border-2 border-primary-300 bg-primary-50/40 px-2 py-1 focus-within:border-primary-500 ${
                mapsStatus !== 'ready' ? 'hidden' : ''
              }`}
            />
            <p className="mt-1 text-xs text-secondary-700">
              {mapsStatus === 'loading'
                ? 'Loading Google Maps…'
                : mapsStatus === 'error'
                ? mapsError
                : 'Pick a suggestion and the coordinates + address fill in automatically.'}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-gray-800">
              Name<span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={value.name}
              onChange={e => set({ name: e.target.value })}
              className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none"
              placeholder="e.g. Kukatpally Warehouse"
              maxLength={200}
              required
              autoFocus
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-bold text-gray-800">
                Latitude<span className="text-danger">*</span>
              </label>
              <input
                type="number"
                step="0.000001"
                min={-90}
                max={90}
                value={value.latitude}
                onChange={e => set({ latitude: e.target.value })}
                className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none"
                placeholder="17.493244"
                required
                disabled={submitting}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-gray-800">
                Longitude<span className="text-danger">*</span>
              </label>
              <input
                type="number"
                step="0.000001"
                min={-180}
                max={180}
                value={value.longitude}
                onChange={e => set({ longitude: e.target.value })}
                className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none"
                placeholder="78.411585"
                required
                disabled={submitting}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={useMyLocation}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-primary-500 px-3 py-2 text-sm font-bold text-primary-700 hover:bg-primary-50"
            >
              <Crosshair size={14} />
              Use my location
            </button>
            {previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:underline"
              >
                Preview on Google Maps <ExternalLink size={11} />
              </a>
            ) : null}
            {geoError ? (
              <span className="rounded-md bg-danger-soft px-2 py-1 text-xs font-semibold text-danger">
                {geoError}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-bold text-gray-800">
                Max radius (km)<span className="text-danger">*</span>
              </label>
              <input
                type="number"
                step="0.1"
                min={0.1}
                value={value.maxRadiusKm}
                onChange={e => set({ maxRadiusKm: e.target.value })}
                className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none"
                placeholder="15"
                required
                disabled={submitting}
              />
              <p className="mt-1 text-xs text-secondary-700">
                Customers farther than this straight-line distance are shown "not serviceable".
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-gray-800">
                Per-km rate (₹)<span className="text-danger">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={value.perKmRate}
                onChange={e => set({ perKmRate: e.target.value })}
                className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none"
                placeholder="e.g. 10"
                required
                disabled={submitting}
              />
              <p className="mt-1 text-xs text-secondary-700">
                Blank = fall back to the global rate set on the backend.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-gray-800">
              Address (optional)
            </label>
            <input
              type="text"
              value={value.address}
              onChange={e => set({ address: e.target.value })}
              className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none"
              placeholder="Street, city, state"
              maxLength={500}
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-bold text-gray-800">
                Contact phone (optional)
              </label>
              <input
                type="tel"
                value={value.contactPhone}
                onChange={e => set({ contactPhone: e.target.value })}
                className="w-full rounded-lg border-2 border-secondary-200 px-4 py-2.5 font-semibold focus:border-primary-500 focus:outline-none"
                placeholder="10-digit phone"
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

          {error ? (
            <div className="rounded-lg bg-danger-soft px-4 py-2 text-sm font-semibold text-danger">
              {error}
            </div>
          ) : null}

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
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 font-bold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-secondary-300"
            >
              {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
              {isEdit ? 'Save changes' : 'Create center'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete confirmation ──────────────────────────────────────────

function ConfirmDeleteModal({
  center,
  onCancel,
  onConfirm,
  submitting,
}: {
  center: Center;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-extrabold text-danger">Delete this center?</h2>
        <p className="mt-2 text-sm text-gray-800">
          <b>{center.name}</b> will be permanently removed. Customers already
          within its radius will fall back to the next-nearest active center.
          If none exist, shipping breaks for those areas.
        </p>
        <p className="mt-2 text-xs text-secondary-800">
          Tip: prefer <b>Hide</b> over <b>Delete</b> if you may reactivate it later.
        </p>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border-2 border-secondary-300 px-4 py-2 font-bold text-gray-800 hover:bg-secondary-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2 font-bold text-white hover:bg-danger disabled:opacity-60"
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
