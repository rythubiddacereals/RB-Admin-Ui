import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronRight,
  IndianRupee,
  Loader2,
  MapPin,
  Package,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatWorkflowStatus } from '@/lib/orderStatus';
import { isAdmin, useAuthStore } from '@/store/auth';

/**
 * Landing page for back-office users. Delivery agents are redirected
 * elsewhere before they get here (see landingRouteFor), so we don't
 * need to render two variants.
 *
 * Every number comes from a single GET /api/admin/dashboard/stats
 * request — one hop keeps the "first paint" latency low even when
 * the tab has been backgrounded and the token is stale.
 */

interface StatsResponse {
  today: { orderCount: number; revenue: number };
  pending: { count: number; byStatus: Record<string, number> };
  products: { total: number; outOfStock: number };
  customers: { total: number; active: number };
  deliveryCenters: { total: number; active: number };
  recentOrders: {
    id: number;
    date: string;
    customerName: string;
    total: number;
    workflowStatus: string;
    paymentMode: string;
  }[];
}

const successStates = ['DELIVERED', 'COLLECTED', 'CAPTURED', 'COMPLETED', 'CLOSED'];
const dangerStates = ['CANCELLED', 'ORDER_CANCELLED', 'FAILED', 'DELIVERY_FAILED'];

function badgeClass(state?: string): string {
  const s = (state ?? '').toUpperCase();
  if (successStates.includes(s)) return 'bg-success-soft text-success';
  if (dangerStates.includes(s)) return 'bg-danger-soft text-danger';
  return 'bg-warning-soft text-warning';
}

