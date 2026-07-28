import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  ClipboardList,
  Home,
  Loader2,
  Package,
  Phone,
  Send,
  Truck,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatPaymentMethod } from '@/lib/payment';
import { STEP_LABEL, formatWorkflowStatus } from '@/lib/orderStatus';

/**
 * Order Workflow page — GET /api/admin/orders/:id.
 *
 * Layout:
 *   • Summary card (customer, phone, shipping address, totals)
 *   • Items table
 *   • Payment card (mode + status badge)
 *   • Workflow timeline (append-only, oldest first)
 *   • Status update form (role dropdown → confirm → POST /workflow)
 *
 * On successful status change, the backend returns the refreshed
 * order payload; we swap it in via `setQueryData` so the UI updates
 * without a second network round-trip.
 */

interface OrderDetail {
  id: number;
  date: string;
  status: string;
  subtotal: number;
  shipping: number;
  /** First-order (FIRST10) discount recorded on the order; 0 when none. */
  discountAmount?: number;
  discountCode?: string;
  grandTotal: number;
  customer: {
    id?: number;
    firstname?: string;
    lastname?: string;
    email?: string;
  };
  shippingAddress: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    telephone?: string;
    firstname?: string;
    lastname?: string;
  };
  items: Array<{
    id: number;
    name: string;
    image?: string;
    qtyOption?: string;
    qty: number;
    price: number;
  }>;
  payment: {
    id?: number;
    method?: string;
    status?: string;
    amount?: number;
    refundStatus?: string;
  };
  workflow: Array<{
    id: number;
    step: string;
    notes?: string;
    userId: number;
    createdAt: string;
  }>;
  assignedAgent?: {
    workflowUserId?: number;
    name?: string;
    phone?: string;
  };
}

const successStates = ['DELIVERED', 'COLLECTED', 'VERIFIED', 'CAPTURED', 'COMPLETED', 'CLOSED'];
const dangerStates = ['CANCELLED', 'ORDER_CANCELLED', 'FAILED', 'DELIVERY_FAILED'];

function badgeClass(state?: string): string {
  const s = (state ?? '').toUpperCase();
  if (successStates.includes(s)) return 'bg-success-soft text-success';
  if (dangerStates.includes(s)) return 'bg-danger-soft text-danger';
  return 'bg-warning-soft text-warning';
}

/**
 * Which steps the operator can move the order to given its current
 * status. The first entry is treated as the "current" — pre-selected
 * in the dropdown for context so the operator sees where they stand.
 *
 *   • Fresh order (PROCESSING / PLACED / anything not yet
 *     out-for-delivery) → Processing (current) · Out for Delivery ·
 *     Cancel Order
 *   • Out for Delivery → Out for Delivery (current) · Delivered ·
 *     Delivery Failed · Cancel Order
 *
 * Terminal statuses (delivered / failed / cancelled) return an empty
 * array — the caller renders "no changes possible" instead.
 */
function nextStepsFor(currentStatus: string): string[] {
  const s = (currentStatus || '').toUpperCase();
  if (['DELIVERED', 'DELIVERY_FAILED', 'ORDER_CANCELLED', 'CANCELLED', 'CLOSED'].includes(s)) {
    return [];
  }
  if (s === 'DELIVERY_AGENT') {
    return ['DELIVERY_AGENT', 'DELIVERED', 'DELIVERY_FAILED', 'ORDER_CANCELLED'];
  }
  // Fresh / processing / empty / any other non-terminal state
  return ['PROCESSING', 'DELIVERY_AGENT', 'ORDER_CANCELLED'];
}

interface DeliveryAgent {
  id: number;
  name: string;
  phone: string;
  supportUserId: number;
}

interface DeliveryAgentsResponse {
  count: number;
  agents: DeliveryAgent[];
}

