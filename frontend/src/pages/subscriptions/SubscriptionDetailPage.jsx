import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../../api/client'
import { parseApiError } from '../../api/errors'
import { useAuth } from '../../auth/useAuth'
import { Alert, StatusBadge } from '../../components/ui'
import { formatBillingPeriod, formatDate, formatDateTime, formatMoney, fullName } from '../../format'
import { useApiGet } from '../../hooks'
import { invoiceStatus } from '../billing/labels'
import { actionLabel, EVENT_LABELS, isDestructive, LIFECYCLE, PAYMENT_TERMS, stateInfo } from './labels'

function StatusBar({ state }) {
  const currentIndex = LIFECYCLE.indexOf(state === 'paused' ? 'active' : state)
  return (
    <ol className="status-bar">
      {LIFECYCLE.map((step, index) => (
        <li key={step} className={index < currentIndex ? 'done' : index === currentIndex ? 'current' : ''}>
          {step === 'active' && state === 'paused' ? 'Paused' : stateInfo(step).label}
        </li>
      ))}
    </ol>
  )
}

function SubscriptionInvoices({ subscriptionId, portal, refreshKey }) {
  const { data } = useApiGet('/invoices/', { subscription: subscriptionId, page_size: 100 }, refreshKey)
  const invoices = data?.results ?? []
  const base = portal ? '/portal/invoices' : '/app/invoices'
  return (
    <div className="card scroll-x">
      <h2>Invoices</h2>
      {invoices.length === 0 ? (
        <p className="muted spaced">No invoices yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Date</th>
              <th>Due</th>
              <th className="num">Total</th>
              <th className="num">Amount due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => {
              const status = invoiceStatus(invoice)
              return (
                <tr key={invoice.id}>
                  <td>
                    <Link to={`${base}/${invoice.id}`}>{invoice.number}</Link>
                  </td>
                  <td>{formatDate(invoice.invoice_date)}</td>
                  <td>{formatDate(invoice.due_date)}</td>
                  <td className="num">{formatMoney(invoice.amount_total)}</td>
                  <td className="num">{formatMoney(invoice.amount_due)}</td>
                  <td>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Detail({ label, children }) {
  return (
    <div>
      <span className="detail-label">{label}</span>
      {children}
    </div>
  )
}

export default function SubscriptionDetailPage({ portal = false }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isCustomer = user.role === 'customer'
  const basePath = portal ? '/portal/subscriptions' : '/app/subscriptions'
  const { data: subscription, error, reload } = useApiGet(`/subscriptions/${id}/`)
  const [busy, setBusy] = useState(null)
  const [actionError, setActionError] = useState(null)

  if (error) return <Alert>{error}</Alert>
  if (!subscription) return <p className="muted">Loading…</p>

  const runAction = async (action) => {
    const label = actionLabel(action, subscription.state, isCustomer)
    if (isDestructive(action) && !window.confirm(`${label} ${subscription.number}? This cannot be undone.`)) return
    setBusy(action)
    setActionError(null)
    try {
      await api.post(`/subscriptions/${subscription.id}/actions/${action}/`)
      reload()
    } catch (err) {
      setActionError(parseApiError(err).message)
    } finally {
      setBusy(null)
    }
  }

  const createInvoice = async () => {
    setBusy('invoice')
    setActionError(null)
    try {
      const response = await api.post(`/subscriptions/${subscription.id}/invoice/`)
      navigate(`/app/invoices/${response.data.id}`)
    } catch (err) {
      setActionError(parseApiError(err).message)
      setBusy(null)
    }
  }

  const deleteDraft = async () => {
    if (!window.confirm(`Delete draft ${subscription.number}?`)) return
    try {
      await api.delete(`/subscriptions/${subscription.id}/`)
      navigate(basePath)
    } catch (err) {
      setActionError(parseApiError(err).message)
    }
  }

  const customer = subscription.customer_detail
  const plan = subscription.plan_detail
  const state = stateInfo(subscription.state)
  const editable = !isCustomer && ['draft', 'quotation'].includes(subscription.state)
  const terms = PAYMENT_TERMS.find((term) => term.value === subscription.payment_terms_days)?.label ?? `${subscription.payment_terms_days} days`
  const planRules = [
    plan.auto_close && 'closes automatically at expiry',
    plan.closable && 'can be closed early',
    plan.pausable && 'can be paused',
    plan.renewable && 'can be renewed',
  ].filter(Boolean)

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <Link to={basePath} className="back-link">
            ← {portal ? 'My subscriptions' : 'Subscriptions'}
          </Link>
          <h1 className="title-with-badge">
            {subscription.number} <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
          </h1>
        </div>
        <div className="button-row">
          {editable && (
            <Link to={`/app/subscriptions/${subscription.id}/edit`} className="btn btn-secondary">
              Edit
            </Link>
          )}
          {!isCustomer && subscription.state === 'draft' && (
            <button type="button" className="btn btn-secondary" onClick={deleteDraft}>
              Delete
            </button>
          )}
          {subscription.can_invoice && (
            <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={createInvoice}>
              {busy === 'invoice' ? 'Invoicing…' : 'Create invoice'}
            </button>
          )}
          {subscription.available_actions.map((action) => (
            <button
              key={action}
              type="button"
              className={`btn ${isDestructive(action) ? 'btn-danger' : 'btn-primary'}`}
              disabled={busy !== null}
              onClick={() => runAction(action)}
            >
              {busy === action ? 'Working…' : actionLabel(action, subscription.state, isCustomer)}
            </button>
          ))}
        </div>
      </div>

      <StatusBar state={subscription.state} />
      <Alert>{actionError}</Alert>
      {subscription.state === 'quotation' && subscription.quotation_valid_until && (
        <Alert kind="info">Quotation valid until {formatDate(subscription.quotation_valid_until)}.</Alert>
      )}

      <div className="card detail-grid">
        {!portal && (
          <Detail label="Customer">
            {customer.company_name || fullName(customer) || customer.email}
            <span className="muted block">{customer.email}</span>
          </Detail>
        )}
        <Detail label="Plan">
          {plan.name}
          <span className="muted block">{formatBillingPeriod(plan.billing_period, plan.billing_interval)}</span>
        </Detail>
        <Detail label="Start date">{formatDate(subscription.start_date)}</Detail>
        <Detail label="Expiry date">{formatDate(subscription.expiry_date)}</Detail>
        <Detail label="Next invoice">{formatDate(subscription.next_invoice_date)}</Detail>
        <Detail label="Payment terms">{terms}</Detail>
        {subscription.template_name && <Detail label="Template">{subscription.template_name}</Detail>}
        <Detail label="Plan rules">{planRules.join(', ') || '—'}</Detail>
        {subscription.notes && (
          <div className="detail-wide">
            <span className="detail-label">Notes</span>
            {subscription.notes}
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="num">Qty</th>
              <th className="num">Unit price</th>
              <th>Taxes</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {subscription.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  {line.description}
                  {line.line_type === 'plan' && <span className="muted"> · plan</span>}
                </td>
                <td className="num">{line.quantity}</td>
                <td className="num">{formatMoney(line.unit_price)}</td>
                <td>{line.tax_details.map((tax) => tax.name).join(', ') || '—'}</td>
                <td className="num">{formatMoney(line.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="num">Untaxed amount</td>
              <td className="num">{formatMoney(subscription.amount_untaxed)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="num">Taxes</td>
              <td className="num">{formatMoney(subscription.amount_tax)}</td>
            </tr>
            <tr className="grand-total">
              <td colSpan={4} className="num">Total per billing period</td>
              <td className="num">{formatMoney(subscription.amount_total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <SubscriptionInvoices subscriptionId={subscription.id} portal={portal} refreshKey={subscription.next_invoice_date} />

      <div className="card">
        <h2>History</h2>
        <ul className="timeline">
          {subscription.events.map((event) => (
            <li key={event.id}>
              <strong>{EVENT_LABELS[event.action] ?? event.action}</strong>
              <span className="muted">
                {' '}
                by {event.user_name} · {formatDateTime(event.created_at)}
              </span>
              {event.note && <div className="muted">{event.note}</div>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
