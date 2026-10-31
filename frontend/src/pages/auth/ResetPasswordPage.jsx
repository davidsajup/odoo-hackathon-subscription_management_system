import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../../api/client'
import PasswordChecklist from '../../auth/PasswordChecklist'
import { passwordIsValid } from '../../auth/passwordRules'
import { Alert, FormField } from '../../components/ui'
import { useForm, usePageTitle, useSubmit } from '../../hooks'

export default function ResetPasswordPage() {
  usePageTitle('Set a new password')
  const { uid, token } = useParams()
  const { values, onChange } = useForm({ password: '', confirm: '' })
  const [doneMessage, setDoneMessage] = useState(null)
  const mismatch = values.confirm && values.confirm !== values.password
  const canSubmit = passwordIsValid(values.password) && values.password === values.confirm

  const { submit, submitting, error } = useSubmit(async () => {
    const response = await api.post('/auth/password-reset/confirm/', { uid, token, password: values.password })
    setDoneMessage(response.data.detail)
  })

  if (doneMessage) {
    return (
      <div className="stack">
        <h1>Password updated</h1>
        <Alert kind="success">{doneMessage}</Alert>
        <Link to="/login" className="btn btn-primary">
          Go to log in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="stack">
      <h1>Set a new password</h1>
      <Alert>{error?.message}</Alert>
      <FormField label="New password" error={error?.fields.password}>
        <input type="password" name="password" value={values.password} onChange={onChange} required autoFocus />
      </FormField>
      <PasswordChecklist password={values.password} />
      <FormField label="Confirm password" error={mismatch ? 'Passwords do not match.' : null}>
        <input type="password" name="confirm" value={values.confirm} onChange={onChange} required />
      </FormField>
      <button type="submit" className="btn btn-primary" disabled={submitting || !canSubmit}>
        {submitting ? 'Saving…' : 'Save password'}
      </button>
      <div className="auth-links">
        <Link to="/forgot-password">Request a new link</Link>
      </div>
    </form>
  )
}
