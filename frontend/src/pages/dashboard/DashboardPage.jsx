import { useState } from 'react'
import { Link } from 'react-router-dom'
import RevenueChart from '../../components/RevenueChart'
import { Alert, StatTile, StatusBadge } from '../../components/ui'
import { formatCompactMoney, formatCount, formatDate, formatMoney } from '../../format'
import { useApiGet, useOptions } from '../../hooks'
import { addDays, STATES, todayIso } from '../subscriptions/labels'

function presetRange(preset) {
  const today = todayIso()
  const [year, month] = today.split('-')
  switch (preset) {
    case 'last_30':
      return { date_from: addDays(today, -29), date_to: today }
    case 'last_90':
      return { date_from: addDays(today, -89), date_to: today }
    case 'this_year':
      return { date_from: `${year}-01-01`, date_to: today }
    default:
      return { date_from: `${year}-${month}-01`, date_to: today }
  }
}

const PRESETS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
]

function SubscriptionStates({ byState, total }) {
  return (
    <ul className="state-bars">
      {STATES.map((state) => {
        const count = byState[state.value] ?? 0
        return (
          <li key={state.value}>
            <span className="state-name">{state.label}</span>
            <span className="state-track">
              <span className="state-fill" style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
            </span>
            <span className="state-count">{formatCount(count)}</span>
          </li>
        )
      })}
    </ul>
  )
}

export default function DashboardPage() {
  const [preset, setPreset] = useState('this_month')
  const [custom, setCustom] = useState(presetRange('this_month'))
  const [plan, setPlan] = useState('')
  const plans = useOptions('/catalog/plans/')
  const range = preset === 'custom' ? custom : presetRange(preset)
  const planParam = plan ? { plan } : {}

  const { data: summary, error } = useApiGet('/reports/summary/', { ...range, ...planParam })
  const { data: trend } = useApiGet('/reports/revenue-trend/', { months: 12, ...planParam })
  const { data: overdue } = useApiGet('/invoices/', { overdue: 'true', ordering: 'due_date', page_size: 8 })

  const totalSubscriptions = summary ? Object.values(summary.subscriptions.by_state).reduce((a, b) => a + b, 0) : 0

  return (
    <section className="stack">
      <div className="page-header">
        <h1>Finance dashboard</h1>
      </div>

      <div className="toolbar dashboard-filters">
        <select aria-label="Period" value={preset} onChange={(e) => setPreset(e.target.value)}>
          {PRESETS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {preset === 'custom' && (
          <>
            <input
              type="date"
              aria-label="From"
              value={custom.date_from}
              onChange={(e) => setCustom((current) => ({ ...current, date_from: e.target.value }))}
            />
            <input
              type="date"
              aria-label="To"
              value={custom.date_to}
              onChange={(e) => setCustom((current) => ({ ...current, date_to: e.target.value }))}
            />
          </>
        )}
        <select aria-label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">All plans</option>
          {plans.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <span className="muted filter-note">
          {formatDate(range.date_from)} – {formatDate(range.date_to)}
        </span>
      </div>

      <Alert>{error}</Alert>

      {summary && (
        <>
          <div className="stat-grid">
            <StatTile
              label="Active subscriptions"
              value={formatCount(summary.subscriptions.active)}
              detail={`${summary.subscriptions.new_in_period} new · ${summary.subscriptions.closed_in_period} closed in period`}
              to="/app/subscriptions"
            />
            <StatTile label="Monthly recurring revenue" value={formatCompactMoney(summary.mrr)} detail={`${formatMoney(summary.mrr)} before tax`} />
            <StatTile
              label="Invoiced in period"
              value={formatCompactMoney(summary.invoiced.total)}
              detail={`${formatCount(summary.invoiced.count)} invoices`}
              to="/app/invoices"
            />
            <StatTile
              label="Collected in period"
              value={formatCompactMoney(summary.collected.total)}
              detail={`${formatCount(summary.collected.count)} payments`}
              to="/app/payments"
            />
            <StatTile
              label="Outstanding"
              value={formatCompactMoney(summary.outstanding.total)}
              detail={`${formatCount(summary.outstanding.count)} unpaid invoices`}
              to="/app/invoices"
            />
            <StatTile
              label="Overdue"
              value={formatCompactMoney(summary.overdue.total)}
              detail={
                summary.overdue.count ? (
                  <StatusBadge tone="danger">⚠ {formatCount(summary.overdue.count)} overdue</StatusBadge>
                ) : (
                  'Nothing overdue'
                )
              }
              to="/app/invoices"
            />
          </div>

          {summary.draft_invoices > 0 && (
            <Alert kind="info">
              {formatCount(summary.draft_invoices)} draft invoice{summary.draft_invoices === 1 ? ' is' : 's are'} waiting to be
              confirmed. <Link to="/app/invoices">Review invoices</Link>
            </Alert>
          )}

          <div className="card">
            <h2>Invoiced vs collected, last 12 months</h2>
            {trend ? <RevenueChart rows={trend} /> : <p className="muted spaced">Loading…</p>}
          </div>

          <div className="dashboard-columns">
            <div className="card scroll-x">
              <h2>Revenue by plan</h2>
              <p className="muted">Invoiced before tax, {formatDate(range.date_from)} – {formatDate(range.date_to)}</p>
              <table className="table spaced">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th className="num">Invoices</th>
                    <th className="num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.revenue_by_plan.map((row) => (
                    <tr key={row.plan}>
                      <td>{row.plan}</td>
                      <td className="num">{formatCount(row.invoices)}</td>
                      <td className="num">{formatMoney(row.revenue)}</td>
                    </tr>
                  ))}
                  {summary.revenue_by_plan.length === 0 && (
                    <tr>
                      <td colSpan={3} className="empty">
                        No invoices in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h2>Subscriptions by status</h2>
              <p className="muted">{formatCount(totalSubscriptions)} in total</p>
              <SubscriptionStates byState={summary.subscriptions.by_state} total={totalSubscriptions} />
            </div>
          </div>
        </>
      )}

      <div className="card scroll-x">
        <div className="page-header">
          <h2>Overdue invoices to chase</h2>
          <Link to="/app/invoices">All invoices</Link>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Due</th>
              <th className="num">Days late</th>
              <th className="num">Amount due</th>
            </tr>
          </thead>
          <tbody>
            {(overdue?.results ?? []).map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  <Link to={`/app/invoices/${invoice.id}`}>{invoice.number}</Link>
                </td>
                <td>{invoice.billing_name}</td>
                <td>{formatDate(invoice.due_date)}</td>
                <td className="num">
                  {Math.round((new Date(`${todayIso()}T00:00:00`) - new Date(`${invoice.due_date}T00:00:00`)) / 86400000)}
                </td>
                <td className="num">{formatMoney(invoice.amount_due)}</td>
              </tr>
            ))}
            {overdue && overdue.results.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  Nothing is overdue.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
