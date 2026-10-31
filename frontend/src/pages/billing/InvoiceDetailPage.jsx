import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../../api/client'
import { parseApiError } from '../../api/errors'
import { useAuth } from '../../auth/useAuth'
import { Alert, FormField, Modal, StatusBadge } from '../../components/ui'
import { formatDate, formatDateTime, formatMoney } from '../../format'
import { useApiGet, useForm, useSubmit } from '../../hooks'
import { todayIso } from '../subscriptions/labels'
import { INVOICE_ACTION_LABELS, invoiceStatus, PAYMENT_METHODS } from './labels'

function PaymentModal({ invoice, onClose, onSaved }) {
  const { values, onChange } = useForm({
    method: 'bank_transfer',
    amount: invoice.amount_due,
    payment_date: todayIso(),
    note: '',
  })
  const { submit, submitting, error } = useSubmit(async () => {
    await api.post('/payments/', { ...values, invoice: invoice.id })
    onSaved()
  })
  const errors = error?.fields ?? {}

  return (
    <Modal title={`Register payment for ${invoice.number}`} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Alert>{error?.message}</Alert>
        <div className="grid-2">
          <FormField label="Method" error={errors.method}>
            <select name="method" value={values.method} onChange={onChange}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Amount (₹)" error={errors.amount} hint={`Due: ${formatMoney(invoice.amount_due)}`}>
            <input type="number" name="amount" min="0.01" step="0.01" max={invoice.amount_due} value={values.amount} onChange={onChange} required autoFocus />
          </FormField>
        </div>
        <FormField label="Payment date" error={errors.payment_date}>
          <input type="date" name="payment_date" value={values.payment_date} onChange={onChange} required />
        </FormField>
        <FormField label="Note" error={errors.note} hint="For example a UTR, cheque or transaction number">
          <input name="note" value={values.note} onChange={onChange} maxLength={255} />
        </FormField>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function InvoiceDetailPage({ portal = false }) {
  const { id } = useParams()
  const { user } = useAuth()
  const isInternal = user.role !== 'customer'
  const { data: invoice, error, reload } = useApiGet(`/invoices/${id}/`)
  const [busy, setBusy] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [paying, setPaying] = useState(false)

  if (error) return <Alert>{error}</Alert>
  if (!invoice) return <p className="muted">Loading…</p>

  const runAction = async (action) => {
    if (action === 'cancel' && !window.confirm(`Cancel ${invoice.number}? This cannot be undone.`)) return
    setBusy(action)
    setActionError(null)
    setNotice(null)
    try {
      await api.post(`/invoices/${invoice.id}/actions/${action}/`)
      if (action === 'send') setNotice(`Invoice emailed to ${invoice.billing_email}.`)
      reload()
    } catch (err) {
      setActionError(parseApiError(err).message)
    } finally {
      setBusy(null)
    }
  }

  const deletePayment = async (payment) => {
    if (!window.confirm(`Delete the ${formatMoney(payment.amount)} payment?`)) return
    try {
      await api.delete(`/payments/${payment.id}/`)
      reload()
    } catch (err) {
      setActionError(parseApiError(err).message)
    }
  }

  const status = invoiceStatus(invoice)
  const basePath = portal ? '/portal/invoices' : '/app/invoices'
  const canPay = isInternal && invoice.state === 'confirmed'

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <Link to={basePath} className="back-link">
            ← {portal ? 'My invoices' : 'Invoices'}
          </Link>
          <h1 className="title-with-badge">
            {invoice.number} <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </h1>
        </div>
        <div className="button-row">
          <Link to={`/print/invoices/${invoice.id}`} target="_blank" className="btn btn-secondary">
            Print
          </Link>
          {invoice.available_actions.map((action) => (
            <button
              key={action}
              type="button"
              className={`btn ${action === 'cancel' ? 'btn-danger' : action === 'send' ? 'btn-secondary' : 'btn-primary'}`}
              disabled={busy !== null}
              onClick={() => runAction(action)}
            >
              {busy === action ? 'Working…' : INVOICE_ACTION_LABELS[action]}
            </button>
          ))}
          {canPay && (
            <button type="button" className="btn btn-primary" onClick={() => setPaying(true)}>
              Register payment
            </button>
          )}
        </div>
      </div>

      <Alert>{actionError}</Alert>
      <Alert kind="success">{notice}</Alert>

      <div className="card detail-grid">
        <div>
          <span className="detail-label">Bill to</span>
          {invoice.billing_name}
          <span className="muted block">{invoice.billing_email}</span>
          {invoice.billing_address && <span className="muted block pre-wrap">{invoice.billing_address}</span>}
        </div>
        <div>
          <span className="detail-label">Subscription</span>
          {isInternal ? (
            <Link to={`/app/subscriptions/${invoice.subscription}`}>{invoice.subscription_number}</Link>
          ) : (
            <Link to={`/portal/subscriptions/${invoice.subscription}`}>{invoice.subscription_number}</Link>
          )}
          <span className="muted block">{invoice.plan_name}</span>
        </div>
        <div>
          <span className="detail-label">Billing period</span>
          {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
        </div>
        <div>
          <span className="detail-label">Invoice date</span>
          {formatDate(invoice.invoice_date)}
        </div>
        <div>
          <span className="detail-label">Due date</span>
          {formatDate(invoice.due_date)}
        </div>
        {invoice.sent_at && (
          <div>
            <span className="detail-label">Last sent</span>
            {formatDateTime(invoice.sent_at)}
          </div>
        )}
        {invoice.reminder_sent_at && (
          <div>
            <span className="detail-label">Last overdue reminder</span>
            {formatDateTime(invoice.reminder_sent_at)}
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
              <th className="num">Discount</th>
              <th>Taxes</th>
              <th className="num">Tax</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.description}</td>
                <td className="num">{line.quantity}</td>
                <td className="num">{formatMoney(line.unit_price)}</td>
                <td className="num">{Number(line.discount_amount) ? `−${formatMoney(line.discount_amount)}` : '—'}</td>
                <td>{line.tax_label || '—'}</td>
                <td className="num">{formatMoney(line.tax_amount)}</td>
                <td className="num">{formatMoney(line.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {Number(invoice.amount_discount) > 0 && (
              <tr>
                <td colSpan={6} className="num">
                  Discount{invoice.discount_name ? ` (${invoice.discount_name})` : ''}
                </td>
                <td className="num">−{formatMoney(invoice.amount_discount)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={6} className="num">Untaxed amount</td>
              <td className="num">{formatMoney(invoice.amount_untaxed)}</td>
            </tr>
            <tr>
              <td colSpan={6} className="num">Taxes</td>
              <td className="num">{formatMoney(invoice.amount_tax)}</td>
            </tr>
            <tr className="grand-total">
              <td colSpan={6} className="num">Total</td>
              <td className="num">{formatMoney(invoice.amount_total)}</td>
            </tr>
            <tr>
              <td colSpan={6} className="num">Paid</td>
              <td className="num">{formatMoney(invoice.amount_paid)}</td>
            </tr>
            <tr className="grand-total">
              <td colSpan={6} className="num">Amount due</td>
              <td className="num">{formatMoney(invoice.amount_due)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="card scroll-x">
        <h2>Payments</h2>
        {invoice.payments.length === 0 ? (
          <p className="muted spaced">No payments recorded yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Method</th>
                <th>Note</th>
                {isInternal && <th>Recorded by</th>}
                <th className="num">Amount</th>
                {isInternal && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatDate(payment.payment_date)}</td>
                  <td>{payment.method_display}</td>
                  <td>{payment.note || '—'}</td>
                  {isInternal && <td>{payment.recorded_by_name || '—'}</td>}
                  <td className="num">{formatMoney(payment.amount)}</td>
                  {isInternal && (
                    <td className="row-actions">
                      <button type="button" className="btn btn-link" onClick={() => deletePayment(payment)}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {paying && (
        <PaymentModal
          invoice={invoice}
          onClose={() => setPaying(false)}
          onSaved={() => {
            setPaying(false)
            reload()
          }}
        />
      )}
    </section>
  )
}
