import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  Truck,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatPaymentMethod } from '@/lib/payment';
import { formatWorkflowStatus } from '@/lib/orderStatus';

/**
 * "My Deliveries" — the delivery agent's home page.
 *
 * Optimised for phones / small screens:
 *   • one card per order (no wide table)
 *   • "Mark Delivered" and "Mark Failed" are one-tap actions that hit
 *     the same POST /api/admin/orders/:id/workflow endpoint the back-
 *     office uses — so the payment auto-sync (COD → COLLECTED on
 *     delivery, → FAILED on delivery failure) fires exactly the same
 *     way whether the operator is an admin or a DA.
 *   • tap "call" / "navigate" for phone and map-directions shortcuts
 *   • active queue up top, completed collapsed at the bottom
 *
 * Terminal orders (DELIVERED / DELIVERY_FAILED / ORDER_CANCELLED) show
 * a receipt-style summary instead of the action buttons.
 */

interface DeliveryOrder {
  id: number;
  date: string;
  customerName: string;
  phone: string;
  total: number;
  workflowStatus: string;
  paymentMode: string;
  paymentStatus: string;
  shippingAddress: string;
  trackingUrl: string;
  terminal: boolean;
}

interface DeliveriesResponse {
  count: number;
  orders: DeliveryOrder[];
}

const successStates = ['DELIVERED', 'COLLECTED', 'CAPTURED', 'COMPLETED', 'CLOSED', 'VERIFIED'];
const dangerStates = ['CANCELLED', 'ORDER_CANCELLED', 'FAILED', 'DELIVERY_FAILED'];

function badgeClass(state?: string): string {
  const s = (state ?? '').toUpperCase();
  if (successStates.includes(s)) return 'bg-success-soft text-success';
  if (dangerStates.includes(s)) return 'bg-danger-soft text-danger';
  return 'bg-warning-soft text-warning';
}

// Backend workflow constants — must match SaleOrderStatus.java on the
// server. Keep in lockstep or the payment auto-sync will silently no-op.
const STATUS_DELIVERED = 'DELIVERED';
const STATUS_DELIVERY_FAILED = 'DELIVERY_FAILED';

