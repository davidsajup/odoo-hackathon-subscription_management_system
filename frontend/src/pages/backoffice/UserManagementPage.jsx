import { useCallback, useEffect, useState } from 'react'
import api from '../../api/client'
import { Alert, FormField, Modal, Pagination, StatusBadge } from '../../components/ui'
import { useDebouncedValue, useForm, useSubmit } from '../../hooks'

const EMPTY_USER = { email: '', first_name: '', last_name: '', company_name: '', phone: '', address: '' }

function UserFormModal({ endpoint, noun, user, onClose, onSaved }) {
  const isNew = !user.id
  const { values, onChange } = useForm({ ...EMPTY_USER, ...user })

  const { submit, submitting, error } = useSubmit(async () => {
    const fields = Object.fromEntries(Object.keys(EMPTY_USER).map((key) => [key, values[key] ?? '']))
    if (isNew) await api.post(endpoint, fields)
    else await api.patch(`${endpoint}${user.id}/`, fields)
    onSaved()
  })

  return (
    <Modal title={isNew ? `Add ${noun}` : `Edit ${noun}`} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Alert>{error?.message}</Alert>
        <FormField label="Email" error={error?.fields.email}>
          <input type="email" name="email" value={values.email} onChange={onChange} required autoFocus />
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
          <textarea name="address" rows={2} value={values.address} onChange={onChange} />
        </FormField>
        {isNew && <p className="muted">They&apos;ll get an email with a link to set their own password.</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function UserManagementPage({ endpoint, title, noun }) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [data, setData] = useState({ key: null, results: [], count: 0, error: null })
  const [editing, setEditing] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const debouncedSearch = useDebouncedValue(search)
  const queryKey = JSON.stringify([page, debouncedSearch, activeFilter, reloadKey])
  const loading = data.key !== queryKey

  useEffect(() => {
    let cancelled = false
    api
      .get(endpoint, { params: { page, search: debouncedSearch || undefined, is_active: activeFilter || undefined } })
      .then((response) => {
        if (!cancelled) setData({ key: queryKey, ...response.data, error: null })
      })
      .catch(() => {
        if (!cancelled) setData((current) => ({ ...current, key: queryKey, error: `Could not load ${title.toLowerCase()}.` }))
      })
    return () => {
      cancelled = true
    }
  }, [endpoint, title, page, debouncedSearch, activeFilter, queryKey])

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])
  const closeModal = useCallback(() => setEditing(null), [])

  const toggleActive = async (user) => {
    await api.patch(`${endpoint}${user.id}/`, { is_active: !user.is_active })
    reload()
  }

  return (
    <section>
      <div className="page-header">
        <h1>{title}</h1>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(EMPTY_USER)}>
          Add {noun}
        </button>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search name, email or company"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
        <select
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      <Alert>{data.error}</Alert>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Company</th>
              <th>Phone</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {data.results.map((user) => (
              <tr key={user.id}>
                <td>{[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}</td>
                <td>{user.email}</td>
                <td>{user.company_name || '—'}</td>
                <td>{user.phone || '—'}</td>
                <td>
                  <StatusBadge tone={user.is_active ? 'success' : 'neutral'}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </StatusBadge>
                </td>
                <td className="row-actions">
                  <button type="button" className="btn btn-link" onClick={() => setEditing(user)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-link" onClick={() => toggleActive(user)}>
                    {user.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && data.results.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No {title.toLowerCase()} found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} count={data.count} onChange={setPage} />

      {editing && (
        <UserFormModal
          endpoint={endpoint}
          noun={noun}
          user={editing}
          onClose={closeModal}
          onSaved={() => {
            closeModal()
            reload()
          }}
        />
      )}
    </section>
  )
}
