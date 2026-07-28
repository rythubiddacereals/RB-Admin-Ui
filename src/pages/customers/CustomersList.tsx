import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Phone,
  RefreshCw,
  User,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Customers list — one payload from the backend, client-side filter
 * across name/email/phone (fastest UX for ops looking up a caller).
 *
 * Once we cross a few thousand customers we'll switch to server-side
 * search — the API already returns a flat `{count, customers}` shape
 * so migrating is trivial.
 */

interface CustomerRow {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  isActive: number;
}

interface CustomersResponse {
  count: number;
  customers: CustomerRow[];
}

const PAGE_SIZE = 25;

function fullName(c: CustomerRow): string {
  return [c.firstname, c.lastname].filter(Boolean).join(' ') || '—';
}

export function CustomersListPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'customers'],
    queryFn: async () => {
      const r = await api.get<CustomersResponse>('/api/admin/customers');
      return r.data;
    },
  });

  // Activate / deactivate — same backend method the legacy admin
  // uses (updateCustomerIsActive) behind PATCH /:id/active.
  const toggleMut = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: number }) => {
      const r = await api.patch<CustomerRow>(`/api/admin/customers/${id}/active`, { isActive: next });
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
    },
  });

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const all = data?.customers ?? [];
    if (!query.trim()) return all;
    const needle = query.trim().toLowerCase();
    return all.filter(c => {
      const hay = [
        String(c.id),
        c.firstname,
        c.lastname,
        c.email,
        c.phone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [data, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-primary-700">Customers</h1>
          <p className="text-sm font-semibold text-secondary-800">
            {isLoading
              ? 'Loading…'
              : `${filtered.length} customers${query ? ` matching "${query}"` : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, email, or phone…"
            className="w-80 rounded-lg border-2 border-secondary-200 px-4 py-2 font-semibold focus:border-primary-500 focus:outline-none"
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
          <span className="font-semibold text-secondary-800">Loading customers…</span>
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-danger bg-danger-soft px-6 py-8 text-center">
          <p className="font-bold text-danger">Couldn't load customers.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-secondary-200 bg-white px-6 py-12 text-center">
          <User size={40} className="mx-auto text-secondary-300" />
          <p className="mt-2 font-semibold text-secondary-800">
            {query ? `No customers matched "${query}".` : 'No customers yet.'}
          </p>
        </div>
      ) : (
        <>
          {/* Header stays fixed; only the rows scroll (max-h + sticky).
              no-scrollbar hides the bar while wheel/touch scrolling
              keeps working. */}
          <div className="no-scrollbar max-h-[65vh] overflow-y-auto rounded-xl border border-secondary-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-primary-600 text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-bold">ID</th>
                  <th className="px-4 py-3 text-left font-bold">Name</th>
                  <th className="px-4 py-3 text-left font-bold">Phone</th>
                  <th className="px-4 py-3 text-left font-bold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map(c => (
                  <tr
                    key={c.id}
                    className="border-t border-secondary-100 transition-colors hover:bg-primary-50"
                  >
                    <td className="px-4 py-3 font-bold text-gray-900">{c.id}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {fullName(c)}
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {c.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} className="text-secondary-700" />
                          {c.phone}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.isActive === 1 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">
                          <CheckCircle2 size={12} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-secondary-100 px-3 py-1 text-xs font-bold text-secondary-800">
                          <XCircle size={12} /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          onClick={() => toggleMut.mutate({ id: c.id, next: c.isActive === 1 ? 0 : 1 })}
                          disabled={toggleMut.isPending}
                          className={`text-sm font-bold hover:underline disabled:opacity-50 ${
                            c.isActive === 1 ? 'text-secondary-800' : 'text-success'
                          }`}
                        >
                          {c.isActive === 1 ? 'Deactivate' : 'Activate'}
                        </button>
                        <Link
                          to={`/customers/${c.id}`}
                          className="inline-flex items-center gap-1 text-sm font-bold text-primary-700 hover:underline"
                        >
                          Open <ChevronRight size={14} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
