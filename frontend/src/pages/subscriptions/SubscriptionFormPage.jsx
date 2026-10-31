import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../../api/client'
import { Alert, FormField } from '../../components/ui'
import { formatBillingPeriod, formatMoney } from '../../format'
import { useApiGet, useForm, useOptions, useSubmit } from '../../hooks'
import { addDays, catalogPrice, PAYMENT_TERMS, toLinePayload, todayIso } from './labels'
import ProductLinesEditor from './ProductLinesEditor'

function initialValues(subscription) {
  if (!subscription) {
    const start = todayIso()
    return {
      customer: '',
      plan: '',
      plan_quantity: 1,
      start_date: start,
      expiry_date: addDays(start, 365),
      payment_terms_days: 15,
      notes: '',
      lines: [],
    }
  }
  return {
    customer: subscription.customer,
    plan: subscription.plan,
    plan_quantity: subscription.plan_quantity,
    start_date: subscription.start_date,
    expiry_date: subscription.expiry_date,
    payment_terms_days: subscription.payment_terms_days,
    notes: subscription.notes,
    lines: subscription.lines
      .filter((line) => line.line_type === 'product')
      .map((line) => ({ product: line.product, variant: line.variant ?? '', quantity: line.quantity, unit_price: line.unit_price })),
  }
}

function SubscriptionForm({ subscription }) {
  const navigate = useNavigate()
  const customers = useOptions('/users/customers/', { is_active: true })
  const plans = useOptions('/catalog/plans/', { is_active: true })
  const products = useOptions('/catalog/products/', { is_active: true })
  const { values, setValues, onChange } = useForm(initialValues(subscription))
  const selectedPlan = plans.find((plan) => plan.id === Number(values.plan))

  const { submit, submitting, error } = useSubmit(async () => {
    const payload = {
      customer: Number(values.customer),
      plan: Number(values.plan),
      plan_quantity: Number(values.plan_quantity),
      start_date: values.start_date,
      expiry_date: values.expiry_date,
      payment_terms_days: Number(values.payment_terms_days),
      notes: values.notes,
      product_lines: values.lines.map((line) => toLinePayload(line, true)),
    }
    const response = subscription
      ? await api.patch(`/subscriptions/${subscription.id}/`, payload)
      : await api.post('/subscriptions/', payload)
    navigate(`/app/subscriptions/${response.data.id}`)
  })

  const planAmount = (selectedPlan ? Number(selectedPlan.price) : 0) * (Number(values.plan_quantity) || 0)
  const productsAmount = values.lines.reduce((sum, line) => {
    const unit = line.unit_price === '' ? catalogPrice(products, line) : Number(line.unit_price)
    return sum + unit * (Number(line.quantity) || 0)
  }, 0)
  const errors = error?.fields ?? {}

  return (
    <form onSubmit={submit} className="stack">
      <div className="page-header">
        <div>
          <Link to={subscription ? `/app/subscriptions/${subscription.id}` : '/app/subscriptions'} className="back-link">
            ← {subscription ? subscription.number : 'Subscriptions'}
          </Link>
          <h1>{subscription ? `Edit ${subscription.number}` : 'New subscription'}</h1>
        </div>
      </div>
      <Alert>{error?.message}</Alert>

      <div className="card stack">
        <div className="grid-2">
          <FormField label="Customer" error={errors.customer}>
            <select name="customer" value={values.customer} onChange={onChange} required autoFocus>
              <option value="">Choose…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.company_name || customer.email} {customer.company_name ? `(${customer.email})` : ''}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Payment terms" error={errors.payment_terms_days}>
            <select name="payment_terms_days" value={values.payment_terms_days} onChange={onChange}>
              {PAYMENT_TERMS.map((term) => (
                <option key={term.value} value={term.value}>
                  {term.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="grid-2">
          <FormField
            label="Plan"
            error={errors.plan}
            hint={selectedPlan ? `${formatMoney(selectedPlan.price)} · ${formatBillingPeriod(selectedPlan.billing_period, selectedPlan.billing_interval)}` : null}
          >
            <select
              name="plan"
              value={values.plan}
              required
              onChange={(e) => {
                const plan = plans.find((p) => p.id === Number(e.target.value))
                setValues((current) => ({
                  ...current,
                  plan: e.target.value,
                  plan_quantity: Math.max(Number(current.plan_quantity) || 1, plan?.min_quantity ?? 1),
                }))
              }}
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
        </div>
        <div className="grid-2">
          <FormField label="Start date" error={errors.start_date}>
            <input type="date" name="start_date" value={values.start_date} onChange={onChange} required />
          </FormField>
          <FormField label="Expiry date" error={errors.expiry_date}>
            <input type="date" name="expiry_date" value={values.expiry_date} onChange={onChange} required />
          </FormField>
        </div>
      </div>

      <div className="card stack">
        <ProductLinesEditor
          lines={values.lines}
          products={products}
          editablePrice
          error={errors.product_lines ? 'Check the product lines: each needs a product and a valid quantity.' : null}
          onChange={(lines) => setValues((current) => ({ ...current, lines }))}
        />
        <FormField label="Notes" error={errors.notes}>
          <textarea name="notes" rows={2} value={values.notes} onChange={onChange} />
        </FormField>
      </div>

      <div className="form-footer">
        <div className="estimate">
          <span className="muted">Estimated subtotal before tax</span>
          <strong>{formatMoney(planAmount + productsAmount)}</strong>
        </div>
        <div className="button-row">
          <Link to={subscription ? `/app/subscriptions/${subscription.id}` : '/app/subscriptions'} className="btn btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </div>
    </form>
  )
}

export function NewSubscriptionPage() {
  return <SubscriptionForm />
}

export function EditSubscriptionPage() {
  const { id } = useParams()
  const { data, error } = useApiGet(`/subscriptions/${id}/`)
  if (error) return <Alert>{error}</Alert>
  if (!data) return <p className="muted">Loading…</p>
  if (!['draft', 'quotation'].includes(data.state)) {
    return <Alert>Only draft subscriptions and quotations can be edited.</Alert>
  }
  return <SubscriptionForm subscription={data} />
}
