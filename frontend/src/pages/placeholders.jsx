import { Link } from 'react-router-dom'

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
