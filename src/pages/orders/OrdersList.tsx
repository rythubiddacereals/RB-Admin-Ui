import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPaymentMethod } from '@/lib/payment';
import { formatWorkflowStatus } from '@/lib/orderStatus';

/**
 * Orders list — wired to GET /api/admin/orders on rb-admin.
 *
 * Client-side search + pagination for now. The backend returns
 * every order sorted most-recent-first; at ~500 orders the payload
 * is trivial. Once we cross a few thousand orders we'll switch to
 * server-side pagination — API is already shaped `{count, orders}`
 * for that.
 */
interface OrderRow {
  id: number;
  date: string;
  /** yyyy-MM-dd in IST — stable key for the "today" filter. */
  dateKey: string;
  customerName: string;
  phone: string;
  total: number;
  workflowStatus: string;
  paymentMode: string;
  paymentStatus: string;
  orderStatus: string;
}

interface OrdersResponse {
  count: number;
  orders: OrderRow[];
}

async function fetchOrders(): Promise<OrdersResponse> {
  const r = await api.get<OrdersResponse>('/api/admin/orders');
  return r.data;
}

const PAGE_SIZE = 25;

/** Mirrors the dashboard API's TERMINAL_STATUSES — "pending" is everything else. */
const TERMINAL_STATUSES = new Set(['DELIVERED', 'DELIVERY_FAILED', 'ORDER_CANCELLED', 'CANCELLED', 'CLOSED']);

/** Today's date as yyyy-MM-dd in IST — matches the API's `dateKey`. */
function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

const successStates = ['DELIVERED', 'COLLECTED', 'VERIFIED', 'CAPTURED', 'COMPLETED', 'CLOSED'];
const dangerStates = ['CANCELLED', 'ORDER_CANCELLED', 'FAILED', 'DELIVERY_FAILED'];

function badgeClass(state: string): string {
  const s = (state ?? '').toUpperCase();
  if (successStates.includes(s)) return 'bg-success-soft text-success';
  if (dangerStates.includes(s)) return 'bg-danger-soft text-danger';
  return 'bg-warning-soft text-warning';
}

