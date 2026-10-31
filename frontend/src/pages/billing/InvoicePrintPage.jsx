import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Alert } from '../../components/ui'
import { formatDate, formatMoney } from '../../format'
import { useApiGet } from '../../hooks'
import { invoiceStatus } from './labels'

export default function InvoicePrintPage() {
  const { id } = useParams()
  const { data: invoice, error } = useApiGet(`/invoices/${id}/`)

  useEffect(() => {
    if (!invoice) return undefined
    document.title = invoice.number
    const timer = setTimeout(() => window.print(), 300)
    return () => clearTimeout(timer)
  }, [invoice])

  if (error) return <Alert>{error}</Alert>
  if (!invoice) return <p className="muted">Loading…</p>

  return (
    <div className="print-page">
      <div className="print-actions no-print">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <header className="print-header">
        <div className="brand">
          <span className="brand-mark">B</span> Brightloop Software
        </div>
        <div className="print-title">
          <h1>Invoice {invoice.number}</h1>
          <span>{invoiceStatus(invoice).label}</span>
        </div>
      </header>

      <div className="print-meta">
        <div>
          <strong>Bill to</strong>
          <div>{invoice.billing_name}</div>
          <div>{invoice.billing_email}</div>
          <div className="pre-wrap">{invoice.billing_address}</div>
        </div>
        <div>
          <div>
            <strong>Invoice date:</strong> {formatDate(invoice.invoice_date)}
          </div>
          <div>
            <strong>Due date:</strong> {formatDate(invoice.due_date)}
          </div>
          <div>
            <strong>Period:</strong> {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
          </div>
          <div>
            <strong>Subscription:</strong> {invoice.subscription_number} ({invoice.plan_name})
          </div>
        </div>
      </div>

      <table className="print-table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="num">Qty</th>
            <th className="num">Unit price</th>
            <th className="num">Discount</th>
            <th>Taxes</th>
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
              <td className="num">{formatMoney(line.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="print-totals">
        <tbody>
          <tr>
            <td>Untaxed amount</td>
            <td className="num">{formatMoney(invoice.amount_untaxed)}</td>
          </tr>
          <tr>
            <td>Taxes</td>
            <td className="num">{formatMoney(invoice.amount_tax)}</td>
          </tr>
          <tr className="strong">
            <td>Total</td>
            <td className="num">{formatMoney(invoice.amount_total)}</td>
          </tr>
          <tr>
            <td>Paid</td>
            <td className="num">{formatMoney(invoice.amount_paid)}</td>
          </tr>
          <tr className="strong">
            <td>Amount due</td>
            <td className="num">{formatMoney(invoice.amount_due)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
