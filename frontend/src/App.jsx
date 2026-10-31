import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider'
import { GuestOnly, RequireRole, RootRedirect } from './auth/guards'
import AppLayout from './layouts/AppLayout'
import AuthLayout from './layouts/AuthLayout'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import LoginPage from './pages/auth/LoginPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import SignupPage from './pages/auth/SignupPage'
import UserManagementPage from './pages/backoffice/UserManagementPage'
import InvoiceDetailPage from './pages/billing/InvoiceDetailPage'
import InvoicePrintPage from './pages/billing/InvoicePrintPage'
import InvoicesPage from './pages/billing/InvoicesPage'
import PaymentsPage from './pages/billing/PaymentsPage'
import PortalInvoicesPage from './pages/portal/PortalInvoicesPage'
import AttributesPage from './pages/catalog/AttributesPage'
import DiscountsPage from './pages/catalog/DiscountsPage'
import PlansPage from './pages/catalog/PlansPage'
import ProductDetailPage from './pages/catalog/ProductDetailPage'
import ProductsPage from './pages/catalog/ProductsPage'
import TaxesPage from './pages/catalog/TaxesPage'
import PortalSubscriptionsPage from './pages/portal/PortalSubscriptionsPage'
import SubscriptionDetailPage from './pages/subscriptions/SubscriptionDetailPage'
import { EditSubscriptionPage, NewSubscriptionPage } from './pages/subscriptions/SubscriptionFormPage'
import SubscriptionsPage from './pages/subscriptions/SubscriptionsPage'
import TemplatesPage from './pages/subscriptions/TemplatesPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import { NotFoundPage } from './pages/placeholders'
import PortalHomePage from './pages/portal/PortalHomePage'
import ProfilePage from './pages/ProfilePage'

const BACKOFFICE_NAV = [
  { to: '/app', label: 'Dashboard', end: true },
  { heading: 'Sales' },
  { to: '/app/subscriptions', label: 'Subscriptions' },
  { to: '/app/templates', label: 'Quotation templates' },
  { to: '/app/customers', label: 'Customers' },
  { heading: 'Billing' },
  { to: '/app/invoices', label: 'Invoices' },
  { to: '/app/payments', label: 'Payments' },
  { heading: 'Catalog' },
  { to: '/app/products', label: 'Products' },
  { to: '/app/attributes', label: 'Attributes' },
  { to: '/app/plans', label: 'Plans' },
  { to: '/app/discounts', label: 'Discounts' },
  { to: '/app/taxes', label: 'Taxes' },
  { heading: 'Settings' },
  { to: '/app/staff', label: 'Staff', roles: ['admin'] },
  { to: '/app/profile', label: 'My profile' },
]

const PORTAL_NAV = [
  { to: '/portal', label: 'Overview', end: true },
  { to: '/portal/subscriptions', label: 'My subscriptions' },
  { to: '/portal/invoices', label: 'My invoices' },
  { to: '/portal/profile', label: 'My profile' },
]

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            element={
              <GuestOnly>
                <AuthLayout />
              </GuestOnly>
            }
          >
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>
          <Route element={<AuthLayout />}>
            <Route path="/reset-password/:uid/:token" element={<ResetPasswordPage />} />
          </Route>

          <Route
            path="/app"
            element={
              <RequireRole roles={['admin', 'staff']}>
                <AppLayout navItems={BACKOFFICE_NAV} variant="backoffice" />
              </RequireRole>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route
              path="customers"
              element={<UserManagementPage key="customers" endpoint="/users/customers/" title="Customers" noun="customer" />}
            />
            <Route
              path="staff"
              element={
                <RequireRole roles={['admin']}>
                  <UserManagementPage key="staff" endpoint="/users/staff/" title="Staff" noun="staff member" />
                </RequireRole>
              }
            />
            <Route path="subscriptions" element={<SubscriptionsPage />} />
            <Route path="subscriptions/new" element={<NewSubscriptionPage />} />
            <Route path="subscriptions/:id" element={<SubscriptionDetailPage key="backoffice" />} />
            <Route path="subscriptions/:id/edit" element={<EditSubscriptionPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="invoices/:id" element={<InvoiceDetailPage key="backoffice" />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="products/:id" element={<ProductDetailPage />} />
            <Route path="attributes" element={<AttributesPage />} />
            <Route path="plans" element={<PlansPage />} />
            <Route path="discounts" element={<DiscountsPage />} />
            <Route path="taxes" element={<TaxesPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          <Route
            path="/portal"
            element={
              <RequireRole roles={['customer']}>
                <AppLayout navItems={PORTAL_NAV} variant="portal" />
              </RequireRole>
            }
          >
            <Route index element={<PortalHomePage />} />
            <Route path="subscriptions" element={<PortalSubscriptionsPage />} />
            <Route path="subscriptions/:id" element={<SubscriptionDetailPage key="portal" portal />} />
            <Route path="invoices" element={<PortalInvoicesPage />} />
            <Route path="invoices/:id" element={<InvoiceDetailPage key="portal" portal />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          <Route
            path="/print/invoices/:id"
            element={
              <RequireRole>
                <InvoicePrintPage />
              </RequireRole>
            }
          />
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
