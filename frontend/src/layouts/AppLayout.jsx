import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

const ROLE_LABELS = { admin: 'Admin', staff: 'Internal Staff', customer: 'Customer' }

export default function AppLayout({ navItems, variant }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const visibleItems = navItems.filter((item) => !item.roles || item.roles.includes(user.role))
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={`app-shell app-${variant}`}>
      <a
        href="#main"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main')?.focus()
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">B</span> Brightloop
        </div>
        <nav>
          {visibleItems.map((item) =>
            item.heading ? (
              <span key={item.heading} className="nav-heading">
                {item.heading}
              </span>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="user-chip">
            <span className="user-name">{displayName}</span>
            <span className="user-role">{ROLE_LABELS[user.role]}</span>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
            Log out
          </button>
        </header>
        <main id="main" tabIndex={-1} className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
