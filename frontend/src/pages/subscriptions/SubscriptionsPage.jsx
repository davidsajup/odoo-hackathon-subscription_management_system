import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api/client'
import ResourceListPage from '../../components/ResourceListPage'
import { Alert, FormField, Modal } from '../../components/ui'
import { useOptions, useSubmit } from '../../hooks'
import { todayIso } from './labels'
import { STATE_FILTER, SUBSCRIPTION_COLUMNS } from './listConfig'

function FromTemplateModal({ onClose }) {
  const navigate = useNavigate()
  const templates = useOptions('/quotation-templates/', { is_active: true })
  const customers = useOptions('/users/customers/', { is_active: true })
  const [values, setValues] = useState({ template: '', customer: '', start_date: todayIso() })
  const change = (e) => setValues((current) => ({ ...current, [e.target.name]: e.target.value }))

  const { submit, submitting, error } = useSubmit(async () => {
    const response = await api.post('/subscriptions/from-template/', values)
    navigate(`/app/subscriptions/${response.data.id}`)
  })

  return (
    <Modal title="New quotation from template" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Alert>{error?.message}</Alert>
        <FormField label="Template" error={error?.fields.template}>
          <select name="template" value={values.template} onChange={change} required autoFocus>
            <option value="">Choose…</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} — {template.plan_name} × {template.plan_quantity}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Customer" error={error?.fields.customer}>
          <select name="customer" value={values.customer} onChange={change} required>
            <option value="">Choose…</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.company_name || customer.email} {customer.company_name ? `(${customer.email})` : ''}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Start date" error={error?.fields.start_date}>
          <input type="date" name="start_date" value={values.start_date} onChange={change} required />
        </FormField>
        <p className="muted">The plan and product lines are copied from the template. You can edit them before sending.</p>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function SubscriptionsPage() {
  const navigate = useNavigate()
  const [fromTemplate, setFromTemplate] = useState(false)
  const plans = useOptions('/catalog/plans/')

  return (
    <>
      <ResourceListPage
        title="Subscriptions"
        noun="subscription"
        endpoint="/subscriptions/"
        columns={SUBSCRIPTION_COLUMNS}
        filters={[
          STATE_FILTER,
          {
            name: 'plan',
            label: 'Plan',
            options: [{ value: '', label: 'All plans' }, ...plans.map((plan) => ({ value: plan.id, label: plan.name }))],
          },
        ]}
        showActiveFilter={false}
        searchPlaceholder="Search number, customer or company"
        onRowClick={(row) => navigate(`/app/subscriptions/${row.id}`)}
        headerActions={
          <div className="button-row">
            <button type="button" className="btn btn-secondary" onClick={() => setFromTemplate(true)}>
              From template
            </button>
            <Link to="/app/subscriptions/new" className="btn btn-primary">
              New subscription
            </Link>
          </div>
        }
      />
      {fromTemplate && <FromTemplateModal onClose={() => setFromTemplate(false)} />}
    </>
  )
}
