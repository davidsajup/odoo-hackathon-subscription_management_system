import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { parseApiError } from '../api/errors'
import { useApiGet, usePageTitle } from '../hooks'
import { Alert, Pagination } from './ui'
import { useToast } from './useToast'

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
  refreshKey = 0,
  notice,
  bulk,
}) {
  usePageTitle(title)
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [draftSearch, setDraftSearch] = useState(null)
  const searchTimer = useRef(null)

  const allFilters = showActiveFilter ? [...filters, ACTIVE_FILTER] : filters
  const page = Math.max(Number(params.get('page')) || 1, 1)
  const urlSearch = params.get('search') ?? ''
  const ordering = params.get('ordering') ?? ''
  const activeFilters = Object.fromEntries(
    allFilters.map((filter) => [filter.name, params.get(filter.name) ?? '']).filter(([, value]) => value !== ''),
  )
  const { data, error, loading, reload } = useApiGet(
    endpoint,
    { page, search: urlSearch || undefined, ordering: ordering || undefined, ...activeFilters },
    refreshKey,
  )
  const rows = data?.results ?? []

  const [selection, setSelection] = useState({ key: null, ids: [] })
  const selectionKey = JSON.stringify([page, urlSearch, ordering, activeFilters, refreshKey])
  const selectedIds = selection.key === selectionKey ? selection.ids : []
  const selectableRows = bulk ? rows.filter(bulk.canSelect) : []
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedIds.includes(row.id))
  const setSelected = (ids) => setSelection({ key: selectionKey, ids })
  const toggleRow = (id) => setSelected(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
  const toggleAll = () => setSelected(allSelected ? [] : selectableRows.map((row) => row.id))

  const updateParams = useCallback(
    (changes, replace = false) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          Object.entries(changes).forEach(([name, value]) => {
            if (value === '' || value === null || value === undefined || (name === 'page' && Number(value) === 1)) {
              next.delete(name)
            } else {
              next.set(name, String(value))
            }
          })
          return next
        },
        { replace },
      ),
    [setParams],
  )

  useEffect(() => () => clearTimeout(searchTimer.current), [])

  const closeForm = useCallback(() => setEditing(null), [])
  const handleSaved = useCallback(() => {
    setEditing(null)
    reload()
  }, [reload])

  const toggleSort = (field) => {
    const next = ordering === field ? `-${field}` : ordering === `-${field}` ? '' : field
    updateParams({ ordering: next, page: 1 })
  }

  const sortState = (field) => (ordering === field ? 'ascending' : ordering === `-${field}` ? 'descending' : 'none')

  const updateSearch = (value) => {
    setDraftSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      updateParams({ search: value, page: 1 }, true)
      setDraftSearch(null)
    }, 300)
  }

  const toggleActive = async (row) => {
    setActionError(null)
    try {
      await api.patch(`${endpoint}${row.id}/`, { is_active: !row.is_active })
      const verb = row.is_active ? toggleLabels[0] : toggleLabels[1]
      toast(`${verb}${verb.endsWith('e') ? 'd' : 'ed'}`)
      reload()
    } catch (err) {
      setActionError(parseApiError(err).message)
    }
  }

  const showActions = canEdit && renderForm
  const columnCount = columns.length + (showActions ? 1 : 0) + (bulk ? 1 : 0)

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
          value={draftSearch ?? urlSearch}
          onChange={(e) => updateSearch(e.target.value)}
        />
        {allFilters.map((filter) => (
          <select
            key={filter.name}
            aria-label={filter.label ?? 'Status'}
            value={params.get(filter.name) ?? ''}
            onChange={(e) => updateParams({ [filter.name]: e.target.value, page: 1 })}
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ))}
      </div>

      {notice}
      <Alert>{error || actionError}</Alert>

      {bulk && selectedIds.length > 0 && (
        <div className="bulk-bar" role="region" aria-label="Bulk actions">
          <strong>{selectedIds.length} selected</strong>
          {bulk.renderBar({ selectedIds })}
          <button type="button" className="btn btn-link" onClick={() => setSelected([])}>
            Clear selection
          </button>
        </div>
      )}

      <div className={`table-wrap${loading && rows.length > 0 ? ' is-loading' : ''}`} aria-busy={loading}>
        <table className="table">
          <thead>
            <tr>
              {bulk && (
                <th className="check-cell">
                  <input
                    type="checkbox"
                    aria-label={bulk.selectAllLabel ?? 'Select all on this page'}
                    checked={allSelected}
                    disabled={selectableRows.length === 0}
                    onChange={toggleAll}
                  />
                </th>
              )}
              {columns.map((column) =>
                column.sort ? (
                  <th key={column.label} className={column.className} aria-sort={sortState(column.sort)}>
                    <button type="button" className="th-sort" onClick={() => toggleSort(column.sort)}>
                      {column.label}
                      <span className="sort-icon" aria-hidden="true">
                        {{ ascending: '▲', descending: '▼', none: '↕' }[sortState(column.sort)]}
                      </span>
                    </button>
                  </th>
                ) : (
                  <th key={column.label} className={column.className}>
                    {column.label}
                  </th>
                ),
              )}
              {showActions && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={[onRowClick && 'clickable', selectedIds.includes(row.id) && 'selected'].filter(Boolean).join(' ') || undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => event.key === 'Enter' && event.target === event.currentTarget && onRowClick(row)
                    : undefined
                }
              >
                {bulk && (
                  <td className="check-cell" onClick={(e) => e.stopPropagation()}>
                    {bulk.canSelect(row) && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.number ?? row.id}`}
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleRow(row.id)}
                      />
                    )}
                  </td>
                )}
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
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="empty">
                  Loading…
                </td>
              </tr>
            )}
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

      <Pagination page={page} count={data?.count ?? 0} onChange={(next) => updateParams({ page: next })} />

      {editing && renderForm({ item: editing, onClose: closeForm, onSaved: handleSaved })}
    </section>
  )
}
