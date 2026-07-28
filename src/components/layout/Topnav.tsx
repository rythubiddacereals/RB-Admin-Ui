import { LogOut, Menu } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

/**
 * Sticky topnav rendered inside &lt;AdminLayout&gt;.
 *
 * Shows the sidebar toggle (a hamburger) + the signed-in user +
 * logout. The toggle lives here (not inside the sidebar) so it stays
 * reachable even when the sidebar collapses to an icon rail.
 */
export function Topnav({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);

  const displayName = [user?.firstname, user?.lastname]
    .filter(Boolean)
    .join(' ') || user?.username || 'Admin';

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-secondary-200 bg-white px-4 py-3 shadow-sm sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="rounded-lg p-2 text-secondary-800 transition-colors hover:bg-secondary-100 hover:text-primary-700"
        >
          <Menu size={20} />
        </button>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-secondary-700">
            Signed in as
          </div>
          <div className="text-sm font-bold text-gray-900">{displayName}</div>
        </div>
      </div>
      <button
        onClick={logout}
        className="inline-flex items-center gap-2 rounded-lg border border-primary-500 px-3 py-2 text-sm font-bold text-primary-700 transition-colors hover:bg-primary-50"
      >
        <LogOut size={16} />
        Logout
      </button>
    </header>
  );
}
