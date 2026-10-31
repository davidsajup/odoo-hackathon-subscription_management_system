import { StatusBadge } from '../../components/ui'
import { formatDate, formatMoney } from '../../format'
import { INVOICE_STATES, invoiceStatus } from './labels'

const statusColumn = {
  label: 'Status',
  render: (row) => {
    const status = invoiceStatus(row)
    return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
  },
}

export const INVOICE_COLUMNS = [
  { label: 'Number', key: 'number' },
  { label: 'Customer', key: 'billing_name' },
  { label: 'Subscription', key: 'subscription_number' },
  { label: 'Date', render: (row) => formatDate(row.invoice_date) },
  { label: 'Due', render: (row) => formatDate(row.due_date) },
  { label: 'Total', render: (row) => formatMoney(row.amount_total), className: 'num' },
  { label: 'Amount due', render: (row) => formatMoney(row.amount_due), className: 'num' },
  statusColumn,
]

export const PORTAL_INVOICE_COLUMNS = [
  { label: 'Number', key: 'number' },
  { label: 'Subscription', key: 'subscription_number' },
  { label: 'Date', render: (row) => formatDate(row.invoice_date) },
  { label: 'Due', render: (row) => formatDate(row.due_date) },
  { label: 'Total', render: (row) => formatMoney(row.amount_total), className: 'num' },
  { label: 'Amount due', render: (row) => formatMoney(row.amount_due), className: 'num' },
  statusColumn,
]

export const INVOICE_FILTERS = [
  { name: 'state', label: 'Status', options: [{ value: '', label: 'All statuses' }, ...INVOICE_STATES] },
  {
    name: 'overdue',
    label: 'Overdue',
    options: [
      { value: '', label: 'Any due date' },
      { value: 'true', label: 'Overdue only' },
    ],
  },
]
