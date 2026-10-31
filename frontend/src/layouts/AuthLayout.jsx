import { Outlet } from 'react-router-dom'

export default function AuthLayout() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand brand-center">
          <span className="brand-mark">B</span> Brightloop
        </div>
        <Outlet />
      </div>
    </div>
  )
}
