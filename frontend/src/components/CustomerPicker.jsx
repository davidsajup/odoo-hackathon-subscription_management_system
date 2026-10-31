import { useState } from 'react'
import { useApiGet, useDebouncedValue } from '../hooks'

const customerLabel = (customer) =>
  customer.company_name ? `${customer.company_name} (${customer.email})` : customer.email

export default function CustomerPicker({ initial = null, onChange, autoFocus = false }) {
  const [selected, setSelected] = useState(initial)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const debouncedQuery = useDebouncedValue(query, 250)
  const { data, loading } = useApiGet(open ? '/users/customers/' : null, {
    search: debouncedQuery || undefined,
    is_active: true,
    page_size: 10,
  })
  const results = data?.results ?? []

  const choose = (customer) => {
    setSelected(customer)
    setQuery('')
    setOpen(false)
    onChange(customer.id)
  }

  return (
    <div className="picker" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        placeholder={selected ? customerLabel(selected) : 'Search by company, name or email'}
        className={selected && !open ? 'picker-has-value' : undefined}
        value={open ? query : selected ? customerLabel(selected) : ''}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' && open && results.length) {
            e.preventDefault()
            choose(results[0])
          }
        }}
      />
      {open && (
        <ul className="picker-list" role="listbox">
          {results.map((customer) => (
            <li key={customer.id}>
              <button type="button" role="option" aria-selected={selected?.id === customer.id} onClick={() => choose(customer)}>
                <span>{customer.company_name || customer.email}</span>
                {customer.company_name && <span className="muted">{customer.email}</span>}
              </button>
            </li>
          ))}
          {!loading && results.length === 0 && <li className="picker-empty">No matching customers</li>}
          {data && data.count > results.length && (
            <li className="picker-empty">{data.count - results.length} more — keep typing to narrow down</li>
          )}
        </ul>
      )}
    </div>
  )
}
