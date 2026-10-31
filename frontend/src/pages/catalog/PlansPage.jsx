import { useAuth } from '../../auth/useAuth'
import ResourceFormModal from '../../components/ResourceFormModal'
import { activeColumn } from '../../components/columns'
import ResourceListPage from '../../components/ResourceListPage'
import { FormField, StatusBadge } from '../../components/ui'
import { formatBillingPeriod, formatDateRange, formatMoney } from '../../format'
import { BILLING_PERIODS } from './labels'

const ENDPOINT = '/catalog/plans/'
const today = () => new Date().toLocaleDateString('en-CA')
const DEFAULTS = {
  name: '',
  price: '',
  billing_period: 'monthly',
  billing_interval: 1,
  min_quantity: 1,
  start_date: '',
  end_date: '',
  auto_close: false,
  closable: true,
  pausable: false,
  renewable: true,
  description: '',
}

const OPTIONS = [
  { name: 'auto_close', label: 'Close automatically at expiry' },
  { name: 'closable', label: 'Can be closed early' },
  { name: 'pausable', label: 'Can be paused' },
  { name: 'renewable', label: 'Can be renewed' },
]

function PlanForm(props) {
  return (
    <ResourceFormModal
      endpoint={ENDPOINT}
      noun="plan"
      defaults={{ ...DEFAULTS, start_date: today() }}
      toPayload={(values) => ({
        ...Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, values[key]])),
        end_date: values.end_date || null,
      })}
      {...props}
    >
      {({ values, onChange, errors }) => (
        <>
          <FormField label="Name" error={errors.name}>
            <input name="name" value={values.name} onChange={onChange} required autoFocus placeholder="Pro Monthly" />
          </FormField>
          <div className="grid-3">
            <FormField label="Price (₹)" error={errors.price}>
              <input type="number" name="price" min="0" step="0.01" value={values.price} onChange={onChange} required />
            </FormField>
            <FormField label="Bills every" error={errors.billing_interval}>
              <input type="number" name="billing_interval" min="1" value={values.billing_interval} onChange={onChange} required />
            </FormField>
            <FormField label="Period" error={errors.billing_period}>
              <select name="billing_period" value={values.billing_period} onChange={onChange}>
                {BILLING_PERIODS.map((period) => (
                  <option key={period.value} value={period.value}>
                    {period.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="grid-3">
            <FormField label="Minimum quantity" error={errors.min_quantity}>
              <input type="number" name="min_quantity" min="1" value={values.min_quantity} onChange={onChange} required />
            </FormField>
            <FormField label="Available from" error={errors.start_date}>
              <input type="date" name="start_date" value={values.start_date} onChange={onChange} required />
            </FormField>
            <FormField label="Available until" error={errors.end_date} hint="Leave empty for no end">
              <input type="date" name="end_date" value={values.end_date ?? ''} onChange={onChange} />
            </FormField>
          </div>
          <div className="field">
            <span className="field-label">Subscription rules</span>
            <div className="checkbox-list">
              {OPTIONS.map((option) => (
                <label key={option.name} className="checkbox">
                  <input type="checkbox" name={option.name} checked={values[option.name]} onChange={onChange} />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          <FormField label="Description" error={errors.description}>
            <textarea name="description" rows={2} value={values.description} onChange={onChange} />
          </FormField>
        </>
      )}
    </ResourceFormModal>
  )
}

const RULE_BADGES = [
  { name: 'auto_close', label: 'Auto-close' },
  { name: 'closable', label: 'Closable' },
  { name: 'pausable', label: 'Pausable' },
  { name: 'renewable', label: 'Renewable' },
]

const COLUMNS = [
  { label: 'Name', key: 'name' },
  { label: 'Price', render: (row) => formatMoney(row.price), className: 'num' },
  { label: 'Billing', render: (row) => formatBillingPeriod(row.billing_period, row.billing_interval) },
  { label: 'Min qty', key: 'min_quantity', className: 'num' },
  { label: 'Available', render: (row) => formatDateRange(row.start_date, row.end_date) },
  {
    label: 'Rules',
    render: (row) => (
      <span className="badge-row">
        {RULE_BADGES.filter((rule) => row[rule.name]).map((rule) => (
          <StatusBadge key={rule.name} tone="info">
            {rule.label}
          </StatusBadge>
        ))}
      </span>
    ),
  },
  activeColumn(),
]

export default function PlansPage() {
  const { user } = useAuth()
  return (
    <ResourceListPage
      title="Plans"
      noun="plan"
      endpoint={ENDPOINT}
      columns={COLUMNS}
      filters={[
        { name: 'billing_period', label: 'Period', options: [{ value: '', label: 'All periods' }, ...BILLING_PERIODS] },
      ]}
      searchPlaceholder="Search plans"
      canEdit={user.role === 'admin'}
      renderForm={(props) => <PlanForm {...props} />}
    />
  )
}
