import { Link, useNavigate } from 'react-router-dom'
import PasswordChecklist from '../../auth/PasswordChecklist'
import { passwordIsValid } from '../../auth/passwordRules'
import { homePathFor, useAuth } from '../../auth/useAuth'
import { Alert, FormField } from '../../components/ui'
import { useForm, useSubmit } from '../../hooks'

export default function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const { values, onChange } = useForm({
    first_name: '',
    last_name: '',
    company_name: '',
    phone: '',
    email: '',
    password: '',
    confirm: '',
  })
  const mismatch = values.confirm && values.confirm !== values.password
  const canSubmit = passwordIsValid(values.password) && values.password === values.confirm

  const { submit, submitting, error } = useSubmit(async () => {
    const { confirm: _confirm, ...payload } = values
    const user = await signup(payload)
    navigate(homePathFor(user), { replace: true })
  })

  return (
    <form onSubmit={submit} className="stack">
      <h1>Create your account</h1>
      <Alert>{error?.message}</Alert>
      <div className="grid-2">
        <FormField label="First name" error={error?.fields.first_name}>
          <input name="first_name" value={values.first_name} onChange={onChange} autoFocus />
        </FormField>
        <FormField label="Last name" error={error?.fields.last_name}>
          <input name="last_name" value={values.last_name} onChange={onChange} />
        </FormField>
      </div>
      <FormField label="Company" error={error?.fields.company_name}>
        <input name="company_name" value={values.company_name} onChange={onChange} />
      </FormField>
      <FormField label="Phone" error={error?.fields.phone}>
        <input name="phone" value={values.phone} onChange={onChange} />
      </FormField>
      <FormField label="Email" error={error?.fields.email}>
        <input type="email" name="email" value={values.email} onChange={onChange} required />
      </FormField>
      <FormField label="Password" error={error?.fields.password}>
        <input type="password" name="password" value={values.password} onChange={onChange} required />
      </FormField>
      <PasswordChecklist password={values.password} />
      <FormField label="Confirm password" error={mismatch ? 'Passwords do not match.' : null}>
        <input type="password" name="confirm" value={values.confirm} onChange={onChange} required />
      </FormField>
      <button type="submit" className="btn btn-primary" disabled={submitting || !canSubmit}>
        {submitting ? 'Creating account…' : 'Create account'}
      </button>
      <div className="auth-links">
        <span>
          Already have an account? <Link to="/login">Log in</Link>
        </span>
      </div>
    </form>
  )
}
