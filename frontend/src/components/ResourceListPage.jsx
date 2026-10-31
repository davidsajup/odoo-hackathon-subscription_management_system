import { useCallback, useState } from 'react'
import api from '../api/client'
import { parseApiError } from '../api/errors'
import { useApiGet, useDebouncedValue } from '../hooks'
import { Alert, Pagination } from './ui'

const ACTIVE_FILTER = {
  name: 'is_active',
  options: [
    { value: '', label: 'All statuses' },
    { value: 'true', label: 'Active' },
    { value: 'false', label: 'Archived' },
  ],
}

export default function ResourceListPage({
  title,
  noun,
  endpoint,
  columns,
  filters = [],
  searchPlaceholder = 'Search',
  canEdit = false,
  toggleLabels = ['Archive', 'Restore'],
  renderForm,
  onRowClick,
  headerActions,
  showActiveFilter = true,
}) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterValues, setFilterValues] = useState({})
  const [editing, setEditing] = useState(null)
  const [actionError, setActionError] = useState(null)
  const debouncedSearch = useDebouncedValue(search)

  const activeFilters = Object.fromEntries(Object.entries(filterValues).filter(([, value]) => value !== ''))
  const { data, error, loading, reload } = useApiGet(endpoint, {
    page,
    search: debouncedSearch || undefined,
    ...activeFilters,
  })
  const rows = data?.results ?? []

  const closeForm = useCallback(() => setEditing(null), [])
  const handleSaved = useCallback(() => {
    setEditing(null)
    reload()
  }, [reload])

  const updateFilter = (name, value) => {
    setFilterValues((current) => ({ ...current, [name]: value }))
    setPage(1)
  }

  const toggleActive = async (row) => {
    setActionError(null)
    try {
      await api.patch(`${endpoint}${row.id}/`, { is_active: !row.is_active })
      reload()
    } catch (err) {
      setActionError(parseApiError(err).message)
    }
  }

  const showActions = canEdit && renderForm
  const columnCount = columns.length + (showActions ? 1 : 0)

  return (
    <section>
      <div className="page-header">
        <h1>{title}</h1>
        {headerActions ??
          (showActions && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>
              Add {noun}
            </button>
          ))}
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
        {(showActiveFilter ? [...filters, ACTIVE_FILTER] : filters).map((filter) => (
          <select
            key={filter.name}
            aria-label={filter.label ?? 'Status'}
            value={filterValues[filter.name] ?? ''}
            onChange={(e) => updateFilter(filter.name, e.target.value)}
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ))}
      </div>

      <Alert>{error || actionError}</Alert>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.label}>{column.label}</th>
              ))}
              {showActions && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={onRowClick ? 'clickable' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.label} className={column.className}>
                    {column.render ? column.render(row) : (row[column.key] ?? '—')}
                  </td>
                ))}
                {showActions && (
                  <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-link" onClick={() => setEditing(row)}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-link" onClick={() => toggleActive(row)}>
                      {row.is_active ? toggleLabels[0] : toggleLabels[1]}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="empty">
                  No {title.toLowerCase()} found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} count={data?.count ?? 0} onChange={setPage} />

      {editing && renderForm({ item: editing, onClose: closeForm, onSaved: handleSaved })}
    </section>
  )
}
