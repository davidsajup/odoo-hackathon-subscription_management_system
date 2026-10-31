export const STATES = [
  { value: 'draft', label: 'Draft', tone: 'neutral' },
  { value: 'quotation', label: 'Quotation', tone: 'info' },
  { value: 'confirmed', label: 'Confirmed', tone: 'warning' },
  { value: 'active', label: 'Active', tone: 'success' },
  { value: 'paused', label: 'Paused', tone: 'warning' },
  { value: 'closed', label: 'Closed', tone: 'neutral' },
]

export const stateInfo = (value) => STATES.find((state) => state.value === value) ?? { label: value, tone: 'neutral' }

export const LIFECYCLE = ['draft', 'quotation', 'confirmed', 'active', 'closed']

export const PAYMENT_TERMS = [
  { value: 0, label: 'Due immediately' },
  { value: 15, label: '15 days' },
  { value: 30, label: '30 days' },
  { value: 45, label: '45 days' },
  { value: 60, label: '60 days' },
]

const INTERNAL_ACTION_LABELS = {
  send_quotation: 'Send quotation',
  confirm: 'Confirm',
  activate: 'Activate',
  pause: 'Pause',
  resume: 'Resume',
  renew: 'Renew',
  close: 'Close',
}

export function actionLabel(action, state, isCustomer) {
  if (isCustomer && action === 'confirm') return 'Accept quotation'
  if (isCustomer && action === 'close' && state === 'quotation') return 'Decline quotation'
  if (!isCustomer && action === 'close' && ['draft', 'quotation', 'confirmed'].includes(state)) return 'Cancel'
  return INTERNAL_ACTION_LABELS[action] ?? action
}

export const isDestructive = (action) => action === 'close'

export const EVENT_LABELS = {
  create: 'Created',
  send_quotation: 'Quotation sent',
  confirm: 'Confirmed',
  activate: 'Activated',
  pause: 'Paused',
  resume: 'Resumed',
  renew: 'Renewed',
  close: 'Closed',
  invoice: 'Invoiced',
}

export const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString('en-CA')
}

export const todayIso = () => new Date().toLocaleDateString('en-CA')

export function catalogPrice(products, line) {
  const product = products.find((p) => p.id === Number(line.product))
  if (!product) return 0
  const variant = product.variants.find((v) => v.id === Number(line.variant))
  return Number(variant ? variant.price : product.sales_price)
}

export const toLinePayload = (line, withPrice) => ({
  product: Number(line.product),
  variant: line.variant ? Number(line.variant) : null,
  quantity: Number(line.quantity),
  ...(withPrice && line.unit_price !== '' ? { unit_price: line.unit_price } : {}),
})
