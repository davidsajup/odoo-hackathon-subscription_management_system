import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'
import { parseApiError } from '../../api/errors'
import ResourceListPage from '../../components/ResourceListPage'
import { Alert } from '../../components/ui'
import { INVOICE_COLUMNS, INVOICE_FILTERS } from './listConfig'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

export default function InvoicesPage() {
  const navigate = useNavigate()
  const [refreshKey, setRefreshKey] = useState(0)
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const run = async (name, request, describe) => {
    setBusy(name)
    setMessage(null)
    setError(null)
    try {
      const response = await request()
      setMessage(describe(response.data))
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setError(parseApiError(err).message)
    } finally {
      setBusy(null)
    }
  }

  const runBilling = () =>
    run('billing', () => api.post('/billing/run/'), (data) =>
      data.created ? `Created ${plural(data.created, 'draft invoice')}.` : 'Nothing is due for invoicing today.',
    )

  const confirmDrafts = () => {
    if (!window.confirm('Confirm every draft invoice?')) return
    run('confirm', () => api.post('/invoices/bulk-confirm/', {}), (data) =>
      data.confirmed ? `Confirmed ${plural(data.confirmed, 'invoice')}.` : 'There were no drafts to confirm.',
    )
  }

  return (
    <ResourceListPage
      title="Invoices"
      noun="invoice"
      endpoint="/invoices/"
      columns={INVOICE_COLUMNS}
      filters={INVOICE_FILTERS}
      showActiveFilter={false}
      searchPlaceholder="Search number, customer or subscription"
      refreshKey={refreshKey}
      notice={
        <>
          <Alert kind="success">{message}</Alert>
          <Alert>{error}</Alert>
        </>
      }
      onRowClick={(row) => navigate(`/app/invoices/${row.id}`)}
      headerActions={
        <div className="button-row">
          <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={confirmDrafts}>
            {busy === 'confirm' ? 'Confirming…' : 'Confirm all drafts'}
          </button>
          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={runBilling}>
            {busy === 'billing' ? 'Running…' : 'Run billing now'}
          </button>
        </div>
      }
    />
  )
}
