import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ title, onClose, children }) {
  const dialogRef = useRef(null)
  const [opener] = useState(() => document.activeElement)

  useEffect(() => {
    const handleKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog.contains(document.activeElement)) {
      const first = dialog.querySelector('input, select, textarea') ?? dialog.querySelector(FOCUSABLE)
      first?.focus()
    }
    return () => {
      if (opener?.isConnected && opener !== document.body) opener.focus()
    }
  }, [opener])

  const keepFocusInside = (event) => {
    if (event.key !== 'Tab') return
    const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)]
    if (items.length === 0) return event.preventDefault()
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={keepFocusInside}
      >
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

export function StatTile({ label, value, detail, to }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {detail && <span className="stat-detail">{detail}</span>}
    </>
  )
  return to ? (
    <Link to={to} className="stat-tile stat-link">
      {body}
    </Link>
  ) : (
    <div className="stat-tile">{body}</div>
  )
}

export function StatusBadge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
