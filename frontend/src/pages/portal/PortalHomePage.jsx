import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { Alert, StatTile, StatusBadge } from '../../components/ui'
import { formatCount, formatDate, formatMoney } from '../../format'
import { useApiGet } from '../../hooks'
import { invoiceStatus } from '../billing/labels'

export default function PortalHomePage() {
  const { user } = useAuth()
  const { data: summary, error } = useApiGet('/reports/my-summary/')
  const { data: invoices } = useApiGet('/invoices/', { page_size: 5 })

  return (
    <section className="stack">
      <h1>Welcome{user.first_name ? `, ${user.first_name}` : ''}</h1>
      <Alert>{error}</Alert>

      {summary && (
        <>
          {summary.quotations_to_review > 0 && (
            <Alert kind="info">
              You have {summary.quotations_to_review} quotation{summary.quotations_to_review === 1 ? '' : 's'} waiting for
              your answer. <Link to="/portal/subscriptions">Review them</Link>
            </Alert>
          )}
          <div className="stat-grid">
            <StatTile
              label="Active subscriptions"
              value={formatCount(summary.active_subscriptions)}
              detail={summary.paused_subscriptions ? `${summary.paused_subscriptions} paused` : null}
              to="/portal/subscriptions"
            />
            <StatTile
              label="Amount due"
              value={formatMoney(summary.amount_due.total)}
              detail={`${formatCount(summary.amount_due.count)} unpaid invoice${summary.amount_due.count === 1 ? '' : 's'}`}
              to="/portal/invoices"
            />
            <StatTile
              label="Overdue"
              value={formatMoney(summary.overdue.total)}
              detail={
                summary.overdue.count ? (
                  <StatusBadge tone="danger">⚠ {summary.overdue.count} overdue</StatusBadge>
                ) : (
                  'Nothing overdue'
                )
              }
              to="/portal/invoices"
            />
            <StatTile label="Next invoice" value={formatDate(summary.next_invoice_date)} />
          </div>
        </>
      )}

      <div className="card">
        <div className="page-header">
          <h2>Recent invoices</h2>
          <Link to="/portal/invoices">All invoices</Link>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Due</th>
              <th className="num">Amount due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(invoices?.results ?? []).map((invoice) => {
              const status = invoiceStatus(invoice)
              return (
                <tr key={invoice.id}>
                  <td>
                    <Link to={`/portal/invoices/${invoice.id}`}>{invoice.number}</Link>
                  </td>
                  <td>{formatDate(invoice.invoice_date)}</td>
                  <td>{formatDate(invoice.due_date)}</td>
                  <td className="num">{formatMoney(invoice.amount_due)}</td>
                  <td>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </td>
                </tr>
              )
            })}
            {invoices && invoices.results.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No invoices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
