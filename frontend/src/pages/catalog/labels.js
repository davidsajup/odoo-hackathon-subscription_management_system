import { formatMoney } from '../../format'

export const PRODUCT_TYPES = [
  { value: 'service', label: 'Service' },
  { value: 'addon', label: 'Add-on' },
  { value: 'goods', label: 'Goods' },
]

export const productTypeLabel = (value) => PRODUCT_TYPES.find((type) => type.value === value)?.label ?? value

export const formatTax = (tax) =>
  tax.tax_type === 'percent' ? `${Number(tax.amount)}%` : `${formatMoney(tax.amount)} / unit`

export const formatDiscountValue = (discount) =>
  discount.discount_type === 'percent' ? `${Number(discount.value)}%` : formatMoney(discount.value)

export const BILLING_PERIODS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]