export function OrdersListPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'orders'],
    queryFn: fetchOrders,
  });

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  // Filters live in the URL so the dashboard tiles / status rows can
  // deep-link straight to a filtered view (?status=PENDING, ?date=today,
  // ?status=DELIVERED …) and the view is shareable / refresh-safe.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = (searchParams.get('status') ?? '').toUpperCase();
  const todayOnly = searchParams.get('date') === 'today';
  const setStatusParam = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set('status', v); else next.delete('status');
    setSearchParams(next);
    setPage(1);
  };
  const setTodayOnly = (on: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (on) next.set('date', 'today'); else next.delete('date');
    setSearchParams(next);
    setPage(1);
  };

  const statusOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const o of data?.orders ?? []) {
      const s = (o.workflowStatus ?? '').toUpperCase();
      if (s) seen.add(s);
    }
    return Array.from(seen).sort();
  }, [data]);

  const filtered = useMemo(() => {
    let all = data?.orders ?? [];
    if (todayOnly) {
      const t = todayIst();
      all = all.filter(o => o.dateKey === t);
    }
    if (statusParam === 'PENDING') {
      all = all.filter(o => !TERMINAL_STATUSES.has((o.workflowStatus ?? '').toUpperCase()));
    } else if (statusParam) {
      all = all.filter(
        o =>
          (o.workflowStatus ?? '').toUpperCase() === statusParam ||
          (o.orderStatus ?? '').toUpperCase() === statusParam,
      );
    }
    if (!query.trim()) return all;
    const needle = query.trim().toLowerCase();
    // Search the DISPLAYED "Order Status" label (e.g. "Closed") and the
    // payment status too — previously only the raw workflow status was
    // searched, so typing "Closed" matched nothing.
    return all.filter(
      o =>
        String(o.id).includes(needle) ||
        o.customerName.toLowerCase().includes(needle) ||
        o.phone.toLowerCase().includes(needle) ||
        o.workflowStatus.toLowerCase().includes(needle) ||
        (o.orderStatus ?? '').toLowerCase().includes(needle) ||
        (o.paymentStatus ?? '').toLowerCase().includes(needle),
    );
  }, [data, query, statusParam, todayOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  return (
    // flex column that consumes 100% of &lt;main&gt;'s height. Header +
    // toolbar sit at the top, pagination bar sits at the bottom, and
    // the table wrapper in the middle takes the remaining space and
    // scrolls internally. Result: no page-level scroll — only the
    // table body moves.
    <div className="flex h-full flex-col">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-primary-700">Orders</h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading
              ? 'Loading…'
              : isError
              ? 'Failed to load orders.'
              : `${filtered.length} orders${
                  query ? ` matching "${query}"` : ''
                }`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusParam}
            onChange={e => setStatusParam(e.target.value)}
            className="rounded-lg border-2 border-secondary-200 px-3 py-2 font-semibold focus:border-primary-500 focus:outline-none"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending (not yet delivered)</option>
            {statusOptions.map(s => (
              <option key={s} value={s}>{formatWorkflowStatus(s)}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary-800">
            <input
              type="checkbox"
              checked={todayOnly}
              onChange={e => setTodayOnly(e.target.checked)}
              className="h-4 w-4"
            />
            Today only
          </label>
          <input
            type="search"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search id, name, phone, order/payment status…"
            className="w-72 rounded-lg border-2 border-secondary-200 px-4 py-2 font-semibold focus:border-primary-500 focus:outline-none"
          />
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-primary-500 px-3 py-2 text-sm font-bold text-primary-700 transition-colors hover:bg-primary-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-secondary-200 bg-white py-12">
          <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
          <span className="font-semibold text-secondary-800">Loading orders…</span>
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-danger bg-danger-soft px-6 py-8 text-center">
          <p className="font-bold text-danger">Couldn't load orders.</p>
          <p className="mt-1 text-sm text-danger">
            Make sure rb-admin is running on :8081 and you're signed in.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <p className="font-semibold text-secondary-800">
            {query ? `No orders matched "${query}".` : 'No orders yet.'}
          </p>
        </div>
      ) : (
        <>
          {/* Table area consumes remaining vertical space (flex-1 +
              min-h-0 so the child's overflow works). Header stays
              sticky at the top of the scroll container. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-primary-600 text-white shadow-sm">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold">Order ID</th>
                    <th className="px-4 py-3 text-left font-bold">Date</th>
                    <th className="px-4 py-3 text-left font-bold">Customer</th>
                    <th className="px-4 py-3 text-left font-bold">Phone</th>
                    <th className="px-4 py-3 text-right font-bold">Total</th>
                    <th className="px-4 py-3 text-left font-bold">Order Status</th>
                    <th className="px-4 py-3 text-left font-bold">Workflow</th>
                    <th className="px-4 py-3 text-left font-bold">Pay Mode</th>
                    <th className="px-4 py-3 text-left font-bold">Pay Status</th>
                    <th className="px-4 py-3 sticky top-0 bg-primary-600" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map(o => (
                    <tr
                      key={o.id}
                      className="border-t border-secondary-100 transition-colors hover:bg-primary-50"
                    >
                      <td className="px-4 py-3 font-bold text-gray-900">{o.id}</td>
                      <td className="px-4 py-3 text-gray-800">{o.date}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {o.customerName || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-800">{o.phone || '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        ₹{(o.total ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${badgeClass(
                            o.orderStatus,
                          )}`}
                        >
                          {o.orderStatus || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${badgeClass(
                            o.workflowStatus,
                          )}`}
                        >
                          {formatWorkflowStatus(o.workflowStatus)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-accent">
                        {formatPaymentMethod(o.paymentMode)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${badgeClass(
                            o.paymentStatus,
                          )}`}
                        >
                          {['ORDER_CANCELLED', 'CANCELLED'].includes((o.workflowStatus || '').toUpperCase())
                            ? '—'
                            : o.paymentStatus || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/orders/${o.id}`}
                          className="inline-flex items-center gap-1 text-sm font-bold text-primary-700 hover:underline"
                        >
                          Open
                          <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs font-semibold text-secondary-800">
              Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of{' '}
              {filtered.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded-lg border-2 border-primary-500 px-3 py-1.5 text-sm font-bold text-primary-700 transition-colors hover:bg-primary-50 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm font-bold text-gray-800">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-lg border-2 border-primary-500 px-3 py-1.5 text-sm font-bold text-primary-700 transition-colors hover:bg-primary-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
