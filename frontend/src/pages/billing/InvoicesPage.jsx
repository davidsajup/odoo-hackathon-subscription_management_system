import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'
import { parseApiError } from '../../api/errors'
import ResourceListPage from '../../components/ResourceListPage'
import { Alert } from '../../components/ui'
import { useConfirm } from '../../components/useConfirm'
import { useToast } from '../../components/useToast'
import { INVOICE_COLUMNS, INVOICE_FILTERS } from './listConfig'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

export default function InvoicesPage() {
  const navigate = useNavigate()
  const [refreshKey, setRefreshKey] = useState(0)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const { confirm, dialog } = useConfirm()
  const toast = useToast()

  const run = async (name, request, describe) => {
    setBusy(name)
    setError(null)
    try {
      const response = await request()
      toast(describe(response.data))
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

  const confirmDrafts = async () => {
    const confirmed = await confirm({
      title: 'Confirm all drafts?',
      message: 'Every draft invoice will be confirmed and become payable. This cannot be undone in bulk.',
      confirmLabel: 'Confirm all',
      cancelLabel: 'Not now',
    })
    if (!confirmed) return
    run('confirm', () => api.post('/invoices/bulk-confirm/', {}), (data) =>
      data.confirmed ? `Confirmed ${plural(data.confirmed, 'invoice')}.` : 'There were no drafts to confirm.',
    )
  }

  const confirmSelected = async (ids) => {
    const confirmed = await confirm({
      title: `Confirm ${plural(ids.length, 'invoice')}?`,
      message: `The selected draft ${ids.length === 1 ? 'invoice' : 'invoices'} will be confirmed and become payable.`,
      confirmLabel: `Confirm ${ids.length}`,
      cancelLabel: 'Not now',
    })
    if (!confirmed) return
    run('confirm', () => api.post('/invoices/bulk-confirm/', { ids }), (data) =>
      data.confirmed ? `Confirmed ${plural(data.confirmed, 'invoice')}.` : 'Nothing to confirm: the selection was no longer in draft.',
    )
  }

  const bulk = {
    canSelect: (row) => row.state === 'draft',
    selectAllLabel: 'Select all draft invoices on this page',
    renderBar: ({ selectedIds }) => (
      <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => confirmSelected(selectedIds)}>
        {busy === 'confirm' ? 'Confirming…' : 'Confirm selected'}
      </button>
    ),
  }

  return (
    <>
    <ResourceListPage
      bulk={bulk}
      title="Invoices"
      noun="invoice"
      endpoint="/invoices/"
      columns={INVOICE_COLUMNS}
      filters={INVOICE_FILTERS}
      showActiveFilter={false}
      searchPlaceholder="Search number, customer or subscription"
      refreshKey={refreshKey}
      notice={<Alert>{error}</Alert>}
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
    {dialog}
    </>
  )
}
