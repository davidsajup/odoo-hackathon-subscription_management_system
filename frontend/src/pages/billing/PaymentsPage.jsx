import { useNavigate } from 'react-router-dom'
import ResourceListPage from '../../components/ResourceListPage'
import { formatDate, formatMoney } from '../../format'
import { PAYMENT_METHODS } from './labels'

const COLUMNS = [
  { label: 'Date', render: (row) => formatDate(row.payment_date) },
  { label: 'Invoice', key: 'invoice_number' },
  { label: 'Customer', key: 'customer_name' },
  { label: 'Method', key: 'method_display' },
  { label: 'Note', render: (row) => row.note || '—' },
  { label: 'Recorded by', render: (row) => row.recorded_by_name || '—' },
  { label: 'Amount', render: (row) => formatMoney(row.amount), className: 'num' },
]

export default function PaymentsPage() {
  const navigate = useNavigate()
  return (
    <ResourceListPage
      title="Payments"
      noun="payment"
      endpoint="/payments/"
      columns={COLUMNS}
      filters={[{ name: 'method', label: 'Method', options: [{ value: '', label: 'All methods' }, ...PAYMENT_METHODS] }]}
      showActiveFilter={false}
      searchPlaceholder="Search invoice, customer or note"
      onRowClick={(row) => navigate(`/app/invoices/${row.invoice}`)}
    />
  )
}
