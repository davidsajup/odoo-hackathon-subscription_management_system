import api from '../api/client'
import { useForm, useSubmit } from '../hooks'
import { Alert, Modal } from './ui'

export default function ResourceFormModal({
  endpoint,
  noun,
  item,
  defaults,
  toPayload = (values) => Object.fromEntries(Object.keys(defaults).map((key) => [key, values[key]])),
  onClose,
  onSaved,
  children,
}) {
  const isNew = !item.id
  const { values, setValues, onChange } = useForm({ ...defaults, ...item })

  const { submit, submitting, error } = useSubmit(async () => {
    const payload = toPayload(values)
    const response = isNew ? await api.post(endpoint, payload) : await api.patch(`${endpoint}${item.id}/`, payload)
    onSaved(response.data)
  })

  return (
    <Modal title={isNew ? `Add ${noun}` : `Edit ${noun}`} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Alert>{error?.message}</Alert>
        {children({ values, setValues, onChange, errors: error?.fields ?? {} })}
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

export function CheckboxList({ options, selected, onChange, labelFor = (option) => option.name }) {
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id])
  if (options.length === 0) return <p className="muted">Nothing to choose from yet.</p>
  return (
    <div className="checkbox-list">
      {options.map((option) => (
        <label key={option.id} className="checkbox">
          <input type="checkbox" checked={selected.includes(option.id)} onChange={() => toggle(option.id)} />
          {labelFor(option)}
        </label>
      ))}
    </div>
  )
}
