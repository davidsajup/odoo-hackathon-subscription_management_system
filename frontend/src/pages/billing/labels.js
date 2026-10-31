export const INVOICE_STATES = [
  { value: 'draft', label: 'Draft', tone: 'neutral' },
  { value: 'confirmed', label: 'Confirmed', tone: 'info' },
  { value: 'paid', label: 'Paid', tone: 'success' },
  { value: 'cancelled', label: 'Cancelled', tone: 'neutral' },
]

export function invoiceStatus(invoice) {
  if (invoice.is_overdue) return { label: 'Overdue', tone: 'danger' }
  return INVOICE_STATES.find((state) => state.value === invoice.state) ?? { label: invoice.state, tone: 'neutral' }
}

export const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
]

export const INVOICE_ACTION_LABELS = { confirm: 'Confirm', send: 'Send by email', cancel: 'Cancel invoice' }
