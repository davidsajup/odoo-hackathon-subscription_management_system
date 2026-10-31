import { StatusBadge } from './ui'

export const activeColumn = (labels = ['Active', 'Archived']) => ({
  label: 'Status',
  render: (row) => (
    <StatusBadge tone={row.is_active ? 'success' : 'neutral'}>{row.is_active ? labels[0] : labels[1]}</StatusBadge>
  ),
})
