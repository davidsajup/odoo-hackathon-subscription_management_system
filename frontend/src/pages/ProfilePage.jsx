import { useState } from 'react'
import api from '../api/client'
import { useAuth } from '../auth/useAuth'
import { Alert, FormField } from '../components/ui'
import { useForm, useSubmit } from '../hooks'

export default function ProfilePage() {
  const { user, setUser } = useAuth()
  const [saved, setSaved] = useState(false)
  const { values, onChange } = useForm({
    first_name: user.first_name,
    last_name: user.last_name,
    company_name: user.company_name,
    phone: user.phone,
    address: user.address,
  })

  const { submit, submitting, error } = useSubmit(async () => {
    setSaved(false)
    const response = await api.patch('/auth/me/', values)
    setUser(response.data)
    setSaved(true)
  })

  return (
    <section className="narrow">
      <h1>My profile</h1>
      <form onSubmit={submit} className="stack card">
        <Alert>{error?.message}</Alert>
        <Alert kind="success">{saved && 'Profile saved.'}</Alert>
        <FormField label="Email" hint="Contact support to change your login email.">
          <input value={user.email} disabled />
        </FormField>
        <div className="grid-2">
          <FormField label="First name" error={error?.fields.first_name}>
            <input name="first_name" value={values.first_name} onChange={onChange} />
          </FormField>
          <FormField label="Last name" error={error?.fields.last_name}>
            <input name="last_name" value={values.last_name} onChange={onChange} />
          </FormField>
        </div>
        <div className="grid-2">
          <FormField label="Company" error={error?.fields.company_name}>
            <input name="company_name" value={values.company_name} onChange={onChange} />
          </FormField>
          <FormField label="Phone" error={error?.fields.phone}>
            <input name="phone" value={values.phone} onChange={onChange} />
          </FormField>
        </div>
        <FormField label="Address" error={error?.fields.address}>
          <textarea name="address" rows={3} value={values.address} onChange={onChange} />
        </FormField>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </section>
  )
}
