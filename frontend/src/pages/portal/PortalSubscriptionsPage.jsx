import { useNavigate } from 'react-router-dom'
import ResourceListPage from '../../components/ResourceListPage'
import { PORTAL_SUBSCRIPTION_COLUMNS, STATE_FILTER } from '../subscriptions/listConfig'

export default function PortalSubscriptionsPage() {
  const navigate = useNavigate()
  return (
    <ResourceListPage
      title="My subscriptions"
      noun="subscription"
      endpoint="/subscriptions/"
      columns={PORTAL_SUBSCRIPTION_COLUMNS}
      filters={[{ ...STATE_FILTER, options: STATE_FILTER.options.filter((option) => option.value !== 'draft') }]}
      showActiveFilter={false}
      searchPlaceholder="Search by number"
      onRowClick={(row) => navigate(`/portal/subscriptions/${row.id}`)}
    />
  )
}
