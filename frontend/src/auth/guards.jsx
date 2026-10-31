import { Navigate, useLocation } from 'react-router-dom'
import { homePathFor, useAuth } from './useAuth'

function Loading() {
  return <div className="page-loading">Loading…</div>
}

export function RequireRole({ roles, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user)} replace />
  return children
}

export function GuestOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (user) return <Navigate to={homePathFor(user)} replace />
  return children
}

export function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  return <Navigate to={user ? homePathFor(user) : '/login'} replace />
}
