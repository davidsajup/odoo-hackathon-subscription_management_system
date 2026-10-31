import { StatusBadge } from '../../components/ui'
import { formatDate, formatMoney } from '../../format'
import { STATES, stateInfo } from './labels'

const statusColumn = {
  label: 'Status',
  render: (row) => <StatusBadge tone={stateInfo(row.state).tone}>{stateInfo(row.state).label}</StatusBadge>,
}

export const SUBSCRIPTION_COLUMNS = [
  { label: 'Number', key: 'number' },
  { label: 'Customer', key: 'customer_name' },
  { label: 'Plan', key: 'plan_name' },
  { label: 'Start', render: (row) => formatDate(row.start_date) },
  { label: 'Expiry', render: (row) => formatDate(row.expiry_date) },
  { label: 'Next invoice', render: (row) => formatDate(row.next_invoice_date) },
  { label: 'Total', render: (row) => formatMoney(row.amount_total), className: 'num' },
  statusColumn,
]

export const PORTAL_SUBSCRIPTION_COLUMNS = [
  { label: 'Number', key: 'number' },
  { label: 'Plan', key: 'plan_name' },
  { label: 'Start', render: (row) => formatDate(row.start_date) },
  { label: 'Expiry', render: (row) => formatDate(row.expiry_date) },
  { label: 'Next invoice', render: (row) => formatDate(row.next_invoice_date) },
  { label: 'Total per period', render: (row) => formatMoney(row.amount_total), className: 'num' },
  statusColumn,
]

export const STATE_FILTER = {
  name: 'state',
  label: 'Status',
  options: [{ value: '', label: 'All statuses' }, ...STATES],
}
