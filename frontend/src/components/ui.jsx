import { useEffect } from 'react'

export function FormField({ label, error, hint, children }) {
  return (
    <label className={`field${error ? ' has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handleKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Pagination({ page, count, pageSize = 25, onChange }) {
  if (count === 0) return null
  const lastPage = Math.ceil(count / pageSize)
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, count)
  return (
    <div className="pagination">
      <span>
        {from}–{to} of {count}
      </span>
      <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={page >= lastPage}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </div>
  )
}

export function StatusBadge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
