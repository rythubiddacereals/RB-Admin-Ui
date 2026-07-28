import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Loader2,
  Mail,
  MapPin,
  Phone,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatPaymentMethod } from '@/lib/payment';
import { formatWorkflowStatus } from '@/lib/orderStatus';

interface Address {
  id: number;
  firstname: string;
  lastname: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postcode: string;
  telephone: string;
  email: string;
  shippingOrBilling: string;
}

interface CustomerOrder {
  id: number;
  date: string;
  status: string;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
}

interface CustomerDetail {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  isActive: number;
  newsLetter: number;
  createdAt: string;
  updatedAt: string;
  addresses: Address[];
  orders: CustomerOrder[];
}

const successStates = ['DELIVERED', 'COLLECTED', 'VERIFIED', 'CAPTURED', 'COMPLETED', 'CLOSED'];
const dangerStates = ['CANCELLED', 'ORDER_CANCELLED', 'FAILED', 'DELIVERY_FAILED'];

function badgeClass(state?: string): string {
  const s = (state ?? '').toUpperCase();
  if (successStates.includes(s)) return 'bg-success-soft text-success';
  if (dangerStates.includes(s)) return 'bg-danger-soft text-danger';
  return 'bg-warning-soft text-warning';
}

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const id = Number(customerId);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'customer', id],
    queryFn: async () => {
      const r = await api.get<CustomerDetail>(`/api/admin/customers/${id}`);
      return r.data;
    },
    enabled: Number.isFinite(id) && id > 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="mr-2 animate-spin text-primary-500" size={20} />
        <span className="font-semibold text-secondary-800">Loading customer…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-danger bg-danger-soft p-6">
        <p className="font-bold text-danger">Couldn't load customer #{id}.</p>
      </div>
    );
  }

  const c = data;
  const fullName = [c.firstname, c.lastname].filter(Boolean).join(' ') || 'Unnamed customer';
  const totalSpent = c.orders.reduce((s, o) => s + (o.total || 0), 0);

  return (
    <div className="space-y-6">
      <Link
        to="/customers"
        className="inline-flex items-center gap-1 text-sm font-bold text-primary-700 hover:underline"
      >
        <ArrowLeft size={14} /> Back to customers
      </Link>

      {/* Profile card */}
      <div className="rounded-xl border border-secondary-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-500 text-2xl font-extrabold text-white">
            {(c.firstname || c.email || '?')[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold text-primary-700">
                {fullName}
              </h1>
              {c.isActive === 1 ? (
                <span className="rounded-full bg-success-soft px-3 py-0.5 text-xs font-bold text-success">
                  Active
                </span>
              ) : (
                <span className="rounded-full bg-secondary-100 px-3 py-0.5 text-xs font-bold text-secondary-800">
                  Inactive
                </span>
              )}
            </div>
            <div className="mt-1 text-sm font-semibold text-secondary-800">
              Customer #{c.id}
            </div>
            <div className="mt-3 grid gap-2 text-sm text-gray-800 sm:grid-cols-2">
              {c.email ? (
                <div className="inline-flex items-center gap-2">
                  <Mail size={14} className="text-secondary-700" />
                  {c.email}
                </div>
              ) : null}
              {c.phone ? (
                <div className="inline-flex items-center gap-2">
                  <Phone size={14} className="text-secondary-700" />
                  {c.phone}
                </div>
              ) : null}
              {c.createdAt ? (
                <div className="inline-flex items-center gap-2">
                  <Calendar size={14} className="text-secondary-700" />
                  Joined {c.createdAt}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 border-t border-secondary-200 pt-4 text-sm sm:grid-cols-3">
          <StatTile label="Orders" value={String(c.orders.length)} />
          <StatTile label="Total spent" value={`₹${totalSpent.toFixed(2)}`} />
          <StatTile label="Addresses" value={String(c.addresses.length)} />
        </div>
      </div>

      {/* Addresses */}
      <div className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
        <h2 className="border-b border-secondary-200 bg-secondary-50 px-5 py-3 text-sm font-extrabold uppercase tracking-wider text-secondary-800">
          <MapPin size={14} className="mr-1 inline" /> Addresses ({c.addresses.length})
        </h2>
        {c.addresses.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm font-semibold text-secondary-700">
            No addresses on file.
          </p>
        ) : (
          <div className="divide-y divide-secondary-100">
            {c.addresses.map(a => (
              <div key={a.id} className="flex items-start justify-between gap-4 p-4">
                <div>
                  <div className="font-bold text-gray-900">
                    {[a.firstname, a.lastname].filter(Boolean).join(' ') || '—'}
                  </div>
                  <div className="mt-1 text-sm text-gray-800">
                    {[a.line1, a.line2, a.city, a.state, a.postcode]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </div>
                  {a.telephone ? (
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-secondary-700">
                      <Phone size={11} /> {a.telephone}
                    </div>
                  ) : null}
                </div>
                {a.shippingOrBilling ? (
                  <span className="rounded-full bg-primary-50 px-2 py-1 text-[10px] font-extrabold uppercase text-primary-700">
                    {a.shippingOrBilling}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Orders */}
      <div className="overflow-hidden rounded-xl border border-secondary-200 bg-white shadow-sm">
        <h2 className="border-b border-secondary-200 bg-secondary-50 px-5 py-3 text-sm font-extrabold uppercase tracking-wider text-secondary-800">
          Orders ({c.orders.length})
        </h2>
        {c.orders.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm font-semibold text-secondary-700">
            No orders yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="px-4 py-2 text-left font-bold">ID</th>
                <th className="px-4 py-2 text-left font-bold">Date</th>
                <th className="px-4 py-2 text-left font-bold">Status</th>
                <th className="px-4 py-2 text-left font-bold">Payment</th>
                <th className="px-4 py-2 text-right font-bold">Total</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {c.orders.map(o => (
                <tr key={o.id} className="border-t border-secondary-100">
                  <td className="px-4 py-3 font-bold text-gray-900">{o.id}</td>
                  <td className="px-4 py-3 text-gray-800">{o.date}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${badgeClass(o.status)}`}>
                      {formatWorkflowStatus(o.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-800">
                    <span className="font-bold text-accent">
                      {formatPaymentMethod(o.paymentMethod)}
                    </span>
                    {o.paymentStatus ? (
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeClass(
                          o.paymentStatus,
                        )}`}
                      >
                        {o.paymentStatus}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    ₹{(o.total ?? 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/orders/${o.id}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:underline"
                    >
                      Open <ChevronRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-secondary-200 bg-secondary-50 px-4 py-3">
      <div className="text-xs font-bold uppercase tracking-wide text-secondary-700">
        {label}
      </div>
      <div className="mt-1 text-lg font-extrabold text-primary-700">{value}</div>
    </div>
  );
}