export function OrderWorkflowPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const id = Number(orderId);
  const qc = useQueryClient();

  // The dropdown is pre-populated with the current status once the
  // order loads (see effect below). `nextRole` therefore always
  // represents "what the operator wants next" — it starts equal to
  // the current status so the Apply button is a no-op until they
  // pick something different.
  const [nextRole, setNextRole] = useState<string>('');
  const [selectedAgentId, setSelectedAgentId] = useState<number>(0);
  const [toast, setToast] = useState<string | null>(null);
  // Modal-based confirm (replaces window.confirm) — stores the
  // pending role change; null means no confirm is open. On
  // ORDER_CANCELLED the modal collects a reason string that gets
  // threaded through to the backend (workflow notes + SMS + refund).
  const [pendingConfirm, setPendingConfirm] = useState<{
    role: string;
    userId: number;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'order', id],
    queryFn: async () => {
      const r = await api.get<OrderDetail>(`/api/admin/orders/${id}`);
      return r.data;
    },
    enabled: Number.isFinite(id) && id > 0,
  });

  // Delivery agents — only fetched when needed (i.e., the operator
  // has picked "Out for Delivery" in the next-step dropdown). Cached
  // across pages via react-query so switching between orders doesn't
  // refire the request.
  const agentsQuery = useQuery({
    queryKey: ['admin', 'workflow-users', 'delivery-agents'],
    queryFn: async () => {
      const r = await api.get<DeliveryAgentsResponse>(
        '/api/admin/workflow-users/delivery-agents',
      );
      return r.data;
    },
    enabled: nextRole === 'DELIVERY_AGENT',
  });

  const updateMut = useMutation({
    mutationFn: async ({
      role,
      userId,
      reason,
    }: {
      role: string;
      userId: number;
      reason?: string;
    }) => {
      const r = await api.post<OrderDetail>(
        `/api/admin/orders/${id}/workflow`,
        { role, userId, reason: reason ?? '' },
      );
      return r.data;
    },
    onSuccess: fresh => {
      qc.setQueryData(['admin', 'order', id], fresh);
      // Invalidate the list so navigating back shows the new status.
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      qc.invalidateQueries({ queryKey: ['admin', 'my-deliveries'] });
      setNextRole(fresh.status);
      setSelectedAgentId(0);
      const label = STEP_LABEL[fresh.status] ?? fresh.status;
      setToast(`Status updated → ${label}`);
      setTimeout(() => setToast(null), 4000);
    },
  });

  const customerName = useMemo(() => {
    const c = data?.customer;
    if (!c) return '';
    return [c.firstname, c.lastname].filter(Boolean).join(' ');
  }, [data]);

  // Seed the next-step dropdown with the order's current status. If
  // the API sends an empty status (fresh orders before the workflow
  // runs), default to PROCESSING so the operator sees a sensible
  // starting point — the actual DB row stays untouched until Apply
  // is pressed.
  //
  // When the order is already at DELIVERY_AGENT, pre-select the
  // currently-assigned agent in the picker too — reassignment is
  // then a two-click flow (change the dropdown, hit Apply).
  useEffect(() => {
    if (!data) return;
    const currentUpper = (data.status || '').toUpperCase();
    const availableSteps = nextStepsFor(currentUpper);
    if (availableSteps.length === 0) {
      setNextRole(currentUpper);
      setSelectedAgentId(0);
      return;
    }
    setNextRole(availableSteps[0]);
    setSelectedAgentId(data.assignedAgent?.workflowUserId ?? 0);
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
        <span className="font-semibold text-secondary-800">Loading order…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-danger bg-danger-soft p-6">
        <p className="font-bold text-danger">Couldn't load order #{id}.</p>
      </div>
    );
  }

  const o = data;
  const isTerminal =
    successStates.includes(o.status.toUpperCase()) ||
    dangerStates.includes(o.status.toUpperCase());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/orders"
            className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-primary-700 hover:underline"
          >
            <ArrowLeft size={14} />
            Back to orders
          </Link>
          <h1 className="text-2xl font-extrabold text-primary-700">
            Order #{o.id}
          </h1>
          <p className="text-sm font-semibold text-secondary-800">
            Placed on {o.date}
          </p>
        </div>
        <span className={`rounded-full px-4 py-1.5 text-sm font-bold ${badgeClass(o.status)}`}>
          {formatWorkflowStatus(o.status)}
        </span>
      </div>

      {toast ? (
        <div className="rounded-lg bg-success-soft px-4 py-3 text-sm font-bold text-success">
          <CheckCircle2 className="mr-1 inline" size={16} /> {toast}
        </div>
      ) : null}

      <StatusTimeline status={o.status} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Customer + shipping */}
        <div className="rounded-xl border border-secondary-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-secondary-800">
            <User size={14} /> Customer & Shipping
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-bold uppercase text-secondary-700">Customer</div>
              <div className="mt-1 font-bold text-gray-900">
                {customerName || '—'}
              </div>
              <div className="text-sm text-gray-700">{o.customer?.email}</div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase text-secondary-700">
                Shipping address
              </div>
              <div className="mt-1 text-sm font-semibold text-gray-800">
                {[
                  o.shippingAddress.line1,
                  o.shippingAddress.line2,
                  o.shippingAddress.city,
                  o.shippingAddress.state,
                  o.shippingAddress.postcode,
                ]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </div>
              {o.shippingAddress.telephone ? (
                <div className="mt-1 flex items-center gap-1 text-sm text-gray-700">
                  <Phone size={12} />
                  {o.shippingAddress.telephone}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Totals */}
        <div className="rounded-xl border border-secondary-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-secondary-800">
            <Package size={14} /> Payment
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-700">
              <span>Subtotal</span>
              <span>₹{(o.subtotal ?? 0).toFixed(2)}</span>
            </div>
            {(o.discountAmount ?? 0) > 0 && (
              <div className="flex justify-between font-semibold text-green-700">
                <span>Discount{o.discountCode ? ` (${o.discountCode})` : ''}</span>
                <span>−₹{(o.discountAmount ?? 0).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-700">
              <span>Delivery</span>
              <span>₹{(o.shipping ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-secondary-200 pt-2 font-extrabold text-gray-900">
              <span>Total</span>
              <span>₹{(o.grandTotal ?? 0).toFixed(2)}</span>
            </div>
            <div className="!mt-4 flex items-center justify-between rounded-lg bg-secondary-50 px-3 py-2">
              <div className="text-xs font-bold uppercase text-secondary-700">
                {formatPaymentMethod(o.payment?.method)}
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${badgeClass(
                  o.payment?.status,
                )}`}
              >
                {o.payment?.status || '—'}
              </span>
            </div>
            {o.payment?.refundStatus ? (
              <div className="text-xs text-secondary-700">
                Refund: {o.payment.refundStatus}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
        <h2 className="border-b border-secondary-200 bg-secondary-50 px-5 py-3 text-sm font-extrabold uppercase tracking-wider text-secondary-800">
          Items ({o.items.length})
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-primary-600 text-white">
            <tr>
              <th className="px-4 py-2 text-left font-bold">Item</th>
              <th className="px-4 py-2 text-left font-bold">Variant</th>
              <th className="px-4 py-2 text-right font-bold">Qty</th>
              <th className="px-4 py-2 text-right font-bold">Price</th>
              <th className="px-4 py-2 text-right font-bold">Line total</th>
            </tr>
          </thead>
          <tbody>
            {o.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm font-semibold text-secondary-700">
                  No items on this order.
                </td>
              </tr>
            ) : (
              o.items.map(it => (
                <tr key={it.id} className="border-t border-secondary-100">
                  <td className="px-4 py-3 font-semibold text-gray-900">{it.name || 'Product unavailable'}</td>
                  <td className="px-4 py-3 text-gray-800">{it.qtyOption || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{it.qty}</td>
                  <td className="px-4 py-3 text-right text-gray-900">₹{it.price.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    ₹{(it.qty * it.price).toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Workflow timeline */}
      <div className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
        <h2 className="border-b border-secondary-200 bg-secondary-50 px-5 py-3 text-sm font-extrabold uppercase tracking-wider text-secondary-800">
          Workflow history ({o.workflow.length})
        </h2>
        {o.workflow.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm font-semibold text-secondary-700">
            No workflow events yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="px-4 py-2 text-left font-bold">#</th>
                <th className="px-4 py-2 text-left font-bold">Step</th>
                <th className="px-4 py-2 text-left font-bold">When</th>
              </tr>
            </thead>
            <tbody>
              {o.workflow.map(w => (
                <tr key={w.id} className="border-t border-secondary-100">
                  <td className="px-4 py-2 text-gray-800">{w.id}</td>
                  <td className="px-4 py-2 font-semibold text-gray-900">{w.step}</td>
                  <td className="px-4 py-2 text-gray-700">{w.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Status update */}
      <div className="rounded-xl border border-secondary-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-secondary-800">
          Update status
        </h2>
        <StatusUpdate
          currentStatus={o.status}
          isTerminal={isTerminal}
          nextRole={nextRole}
          onNextRoleChange={setNextRole}
          selectedAgentId={selectedAgentId}
          onAgentChange={setSelectedAgentId}
          agents={agentsQuery.data?.agents ?? []}
          agentsLoading={agentsQuery.isLoading}
          submitting={updateMut.isPending}
          currentAgentId={o.assignedAgent?.workflowUserId ?? 0}
          onApply={() => {
            const currentUpper = (o.status || '').toUpperCase();
            const currentAgent = o.assignedAgent?.workflowUserId ?? 0;
            if (!nextRole) return;
            // Reassignment case: order is already at DELIVERY_AGENT and
            // the operator picked a DIFFERENT agent → allow. Same
            // agent → treat as no-op.
            const isSameStep = nextRole === currentUpper;
            const isReassign =
              isSameStep &&
              nextRole === 'DELIVERY_AGENT' &&
              selectedAgentId > 0 &&
              selectedAgentId !== currentAgent;
            if (isSameStep && !isReassign) return;
            if (nextRole === 'DELIVERY_AGENT' && !selectedAgentId) return;
            setPendingConfirm({ role: nextRole, userId: selectedAgentId });
          }}
          didFail={updateMut.isError}
        />
      </div>

      {pendingConfirm ? (
        <ConfirmStatusModal
          currentStatus={o.status}
          nextRole={pendingConfirm.role}
          agentName={
            pendingConfirm.role === 'DELIVERY_AGENT'
              ? agentsQuery.data?.agents.find(a => a.id === pendingConfirm.userId)?.name
              : undefined
          }
          isReassign={
            pendingConfirm.role === 'DELIVERY_AGENT' &&
            (o.status || '').toUpperCase() === 'DELIVERY_AGENT'
          }
          reason={cancelReason}
          onReasonChange={setCancelReason}
          paymentMethod={o.payment?.method}
          submitting={updateMut.isPending}
          onCancel={() => {
            setPendingConfirm(null);
            setCancelReason('');
          }}
          onConfirm={() => {
            updateMut.mutate({
              ...pendingConfirm,
              reason:
                pendingConfirm.role === 'ORDER_CANCELLED'
                  ? cancelReason
                  : undefined,
            });
            setPendingConfirm(null);
            setCancelReason('');
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Status timeline ──────────────────────────────────────────────
// Horizontal progress bar of the three visible order states. Filled
// circles = done, ringed circle = current, faded circle = pending.
// If the order landed on a failure/cancellation branch, we show the
// happy path in muted grey and stamp a red "Failed" or "Cancelled"
// tile on the right so the operator sees at a glance where things
// went sideways.

type TimelineStep = {
  key: string;
  label: string;
  icon: typeof ClipboardList;
};

const HAPPY_PATH: TimelineStep[] = [
  { key: 'PROCESSING', label: 'Ordered', icon: ClipboardList },
  { key: 'DELIVERY_AGENT', label: 'Out for Delivery', icon: Truck },
  { key: 'DELIVERED', label: 'Delivered', icon: Home },
];

function StatusTimeline({ status }: { status: string }) {
  const upper = (status || '').toUpperCase();
  const isCancelled = upper === 'ORDER_CANCELLED' || upper === 'CANCELLED';
  const isFailed = upper === 'DELIVERY_FAILED';

  // Which happy-path index the order has reached. Anything unknown
  // treated as "PROCESSING" so a fresh order shows step 1 lit.
  let reachedIndex = 0;
  if (upper === 'DELIVERY_AGENT') reachedIndex = 1;
  else if (upper === 'DELIVERED' || upper === 'CLOSED') reachedIndex = 2;

  // Failure branch: dim the whole happy path — the order didn't
  // complete the journey. We still show where it got before falling
  // off (up to and including the last real step it hit).
  let failedAt = -1;
  if (isCancelled || isFailed) {
    // If it never went out for delivery it fell off at "Ordered".
    // If it did go out and then failed, it fell off at "Out for
    // Delivery". This mirrors what actually happens in the DB.
    failedAt = upper === 'DELIVERY_FAILED' ? 1 : 0;
  }

  return (
    <div className="rounded-xl border border-secondary-200 bg-white p-5 shadow-sm">
      <div className="flex items-center">
        {HAPPY_PATH.map((step, idx) => {
          const Icon = step.icon;
          const isLast = idx === HAPPY_PATH.length - 1;
          const reached = reachedIndex >= idx;
          const isCurrent = reachedIndex === idx && !isCancelled && !isFailed;
          const branchedOff = (isCancelled || isFailed) && idx > failedAt;

          const circleCls = branchedOff
            ? 'bg-secondary-100 text-secondary-400 border-secondary-200'
            : reached
            ? 'bg-primary-500 text-white border-primary-500 shadow-md'
            : 'bg-secondary-50 text-secondary-500 border-secondary-200';

          const labelCls = branchedOff
            ? 'text-secondary-500'
            : reached
            ? 'text-primary-700 font-extrabold'
            : 'text-secondary-700';

          const connectorReached = reachedIndex > idx && !branchedOff;
          const connectorCls = connectorReached
            ? 'bg-primary-500'
            : 'border-t-2 border-dashed border-secondary-300 bg-transparent';

          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`relative flex h-14 w-14 items-center justify-center rounded-full border-2 transition-colors ${circleCls}`}
                >
                  <Icon size={22} />
                  {isCurrent ? (
                    <span className="absolute inset-0 animate-ping rounded-full border-2 border-primary-500 opacity-40" />
                  ) : null}
                  {reached && !isCurrent && !branchedOff ? (
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  ) : null}
                </div>
                <div className={`mt-2 text-xs font-bold ${labelCls}`}>
                  {step.label}
                </div>
              </div>
              {isLast ? null : (
                <div className={`mx-2 h-1 flex-1 rounded ${connectorCls}`} />
              )}
            </div>
          );
        })}

        {isCancelled || isFailed ? (
          <>
            <div className="mx-2 h-1 flex-1 border-t-2 border-dashed border-danger" />
            <div className="flex flex-col items-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-danger bg-danger text-white shadow-md">
                {isCancelled ? <Ban size={22} /> : <XCircle size={22} />}
              </div>
              <div className="mt-2 text-xs font-extrabold text-danger">
                {isCancelled ? 'Cancelled' : 'Failed'}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─── Confirm modal ────────────────────────────────────────────────
// Replaces window.confirm(). Same intent — pause on a destructive /
// irreversible-adjacent action — but styled with the rest of the app
// so it doesn't feel like a security prompt.

function ConfirmStatusModal({
  currentStatus,
  nextRole,
  agentName,
  isReassign,
  reason,
  onReasonChange,
  paymentMethod,
  submitting,
  onCancel,
  onConfirm,
}: {
  currentStatus: string;
  nextRole: string;
  agentName?: string;
  isReassign: boolean;
  reason: string;
  onReasonChange: (v: string) => void;
  paymentMethod?: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const from = STEP_LABEL[currentStatus.toUpperCase()] ?? currentStatus;
  const to = STEP_LABEL[nextRole] ?? nextRole;
  const isCancellation = nextRole === 'ORDER_CANCELLED';
  const isFailure = nextRole === 'DELIVERY_FAILED';
  const destructive = isCancellation || isFailure;
  // Reason is required when cancelling — it's captured in the
  // workflow log, sent to the customer via SMS, and used as the
  // Razorpay refund reason. Empty reason disables the confirm.
  const cancelReasonOk = !isCancellation || reason.trim().length > 0;
  const isOnline = (paymentMethod || '').toUpperCase() === 'RAZORPAY';
  const title = isReassign
    ? `Reassign to ${agentName ?? 'the selected agent'}?`
    : `Change status to ${to}?`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2
            className={`flex items-center gap-2 text-lg font-extrabold ${
              destructive ? 'text-danger' : 'text-primary-700'
            }`}
          >
            {destructive ? <AlertTriangle size={18} /> : null}
            {title}
          </h2>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="rounded p-1 text-secondary-800 hover:bg-secondary-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2 text-sm text-gray-800">
          {isReassign ? (
            <p>
              Reassigning this order to <b>{agentName}</b>. No SMS is sent —
              the "Out for Delivery" notification only fires on the first
              transition.
            </p>
          ) : (
            <p>
              Move this order from <b>{from}</b> to <b>{to}</b>.
              {agentName ? (
                <>
                  {' '}
                  Assigning to <b>{agentName}</b>. The customer will get an
                  "Out for Delivery" SMS.
                </>
              ) : null}
            </p>
          )}
          {isCancellation ? (
            <>
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
                Payment will be marked <b>CANCELLED</b>.{' '}
                {isOnline
                  ? 'The Razorpay payment will be fully refunded automatically.'
                  : "The customer won't be charged."}
              </p>
              <div>
                <label className="mb-1 block text-sm font-bold text-gray-800">
                  Reason <span className="text-danger">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => onReasonChange(e.target.value)}
                  className="w-full rounded-lg border-2 border-secondary-200 px-3 py-2 text-sm font-semibold focus:border-primary-500 focus:outline-none"
                  rows={3}
                  placeholder="Why is this order being cancelled? Goes into the workflow log, the SMS, and the refund note."
                  autoFocus
                  disabled={submitting}
                />
              </div>
            </>
          ) : null}
          {isFailure ? (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
              COD payments will be marked <b>FAILED</b>. Only use this when the
              customer couldn't accept the delivery.
            </p>
          ) : null}
          {nextRole === 'DELIVERED' ? (
            <p className="rounded-lg bg-success-soft px-3 py-2 text-xs font-semibold text-success">
              COD payments will be marked <b>COLLECTED</b>. A delivery SMS goes
              out to the customer.
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border-2 border-secondary-300 px-4 py-2 font-bold text-gray-800 hover:bg-secondary-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting || !cancelReasonOk}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 font-bold text-white transition-colors ${
              destructive
                ? 'bg-danger hover:opacity-90'
                : 'bg-primary-500 hover:bg-primary-600'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status update block ──────────────────────────────────────────

function StatusUpdate({
  currentStatus,
  currentAgentId,
  isTerminal,
  nextRole,
  onNextRoleChange,
  selectedAgentId,
  onAgentChange,
  agents,
  agentsLoading,
  submitting,
  onApply,
  didFail,
}: {
  currentStatus: string;
  currentAgentId: number;
  isTerminal: boolean;
  nextRole: string;
  onNextRoleChange: (v: string) => void;
  selectedAgentId: number;
  onAgentChange: (v: number) => void;
  agents: DeliveryAgent[];
  agentsLoading: boolean;
  submitting: boolean;
  onApply: () => void;
  didFail: boolean;
}) {
  const currentUpper = (currentStatus || '').toUpperCase();
  const steps = nextStepsFor(currentUpper);

  if (isTerminal || steps.length === 0) {
    return (
      <p className="text-sm font-semibold text-secondary-800">
        This order is in a terminal state ({STEP_LABEL[currentUpper] ?? currentUpper}).
        Status updates are disabled.
      </p>
    );
  }

  const needsAgent = nextRole === 'DELIVERY_AGENT';
  // Reassignment: order stays on DELIVERY_AGENT but the operator
  // picked a different agent. The Apply button must stay enabled in
  // that case even though the step didn't change.
  const isReassign =
    nextRole === currentUpper &&
    nextRole === 'DELIVERY_AGENT' &&
    selectedAgentId > 0 &&
    selectedAgentId !== currentAgentId;
  const isNoOp = !nextRole || (nextRole === currentUpper && !isReassign);
  const applyDisabled =
    submitting || isNoOp || (needsAgent && selectedAgentId <= 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-bold text-gray-800">Next step</label>
        <select
          value={nextRole}
          onChange={e => {
            onNextRoleChange(e.target.value);
            // Reset the DA pick whenever the operator switches away
            // from "Out for Delivery" — a stale id would ship on
            // Apply otherwise.
            if (e.target.value !== 'DELIVERY_AGENT') onAgentChange(0);
          }}
          className="rounded-lg border-2 border-secondary-200 px-4 py-2 font-semibold focus:border-primary-500 focus:outline-none"
          disabled={submitting}
        >
          {steps.map(s => (
            <option key={s} value={s}>
              {STEP_LABEL[s] ?? s}
              {s === currentUpper ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </div>

      {needsAgent ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1 text-sm font-bold text-gray-800">
            <Truck size={14} /> Delivery agent
          </label>
          <select
            value={selectedAgentId}
            onChange={e => onAgentChange(Number(e.target.value))}
            className="rounded-lg border-2 border-secondary-200 px-4 py-2 font-semibold focus:border-primary-500 focus:outline-none"
            disabled={submitting || agentsLoading}
          >
            <option value={0}>
              {agentsLoading
                ? 'Loading agents…'
                : agents.length === 0
                ? 'No active delivery agents'
                : '— Select an agent —'}
            </option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.phone ? ` · ${a.phone}` : ''}
              </option>
            ))}
          </select>
          {!agentsLoading && agents.length === 0 ? (
            <span className="text-xs font-bold text-danger">
              Add a delivery agent under Support Users before assigning.
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onApply}
          disabled={applyDisabled}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 font-bold text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-secondary-300"
        >
          {submitting ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <Send size={16} />
          )}
          {isReassign ? 'Reassign agent' : 'Apply'}
        </button>
        {didFail ? (
          <span className="inline-flex items-center gap-1 text-sm font-bold text-danger">
            <XCircle size={14} />
            Failed to update.
          </span>
        ) : null}
      </div>
    </div>
  );
}