export function MyDeliveriesPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'my-deliveries'],
    queryFn: async () => {
      const r = await api.get<DeliveriesResponse>('/api/admin/my-deliveries');
      return r.data;
    },
  });

  const [showClosed, setShowClosed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [confirmFail, setConfirmFail] = useState<DeliveryOrder | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const orders = useMemo(() => data?.orders ?? [], [data]);
  const active = useMemo(() => orders.filter(o => !o.terminal), [orders]);
  const closed = useMemo(() => orders.filter(o => o.terminal), [orders]);

  const updateMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      setPendingId(id);
      // The workflow endpoint expects {role, userId} (matches the
      // legacy Thymeleaf shape). Sending {workflowStatus} used to
      // silently return 400 — every DA action would look successful
      // in the UI but never actually persist.
      const r = await api.post(`/api/admin/orders/${id}/workflow`, {
        role: status,
        userId: 0,
      });
      return { id, status, data: r.data };
    },
    onSuccess: ({ id, status }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'my-deliveries'] });
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      flash(
        status === STATUS_DELIVERED
          ? `Order #${id} marked as delivered.`
          : `Order #${id} marked as delivery failed.`,
      );
      setPendingId(null);
      setConfirmFail(null);
    },
    onError: (err: any) => {
      setPendingId(null);
      setConfirmFail(null);
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        'Update failed — try again.';
      flash(msg);
    },
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-primary-700">
            <Truck size={22} /> My Deliveries
          </h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading
              ? 'Loading…'
              : `${active.length} active · ${closed.length} completed`}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 rounded-lg border-2 border-primary-500 px-3 py-2 text-sm font-bold text-primary-700 hover:bg-primary-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {toast ? (
        <div className="mb-4 rounded-lg bg-primary-50 px-4 py-2 text-sm font-bold text-primary-700">
          {toast}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-secondary-200 bg-white py-12">
          <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
          <span className="font-semibold text-secondary-800">
            Loading deliveries…
          </span>
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-danger bg-danger-soft px-6 py-8 text-center">
          <p className="font-bold text-danger">Couldn't load deliveries.</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <Package size={40} className="mx-auto text-secondary-300" />
          <p className="mt-2 font-semibold text-secondary-800">
            No orders assigned to you yet. Your queue will show up here as
            soon as an admin assigns you to a delivery.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active queue */}
          <section>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-secondary-800">
              Active ({active.length})
            </h2>
            {active.length === 0 ? (
              <div className="rounded-xl border border-secondary-200 bg-white px-6 py-8 text-center text-sm font-semibold text-secondary-700">
                All caught up — no active deliveries.
              </div>
            ) : (
              <div className="space-y-3">
                {active.map(o => (
                  <DeliveryCard
                    key={o.id}
                    order={o}
                    busy={pendingId === o.id}
                    onDelivered={() =>
                      updateMut.mutate({ id: o.id, status: STATUS_DELIVERED })
                    }
                    onFailed={() => setConfirmFail(o)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Closed / terminal */}
          {closed.length > 0 ? (
            <section>
              <button
                onClick={() => setShowClosed(s => !s)}
                className="mb-3 inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-secondary-800 hover:text-primary-700"
              >
                Completed ({closed.length})
                {showClosed ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>
              {showClosed ? (
                <div className="space-y-3">
                  {closed.map(o => (
                    <DeliveryCard key={o.id} order={o} closed />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}

      {confirmFail ? (
        <ConfirmFailModal
          order={confirmFail}
          submitting={updateMut.isPending}
          onCancel={() => setConfirmFail(null)}
          onConfirm={() =>
            updateMut.mutate({
              id: confirmFail.id,
              status: STATUS_DELIVERY_FAILED,
            })
          }
        />
      ) : null}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────

function DeliveryCard({
  order,
  busy,
  closed,
  onDelivered,
  onFailed,
}: {
  order: DeliveryOrder;
  busy?: boolean;
  closed?: boolean;
  onDelivered?: () => void;
  onFailed?: () => void;
}) {
  const mapsUrl = order.shippingAddress
    ? `https://maps.google.com/?q=${encodeURIComponent(order.shippingAddress)}`
    : null;

  return (
    <div
      className={`rounded-xl border ${
        closed
          ? 'border-secondary-200 bg-secondary-50'
          : 'border-secondary-200 bg-white shadow-sm'
      } p-4`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold text-gray-900">
              #{order.id}
            </span>
            <span
              className={`rounded-full px-3 py-0.5 text-xs font-bold ${badgeClass(
                order.workflowStatus,
              )}`}
            >
              {formatWorkflowStatus(order.workflowStatus)}
            </span>
          </div>
          <div className="mt-1 text-xs font-semibold text-secondary-700">
            Placed {order.date}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-extrabold text-primary-700">
            ₹{(order.total ?? 0).toFixed(2)}
          </div>
          <div className="text-xs font-bold text-accent">
            {formatPaymentMethod(order.paymentMode)}
            {order.paymentStatus ? (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeClass(
                  order.paymentStatus,
                )}`}
              >
                {order.paymentStatus}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mb-2 flex items-start gap-2 text-sm">
        <MapPin size={14} className="mt-0.5 flex-shrink-0 text-secondary-700" />
        <div className="flex-1">
          <div className="font-bold text-gray-900">
            {order.customerName || 'Customer'}
          </div>
          <div className="text-gray-800">
            {order.shippingAddress || 'Address not on file'}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {order.phone ? (
          <a
            href={`tel:${order.phone}`}
            className="inline-flex items-center gap-1 rounded-lg border-2 border-primary-500 px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-50"
          >
            <Phone size={12} /> Call {order.phone}
          </a>
        ) : null}
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border-2 border-primary-500 px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-50"
          >
            <Navigation size={12} /> Navigate
          </a>
        ) : null}
        {order.trackingUrl ? (
          <a
            href={order.trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-bold text-secondary-700 hover:underline"
          >
            Tracking <ExternalLink size={11} />
          </a>
        ) : null}
      </div>

      {!closed ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-secondary-200 pt-3">
          <button
            onClick={onDelivered}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <CheckCircle2 size={16} />
            )}
            Mark Delivered
          </button>
          <button
            onClick={onFailed}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border-2 border-danger px-4 py-2.5 text-sm font-bold text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            <XCircle size={16} />
            Delivery Failed
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ─── Confirm-fail modal ───────────────────────────────────────────

function ConfirmFailModal({
  order,
  submitting,
  onCancel,
  onConfirm,
}: {
  order: DeliveryOrder;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
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
        <h2 className="text-lg font-extrabold text-danger">
          Mark delivery as failed?
        </h2>
        <p className="mt-2 text-sm text-gray-800">
          Order <b>#{order.id}</b> for <b>{order.customerName || 'this customer'}</b> will be
          moved to <b>DELIVERY_FAILED</b>. If the order is COD, the payment
          will be marked <b>FAILED</b> automatically — no cash will be
          reconciled to your rider log.
        </p>
        <p className="mt-2 text-xs text-secondary-800">
          Only choose this if the customer couldn't accept the delivery
          (not-at-home, refused, address wrong). This action can't be
          undone from the DA app.
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
            className="inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2 font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
            Yes, mark failed
          </button>
        </div>
      </div>
    </div>
  );
}
