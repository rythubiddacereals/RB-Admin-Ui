import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { LoginPage } from '@/pages/Login';
import { OrdersListPage } from '@/pages/orders/OrdersList';
import { OrderWorkflowPage } from '@/pages/orders/OrderWorkflow';
import { ProductsListPage } from '@/pages/products/ProductsList';
import { ProductDetailPage } from '@/pages/products/ProductDetail';
import { ProductFormPage } from '@/pages/products/ProductForm';
import {
  BEST_SELLERS,
  NEW_ARRIVALS,
  OUT_OF_STOCK,
  ProductFlagListPage,
} from '@/pages/products/ProductFlagList';
import { CategoriesPage } from '@/pages/categories/CategoriesPage';
import { CustomersListPage } from '@/pages/customers/CustomersList';
import { CustomerDetailPage } from '@/pages/customers/CustomerDetail';
import { DeliveryCentersPage } from '@/pages/delivery/DeliveryCentersPage';
import { ShippingRulesPage } from '@/pages/shipping/ShippingRulesPage';
import { MyDeliveriesPage } from '@/pages/deliveries/MyDeliveriesPage';
import { QuantityOptionsPage } from '@/pages/quantityoptions/QuantityOptionsPage';
import { SupportUsersPage } from '@/pages/supportusers/SupportUsersPage';
import { BannersPage } from '@/pages/content/BannersPage';
import { FarmersPage } from '@/pages/farmers/FarmersPage';
import { TodaysDealsPage } from '@/pages/todaysdeals/TodaysDealsPage';
import { ReviewsPage } from '@/pages/reviews/ReviewsPage';
import { GalleryPage } from '@/pages/gallery/GalleryPage';
import { VideosPage } from '@/pages/videos/VideosPage';
import { BulkImportPage } from '@/pages/bulkimport/BulkImportPage';
import { DashboardPage } from '@/pages/Dashboard';
import { landingRouteFor, useAuthStore } from '@/store/auth';

/**
 * Role-aware landing for `/`: a delivery-agent-only login never sees
 * the back-office Dashboard — they're bounced straight to their
 * My Deliveries queue (same rule landingRouteFor applies at login).
 */
function IndexRoute() {
  const user = useAuthStore(s => s.user);
  const landing = landingRouteFor(user);
  if (landing !== '/') return <Navigate to={landing} replace />;
  return <DashboardPage />;
}

/**
 * Route map for rb-admin-react.
 *
 * Public routes:
 *   /login          — admin sign-in
 *
 * Protected routes (wrapped in <ProtectedRoute> so unauthenticated
 * users get bounced to /login, and mounted inside <AdminLayout> so
 * they share the sidebar + topnav shell without each page importing
 * them):
 *   /               — dashboard (default landing)
 *   /orders         — orders list
 *   /orders/:id     — order workflow (status update, payment sync)
 *
 * Everything else 404s to the dashboard so a wrong bookmark never
 * dead-ends the operator.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<IndexRoute />} />
        <Route path="orders" element={<OrdersListPage />} />
        <Route path="orders/:orderId" element={<OrderWorkflowPage />} />
        <Route path="products" element={<ProductsListPage />} />
        <Route path="products/new" element={<ProductFormPage />} />
        <Route path="products/:productId/edit" element={<ProductFormPage />} />
        <Route path="products/:productId" element={<ProductDetailPage />} />
        <Route path="best-sellers" element={<ProductFlagListPage preset={BEST_SELLERS} />} />
        <Route path="new-arrivals" element={<ProductFlagListPage preset={NEW_ARRIVALS} />} />
        <Route path="out-of-stock" element={<ProductFlagListPage preset={OUT_OF_STOCK} />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="customers" element={<CustomersListPage />} />
        <Route path="customers/:customerId" element={<CustomerDetailPage />} />
        <Route path="delivery-centers" element={<DeliveryCentersPage />} />
        <Route path="shipping-rules" element={<ShippingRulesPage />} />
        <Route path="deliveries" element={<MyDeliveriesPage />} />
        <Route path="quantity-options" element={<QuantityOptionsPage />} />
        <Route path="support-users" element={<SupportUsersPage />} />
        <Route path="banners" element={<BannersPage />} />
        <Route path="farmers" element={<FarmersPage />} />
        <Route path="todays-deals" element={<TodaysDealsPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="gallery" element={<GalleryPage />} />
        <Route path="videos" element={<VideosPage />} />
        <Route path="bulk-import" element={<BulkImportPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
