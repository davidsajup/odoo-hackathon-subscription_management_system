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
import { BackofficeHomePage, NotFoundPage, PortalHomePage } from './pages/placeholders'
import ProfilePage from './pages/ProfilePage'

const BACKOFFICE_NAV = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/customers', label: 'Customers' },
  { to: '/app/staff', label: 'Staff', roles: ['admin'] },
  { to: '/app/profile', label: 'My profile' },
]

const PORTAL_NAV = [
  { to: '/portal', label: 'Overview', end: true },
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
            <Route index element={<BackofficeHomePage />} />
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
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
