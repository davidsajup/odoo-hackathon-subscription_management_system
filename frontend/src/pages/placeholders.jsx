import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export function BackofficeHomePage() {
  const { user } = useAuth()
  return (
    <section>
      <h1>Welcome{user.first_name ? `, ${user.first_name}` : ''}</h1>
      <p className="muted">The finance dashboard will appear here once billing is in place.</p>
    </section>
  )
}

export function PortalHomePage() {
  const { user } = useAuth()
  return (
    <section>
      <h1>Welcome{user.first_name ? `, ${user.first_name}` : ''}</h1>
      <p className="muted">Your subscriptions and invoices will appear here.</p>
    </section>
  )
}

export function NotFoundPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card stack">
        <h1>Page not found</h1>
        <Link to="/" className="btn btn-primary">
          Go home
        </Link>
      </div>
    </div>
  )
}
