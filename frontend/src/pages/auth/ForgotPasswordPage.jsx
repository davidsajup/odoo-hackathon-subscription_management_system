import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import { Alert, FormField } from '../../components/ui'
import { useSubmit } from '../../hooks'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sentMessage, setSentMessage] = useState(null)

  const { submit, submitting, error } = useSubmit(async () => {
    const response = await api.post('/auth/password-reset/', { email })
    setSentMessage(response.data.detail)
  })

  return (
    <form onSubmit={submit} className="stack">
      <h1>Reset your password</h1>
      <p className="muted">Enter your account email and we&apos;ll send you a link to set a new password.</p>
      <Alert>{error?.message}</Alert>
      <Alert kind="success">{sentMessage}</Alert>
      <FormField label="Email" error={error?.fields.email}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </FormField>
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send reset link'}
      </button>
      <div className="auth-links">
        <Link to="/login">Back to log in</Link>
      </div>
    </form>
  )
}
