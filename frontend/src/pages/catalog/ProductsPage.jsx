import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import ResourceFormModal, { CheckboxList } from '../../components/ResourceFormModal'
import { activeColumn } from '../../components/columns'
import ResourceListPage from '../../components/ResourceListPage'
import { FormField } from '../../components/ui'
import { formatMoney } from '../../format'
import { useOptions } from '../../hooks'
import { formatTax, PRODUCT_TYPES, productTypeLabel } from './labels'

const ENDPOINT = '/catalog/products/'
const DEFAULTS = { name: '', product_type: 'service', sales_price: '', cost_price: '0', notes: '', taxes: [] }

export function ProductForm(props) {
  const taxes = useOptions('/catalog/taxes/', { is_active: true })
  return (
    <ResourceFormModal endpoint={ENDPOINT} noun="product" defaults={DEFAULTS} {...props}>
      {({ values, setValues, onChange, errors }) => (
        <>
          <FormField label="Name" error={errors.name}>
            <input name="name" value={values.name} onChange={onChange} required autoFocus />
          </FormField>
          <FormField label="Type" error={errors.product_type}>
            <select name="product_type" value={values.product_type} onChange={onChange}>
              {PRODUCT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid-2">
            <FormField label="Sales price (₹)" error={errors.sales_price}>
              <input type="number" name="sales_price" min="0" step="0.01" value={values.sales_price} onChange={onChange} required />
            </FormField>
            <FormField label="Cost price (₹)" error={errors.cost_price}>
              <input type="number" name="cost_price" min="0" step="0.01" value={values.cost_price} onChange={onChange} />
            </FormField>
          </div>
          <FormField label="Taxes" error={errors.taxes}>
            <CheckboxList
              options={taxes}
              selected={values.taxes}
              onChange={(selected) => setValues((current) => ({ ...current, taxes: selected }))}
              labelFor={(tax) => `${tax.name} (${formatTax(tax)})`}
            />
          </FormField>
          <FormField label="Notes" error={errors.notes}>
            <textarea name="notes" rows={3} value={values.notes} onChange={onChange} />
          </FormField>
        </>
      )}
    </ResourceFormModal>
  )
}

const COLUMNS = [
  { label: 'Name', key: 'name' },
  { label: 'Type', render: (row) => productTypeLabel(row.product_type) },
  { label: 'Sales price', render: (row) => formatMoney(row.sales_price), className: 'num' },
  { label: 'Cost price', render: (row) => formatMoney(row.cost_price), className: 'num' },
  { label: 'Taxes', render: (row) => row.tax_details.map((tax) => tax.name).join(', ') || '—' },
  { label: 'Variants', render: (row) => row.variants.length || '—', className: 'num' },
  activeColumn(),
]

export default function ProductsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  return (
    <ResourceListPage
      title="Products"
      noun="product"
      endpoint={ENDPOINT}
      columns={COLUMNS}
      filters={[{ name: 'product_type', label: 'Type', options: [{ value: '', label: 'All types' }, ...PRODUCT_TYPES] }]}
      searchPlaceholder="Search products"
      canEdit={user.role === 'admin'}
      renderForm={(props) => <ProductForm {...props} />}
      onRowClick={(row) => navigate(`/app/products/${row.id}`)}
    />
  )
}
