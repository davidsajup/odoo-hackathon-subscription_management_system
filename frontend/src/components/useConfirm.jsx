import { useCallback, useRef, useState } from 'react'
import { Modal } from './ui'

export function useConfirm() {
  const [request, setRequest] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        resolver.current = resolve
        setRequest(options)
      }),
    [],
  )

  const settle = (answer) => {
    resolver.current?.(answer)
    resolver.current = null
    setRequest(null)
  }

  const dialog = request && (
    <Modal title={request.title} onClose={() => settle(false)}>
      <div className="stack">
        <p>{request.message}</p>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" autoFocus onClick={() => settle(false)}>
            {request.cancelLabel ?? 'Keep it'}
          </button>
          <button
            type="button"
            className={`btn ${request.danger ? 'btn-danger-solid' : 'btn-primary'}`}
            onClick={() => settle(true)}
          >
            {request.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </Modal>
  )

  return { confirm, dialog }
}
