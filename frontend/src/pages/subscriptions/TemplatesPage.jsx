import { useAuth } from '../../auth/useAuth'
import { activeColumn } from '../../components/columns'
import ResourceFormModal from '../../components/ResourceFormModal'
import ResourceListPage from '../../components/ResourceListPage'
import { FormField } from '../../components/ui'
import { useOptions } from '../../hooks'
import { toLinePayload } from './labels'
import ProductLinesEditor from './ProductLinesEditor'

const ENDPOINT = '/quotation-templates/'
const DEFAULTS = { name: '', plan: '', plan_quantity: 1, validity_days: 30, notes: '', lines: [] }

function TemplateForm(props) {
  const plans = useOptions('/catalog/plans/', { is_active: true })
  const products = useOptions('/catalog/products/', { is_active: true })
  return (
    <ResourceFormModal
      endpoint={ENDPOINT}
      noun="quotation template"
      defaults={DEFAULTS}
      toPayload={(values) => ({
        name: values.name,
        plan: Number(values.plan),
        plan_quantity: Number(values.plan_quantity),
        validity_days: Number(values.validity_days),
        notes: values.notes,
        lines: values.lines.map((line) => toLinePayload(line, false)),
      })}
      {...props}
    >
      {({ values, setValues, onChange, errors }) => {
        const selectedPlan = plans.find((plan) => plan.id === Number(values.plan))
        return (
          <>
            <FormField label="Template name" error={errors.name}>
              <input name="name" value={values.name} onChange={onChange} required autoFocus placeholder="Enterprise bundle" />
            </FormField>
            <div className="grid-3">
              <FormField label="Plan" error={errors.plan}>
                <select
                  name="plan"
                  value={values.plan}
                  onChange={(e) => {
                    const plan = plans.find((p) => p.id === Number(e.target.value))
                    setValues((current) => ({
                      ...current,
                      plan: e.target.value,
                      plan_quantity: Math.max(Number(current.plan_quantity), plan?.min_quantity ?? 1),
                    }))
                  }}
                  required
                >
                  <option value="">Choose…</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Plan quantity"
                error={errors.plan_quantity}
                hint={selectedPlan ? `Minimum ${selectedPlan.min_quantity}` : null}
              >
                <input type="number" name="plan_quantity" min={selectedPlan?.min_quantity ?? 1} value={values.plan_quantity} onChange={onChange} required />
              </FormField>
              <FormField label="Valid for (days)" error={errors.validity_days}>
                <input type="number" name="validity_days" min="1" value={values.validity_days} onChange={onChange} required />
              </FormField>
            </div>
            <ProductLinesEditor
              lines={values.lines}
              products={products}
              error={errors.lines}
              onChange={(lines) => setValues((current) => ({ ...current, lines }))}
            />
            <FormField label="Notes for the customer" error={errors.notes}>
              <textarea name="notes" rows={2} value={values.notes} onChange={onChange} />
            </FormField>
          </>
        )
      }}
    </ResourceFormModal>
  )
}

const COLUMNS = [
  { label: 'Name', key: 'name' },
  { label: 'Plan', render: (row) => `${row.plan_name} × ${row.plan_quantity}` },
  {
    label: 'Products',
    className: 'wrap',
    render: (row) =>
      row.lines.map((line) => `${line.product_name}${line.variant_name ? ` (${line.variant_name})` : ''} × ${line.quantity}`).join(', ') || '—',
  },
  { label: 'Valid for', render: (row) => `${row.validity_days} days` },
  activeColumn(),
]

export default function TemplatesPage() {
  const { user } = useAuth()
  return (
    <ResourceListPage
      title="Quotation templates"
      noun="template"
      endpoint={ENDPOINT}
      columns={COLUMNS}
      searchPlaceholder="Search templates"
      canEdit={user.role === 'admin'}
      renderForm={({ item, ...props }) => (
        <TemplateForm
          item={item.id ? { ...item, lines: item.lines.map((line) => ({ ...line, variant: line.variant ?? '', unit_price: '' })) } : item}
          {...props}
        />
      )}
    />
  )
}
