const moneyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
const dateFormatter = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

const compactMoneyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const formatMoney = (value) => (value === null || value === undefined ? '—' : moneyFormatter.format(value))

export const formatCompactMoney = (value) => compactMoneyFormatter.format(Number(value) || 0)

export const formatCount = (value) => new Intl.NumberFormat('en-IN').format(value ?? 0)

export const formatDate = (value) => (value ? dateFormatter.format(new Date(`${value}T00:00:00`)) : '—')

const PERIOD_UNITS = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }
const PERIOD_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }

export function formatBillingPeriod(period, interval = 1) {
  if (interval <= 1) return PERIOD_LABELS[period]
  return `Every ${interval} ${PERIOD_UNITS[period]}s`
}

export function formatDateRange(start, end) {
  return end ? `${formatDate(start)} – ${formatDate(end)}` : `From ${formatDate(start)}`
}

export const fullName = (user) => [user.first_name, user.last_name].filter(Boolean).join(' ')
