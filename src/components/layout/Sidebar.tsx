import { NavLink } from 'react-router-dom';
import {
  Award,
  Boxes,
  EyeOff,
  Flag,
  FolderTree,
  Image,
  ImagePlus,
  Instagram,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Package,
  PackageX,
  Route,
  Shield,
  ShoppingCart,
  Sparkles,
  Sprout,
  Timer,
  Ticket,
  Truck,
  Upload,
  Users,
  Video,
} from 'lucide-react';
import clsx from 'clsx';
import {
  isAdmin,
  isDeliveryAgent,
  useAuthStore,
  type AdminUser,
} from '@/store/auth';

/**
 * Left-hand navigation.
 *
 * Groups are ordered by daily-use frequency (Orders first — that's
 * what back-office ops opens 20× a day). Each item declares which
 * roles may see it via `visibleTo(user)`. The rules:
 *
 *   • ADMIN sees the back-office pages but NOT "My Deliveries" —
 *     delivery agents have their own separate login and the queue
 *     only makes sense for the agent it belongs to.
 *   • DELIVERY_AGENT with no admin role sees only Dashboard + My
 *     Deliveries — the rest of the surface is management-only and
 *     would just be noise on a phone.
 *   • Anyone else (store manager, regional head) sees the back-
 *     office pages but not My Deliveries (they don't have a queue).
 */
type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  visibleTo: (u: AdminUser | null) => boolean;
};

const isDaOnly = (u: AdminUser | null) => isDeliveryAgent(u) && !isAdmin(u);
const isBackOffice = (u: AdminUser | null) => !isDaOnly(u);

const NAV_ITEMS: NavItem[] = [
  // Dashboard is a back-office view — a delivery-agent login goes
  // straight to (and only sees) My Deliveries.
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, visibleTo: isBackOffice },
  { to: '/orders', label: 'Orders', icon: ShoppingCart, visibleTo: isBackOffice },
  { to: '/products', label: 'Products', icon: Package, visibleTo: isBackOffice },
  { to: '/best-sellers', label: 'Best Sellers', icon: Award, visibleTo: isBackOffice },
  { to: '/new-arrivals', label: 'New Arrivals', icon: Sparkles, visibleTo: isBackOffice },
  { to: '/out-of-stock', label: 'Out of Stock', icon: PackageX, visibleTo: isBackOffice },
  { to: '/hidden-products', label: 'Hidden Products', icon: EyeOff, visibleTo: isBackOffice },
  { to: '/reviews', label: 'Reviews', icon: MessageSquare, visibleTo: isBackOffice },
  { to: '/categories', label: 'Categories', icon: FolderTree, visibleTo: isBackOffice },
  { to: '/customers', label: 'Customers', icon: Users, visibleTo: isBackOffice },
  { to: '/coupons', label: 'Coupons', icon: Ticket, visibleTo: isBackOffice },
  { to: '/delivery-centers', label: 'Delivery Centers', icon: MapPin, visibleTo: isBackOffice },
  { to: '/shipping-rules', label: 'Shipping Rules', icon: Route, visibleTo: isBackOffice },
  { to: '/quantity-options', label: 'Quantity Options', icon: Boxes, visibleTo: isBackOffice },
  { to: '/banners', label: 'Banners', icon: Flag, visibleTo: isBackOffice },
  { to: '/instagram-reels', label: 'Instagram Reels', icon: Instagram, visibleTo: isBackOffice },
  { to: '/farmers', label: 'Farmers', icon: Sprout, visibleTo: isBackOffice },
  { to: '/todays-deals', label: "Today's Deals", icon: Timer, visibleTo: isBackOffice },
  { to: '/gallery', label: 'Gallery', icon: Image, visibleTo: isBackOffice },
  { to: '/videos', label: 'Videos', icon: Video, visibleTo: isBackOffice },
  { to: '/bulk-import', label: 'Bulk Import', icon: Upload, end: true, visibleTo: isBackOffice },
  { to: '/bulk-import/images', label: 'Attach Images', icon: ImagePlus, visibleTo: isBackOffice },
  { to: '/support-users', label: 'Support Users', icon: Shield, visibleTo: isAdmin },
  { to: '/deliveries', label: 'My Deliveries', icon: Truck, visibleTo: isDeliveryAgent },
];

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const user = useAuthStore(s => s.user);
  const visibleItems = NAV_ITEMS.filter(item => item.visibleTo(user));
  return (
    <aside
      className={clsx(
        'hidden flex-shrink-0 border-r border-secondary-200 bg-white transition-[width] duration-200 ease-out lg:flex lg:flex-col',
        collapsed ? 'w-[68px]' : 'w-64',
      )}
    >
      <div
        className={clsx(
          'flex items-center border-b border-secondary-200 py-4',
          collapsed ? 'justify-center px-2' : 'gap-3 px-5',
        )}
      >
        {/* Public asset — /logo.svg is served from rb-admin-react/public.
            Fallback to the "RB" pill if the file 404s (e.g. dev clone
            without the asset copied in yet). */}
        <img
          src="/logo.gif"
          alt="Rythu Bidda"
          className={collapsed ? 'h-8 w-8 object-contain' : 'h-9 w-auto object-contain'}
          onError={e => {
            const el = e.currentTarget as HTMLImageElement;
            el.style.display = 'none';
            const fallback = el.nextSibling as HTMLElement | null;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
        <div
          className="hidden h-9 w-9 items-center justify-center rounded-lg bg-primary-500 font-extrabold text-white"
          aria-hidden="true"
        >
          RB
        </div>
        {collapsed ? null : (
          <div className="leading-tight">
            <div className="text-xs font-semibold text-secondary-700">Admin</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <ul className="space-y-1">
          {visibleItems.map(item => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center rounded-lg text-sm font-semibold transition-colors',
                      collapsed
                        ? 'justify-center px-2 py-2.5'
                        : 'gap-3 px-3 py-2',
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-700 hover:bg-secondary-100',
                    )
                  }
                >
                  <Icon size={18} />
                  {collapsed ? null : <span>{item.label}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
