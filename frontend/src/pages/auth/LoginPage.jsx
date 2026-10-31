import { Link, useLocation, useNavigate } from 'react-router-dom'
import { homePathFor, useAuth } from '../../auth/useAuth'
import { Alert, FormField } from '../../components/ui'
import { useForm, usePageTitle, useSubmit } from '../../hooks'

export default function LoginPage() {
  usePageTitle('Log in')
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { values, onChange } = useForm({ email: '', password: '' })

  const { submit, submitting, error } = useSubmit(async () => {
    const user = await login(values.email, values.password)
    navigate(location.state?.from?.pathname ?? homePathFor(user), { replace: true })
  })

  return (
    <form onSubmit={submit} className="stack">
      <h1>Log in</h1>
      <Alert>{error?.message}</Alert>
      <FormField label="Email" error={error?.fields.email}>
        <input type="email" name="email" value={values.email} onChange={onChange} required autoFocus />
      </FormField>
      <FormField label="Password" error={error?.fields.password}>
        <input type="password" name="password" value={values.password} onChange={onChange} required />
      </FormField>
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Logging in…' : 'Log in'}
      </button>
      <div className="auth-links">
        <Link to="/forgot-password">Forgot password?</Link>
        <span>
          New here? <Link to="/signup">Create an account</Link>
        </span>
      </div>
    </form>
  )
}
