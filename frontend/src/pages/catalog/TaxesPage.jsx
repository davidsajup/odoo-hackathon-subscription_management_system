import { useAuth } from '../../auth/useAuth'
import ResourceFormModal from '../../components/ResourceFormModal'
import { activeColumn } from '../../components/columns'
import ResourceListPage from '../../components/ResourceListPage'
import { FormField } from '../../components/ui'
import { formatTax } from './labels'

const ENDPOINT = '/catalog/taxes/'
const DEFAULTS = { name: '', tax_type: 'percent', amount: '' }

function TaxForm(props) {
  return (
    <ResourceFormModal endpoint={ENDPOINT} noun="tax" defaults={DEFAULTS} {...props}>
      {({ values, onChange, errors }) => (
        <>
          <FormField label="Name" error={errors.name}>
            <input name="name" value={values.name} onChange={onChange} required autoFocus placeholder="GST 18%" />
          </FormField>
          <div className="grid-2">
            <FormField label="Type" error={errors.tax_type}>
              <select name="tax_type" value={values.tax_type} onChange={onChange}>
                <option value="percent">Percentage of line amount</option>
                <option value="fixed">Fixed amount per unit</option>
              </select>
            </FormField>
            <FormField label={values.tax_type === 'percent' ? 'Rate (%)' : 'Amount (₹)'} error={errors.amount}>
              <input type="number" name="amount" min="0" step="0.01" value={values.amount} onChange={onChange} required />
            </FormField>
          </div>
        </>
      )}
    </ResourceFormModal>
  )
}

const COLUMNS = [
  { label: 'Name', key: 'name' },
  { label: 'Type', render: (row) => (row.tax_type === 'percent' ? 'Percentage' : 'Fixed per unit') },
  { label: 'Rate', render: formatTax },
  activeColumn(),
]

export default function TaxesPage() {
  const { user } = useAuth()
  return (
    <ResourceListPage
      title="Taxes"
      noun="tax"
      endpoint={ENDPOINT}
      columns={COLUMNS}
      filters={[
        {
          name: 'tax_type',
          label: 'Type',
          options: [
            { value: '', label: 'All types' },
            { value: 'percent', label: 'Percentage' },
            { value: 'fixed', label: 'Fixed' },
          ],
        },
      ]}
      searchPlaceholder="Search taxes"
      canEdit={user.role === 'admin'}
      renderForm={(props) => <TaxForm {...props} />}
    />
  )
}
