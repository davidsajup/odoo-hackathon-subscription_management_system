import { useAuth } from '../../auth/useAuth'
import ResourceFormModal, { CheckboxList } from '../../components/ResourceFormModal'
import { activeColumn } from '../../components/columns'
import ResourceListPage from '../../components/ResourceListPage'
import { FormField } from '../../components/ui'
import { formatDateRange, formatMoney } from '../../format'
import { useOptions } from '../../hooks'
import { formatDiscountValue } from './labels'

const ENDPOINT = '/catalog/discounts/'
const today = () => new Date().toLocaleDateString('en-CA')
const DEFAULTS = {
  name: '',
  discount_type: 'percent',
  value: '',
  scope: 'subscription',
  products: [],
  min_purchase_amount: '0',
  min_quantity: 0,
  start_date: '',
  end_date: '',
  usage_limit: '',
}

function DiscountForm(props) {
  const products = useOptions('/catalog/products/', { is_active: true })
  return (
    <ResourceFormModal
      endpoint={ENDPOINT}
      noun="discount"
      defaults={{ ...DEFAULTS, start_date: today() }}
      toPayload={(values) => ({
        ...Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, values[key]])),
        end_date: values.end_date || null,
        usage_limit: values.usage_limit || null,
        min_purchase_amount: values.min_purchase_amount || '0',
        min_quantity: values.min_quantity || 0,
      })}
      {...props}
    >
      {({ values, setValues, onChange, errors }) => (
        <>
          <FormField label="Name" error={errors.name}>
            <input name="name" value={values.name} onChange={onChange} required autoFocus placeholder="10% off 20+ seats" />
          </FormField>
          <div className="grid-2">
            <FormField label="Type" error={errors.discount_type}>
              <select name="discount_type" value={values.discount_type} onChange={onChange}>
                <option value="percent">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </FormField>
            <FormField label={values.discount_type === 'percent' ? 'Discount (%)' : 'Discount (₹)'} error={errors.value}>
              <input type="number" name="value" min="0" step="0.01" value={values.value} onChange={onChange} required />
            </FormField>
          </div>
          <FormField label="Applies to" error={errors.scope}>
            <select name="scope" value={values.scope} onChange={onChange}>
              <option value="subscription">Whole subscription</option>
              <option value="products">Specific products</option>
            </select>
          </FormField>
          {values.scope === 'products' && (
            <FormField label="Products" error={errors.products}>
              <CheckboxList
                options={products}
                selected={values.products}
                onChange={(selected) => setValues((current) => ({ ...current, products: selected }))}
              />
            </FormField>
          )}
          <div className="grid-2">
            <FormField label="Minimum purchase (₹)" error={errors.min_purchase_amount} hint="0 for no minimum">
              <input type="number" name="min_purchase_amount" min="0" step="0.01" value={values.min_purchase_amount} onChange={onChange} />
            </FormField>
            <FormField label="Minimum quantity" error={errors.min_quantity} hint="0 for no minimum">
              <input type="number" name="min_quantity" min="0" value={values.min_quantity} onChange={onChange} />
            </FormField>
          </div>
          <div className="grid-3">
            <FormField label="Starts" error={errors.start_date}>
              <input type="date" name="start_date" value={values.start_date} onChange={onChange} required />
            </FormField>
            <FormField label="Ends" error={errors.end_date} hint="Empty = no end">
              <input type="date" name="end_date" value={values.end_date ?? ''} onChange={onChange} />
            </FormField>
            <FormField label="Usage limit" error={errors.usage_limit} hint="Empty = unlimited">
              <input type="number" name="usage_limit" min="1" value={values.usage_limit ?? ''} onChange={onChange} />
            </FormField>
          </div>
        </>
      )}
    </ResourceFormModal>
  )
}

function conditions(row) {
  const parts = []
  if (Number(row.min_purchase_amount) > 0) parts.push(`Min ${formatMoney(row.min_purchase_amount)}`)
  if (row.min_quantity > 0) parts.push(`Min ${row.min_quantity} units`)
  return parts.join(' · ') || 'None'
}

const COLUMNS = [
  { label: 'Name', key: 'name' },
  { label: 'Discount', render: formatDiscountValue, className: 'num' },
  {
    label: 'Applies to',
    render: (row) => (row.scope === 'subscription' ? 'Whole subscription' : row.product_names.join(', ')),
  },
  { label: 'Conditions', render: conditions },
  { label: 'Valid', render: (row) => formatDateRange(row.start_date, row.end_date) },
  { label: 'Used', render: (row) => (row.usage_limit ? `${row.used_count} / ${row.usage_limit}` : `${row.used_count} / ∞`) },
  activeColumn(),
]

export default function DiscountsPage() {
  const { user } = useAuth()
  return (
    <ResourceListPage
      title="Discounts"
      noun="discount"
      endpoint={ENDPOINT}
      columns={COLUMNS}
      filters={[
        {
          name: 'scope',
          label: 'Applies to',
          options: [
            { value: '', label: 'Any scope' },
            { value: 'subscription', label: 'Whole subscription' },
            { value: 'products', label: 'Specific products' },
          ],
        },
      ]}
      searchPlaceholder="Search discounts"
      canEdit={user.role === 'admin'}
      renderForm={(props) => <DiscountForm {...props} />}
    />
  )
}
