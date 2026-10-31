import { useNavigate } from 'react-router-dom'
import ResourceListPage from '../../components/ResourceListPage'
import { INVOICE_FILTERS, PORTAL_INVOICE_COLUMNS } from '../billing/listConfig'

export default function PortalInvoicesPage() {
  const navigate = useNavigate()
  const filters = INVOICE_FILTERS.map((filter) =>
    filter.name === 'state' ? { ...filter, options: filter.options.filter((option) => option.value !== 'draft') } : filter,
  )
  return (
    <ResourceListPage
      title="My invoices"
      noun="invoice"
      endpoint="/invoices/"
      columns={PORTAL_INVOICE_COLUMNS}
      filters={filters}
      showActiveFilter={false}
      searchPlaceholder="Search by number"
      onRowClick={(row) => navigate(`/portal/invoices/${row.id}`)}
    />
  )
}