export function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const first = user?.firstname || user?.username || 'there';
  const admin = isAdmin(user);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'dashboard', 'stats'],
    queryFn: async () => {
      const r = await api.get<StatsResponse>('/api/admin/dashboard/stats');
      return r.data;
    },
    // Numbers drift fast during business hours — 30s is a good
    // balance between "always fresh" and "not hammering the API".
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-primary-700">
          Welcome back, {first}
        </h1>
        <p className="mt-1 text-sm font-semibold text-secondary-800">
          {admin
            ? "Here's what's happening today across the store."
            : "Here's your operations snapshot."}
        </p>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-secondary-200 bg-white py-12">
          <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
          <span className="font-semibold text-secondary-800">
            Loading dashboard…
          </span>
        </div>
      ) : isError || !data ? (
        <div className="rounded-xl border border-danger bg-danger-soft px-6 py-8 text-center">
          <p className="font-bold text-danger">
            Couldn't load dashboard stats. Try refreshing the page.
          </p>
        </div>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="Today's orders"
              value={String(data.today.orderCount)}
              icon={<ShoppingCart size={22} />}
              accent="primary"
              href="/orders?date=today"
            />
            <KpiTile
              label="Today's revenue"
              value={`₹${data.today.revenue.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`}
              icon={<IndianRupee size={22} />}
              accent="success"
            />
            <KpiTile
              label="Pending deliveries"
              value={String(data.pending.count)}
              icon={<Truck size={22} />}
              accent={data.pending.count > 10 ? 'warning' : 'primary'}
              href="/orders?status=PENDING"
            />
            <KpiTile
              label="Out of stock"
              value={String(data.products.outOfStock)}
              icon={<AlertTriangle size={22} />}
              accent={data.products.outOfStock > 0 ? 'danger' : 'success'}
              href="/out-of-stock"
            />
          </div>

          {/* Secondary tiles */}
          <div className="grid gap-4 sm:grid-cols-3">
            <SmallTile
              icon={<Users size={18} />}
              label="Customers"
              primary={`${data.customers.total}`}
              secondary={`${data.customers.active} active`}
              href="/customers"
            />
            <SmallTile
              icon={<Package size={18} />}
              label="Products"
              primary={`${data.products.total}`}
              secondary={`${
                data.products.total - data.products.outOfStock
              } in stock`}
              href="/products"
            />
            <SmallTile
              icon={<MapPin size={18} />}
              label="Delivery Centers"
              primary={`${data.deliveryCenters.active}`}
              secondary={`of ${data.deliveryCenters.total} active`}
              href="/delivery-centers"
            />
          </div>

          {/* Recent orders + status breakdown */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between border-b border-secondary-200 bg-secondary-50 px-5 py-3">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-secondary-800">
                  Recent orders
                </h2>
                <Link
                  to="/orders"
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:underline"
                >
                  See all <ChevronRight size={12} />
                </Link>
              </div>
              {data.recentOrders.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm font-semibold text-secondary-700">
                  No orders yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-primary-600 text-white">
                    <tr>
                      <th className="px-4 py-2 text-left font-bold">ID</th>
                      <th className="px-4 py-2 text-left font-bold">Date</th>
                      <th className="px-4 py-2 text-left font-bold">Customer</th>
                      <th className="px-4 py-2 text-left font-bold">Status</th>
                      <th className="px-4 py-2 text-right font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map(o => (
                      <tr
                        key={o.id}
                        className="border-t border-secondary-100 hover:bg-primary-50"
                      >
                        <td className="px-4 py-2 font-bold text-gray-900">
                          <Link
                            to={`/orders/${o.id}`}
                            className="hover:underline"
                          >
                            #{o.id}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-gray-800">{o.date}</td>
                        <td className="px-4 py-2 text-gray-800">
                          {o.customerName || '—'}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-3 py-0.5 text-xs font-bold ${badgeClass(
                              o.workflowStatus,
                            )}`}
                          >
                            {formatWorkflowStatus(o.workflowStatus)}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-gray-900">
                          ₹{(o.total ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
              <div className="border-b border-secondary-200 bg-secondary-50 px-5 py-3">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-secondary-800">
                  Orders by status
                </h2>
              </div>
              <StatusBreakdown byStatus={data.pending.byStatus} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Widgets ──────────────────────────────────────────────────────

type Accent = 'primary' | 'success' | 'warning' | 'danger';

const ACCENT_CLASSES: Record<
  Accent,
  { badge: string; text: string; ring: string }
> = {
  primary: {
    badge: 'bg-primary-50 text-primary-700',
    text: 'text-primary-700',
    ring: 'border-primary-500',
  },
  success: {
    badge: 'bg-success-soft text-success',
    text: 'text-success',
    ring: 'border-success',
  },
  warning: {
    badge: 'bg-warning-soft text-warning',
    text: 'text-warning',
    ring: 'border-warning',
  },
  danger: {
    badge: 'bg-danger-soft text-danger',
    text: 'text-danger',
    ring: 'border-danger',
  },
};

function KpiTile({
  label,
  value,
  icon,
  accent,
  href,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: Accent;
  href?: string;
}) {
  const cls = ACCENT_CLASSES[accent];
  const inner = (
    <div className="flex h-full flex-col justify-between rounded-xl border-l-4 border-secondary-200 bg-white p-4 shadow-sm transition-transform hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-secondary-700">
          {label}
        </span>
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${cls.badge}`}
        >
          {icon}
        </span>
      </div>
      <div className={`mt-3 text-3xl font-extrabold ${cls.text}`}>{value}</div>
    </div>
  );

  if (href) {
    return (
      <Link to={href} className="block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}

function SmallTile({
  icon,
  label,
  primary,
  secondary,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
  href?: string;
}) {
  const inner = (
    <div className="flex items-center gap-3 rounded-xl border border-secondary-200 bg-white p-4 shadow-sm hover:bg-primary-50">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-xs font-bold uppercase tracking-wide text-secondary-700">
          {label}
        </div>
        <div className="text-lg font-extrabold text-gray-900">{primary}</div>
        <div className="text-xs font-semibold text-secondary-700">
          {secondary}
        </div>
      </div>
      {href ? <ChevronRight size={16} className="text-secondary-500" /> : null}
    </div>
  );

  if (href) {
    return <Link to={href}>{inner}</Link>;
  }
  return inner;
}

function StatusBreakdown({ byStatus }: { byStatus: Record<string, number> }) {
  const entries = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);

  if (entries.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm font-semibold text-secondary-700">
        No orders to summarise.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-secondary-100">
      {entries.map(([status, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <li key={status} className="px-4 py-3">
            {/* Each status row deep-links to the orders list filtered to
                that status — previously these were plain text. */}
            <Link
              to={`/orders?status=${encodeURIComponent(status)}`}
              className="mb-1 flex items-center justify-between text-sm hover:opacity-80"
              title={`Show ${status} orders`}
            >
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${badgeClass(
                  status,
                )}`}
              >
                {status}
              </span>
              <span className="font-bold text-gray-900">{count}</span>
            </Link>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary-100">
              <div
                className="h-full rounded-full bg-primary-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
