import { useCallback, useEffect, useState } from 'react'
import api from './api/client'
import { parseApiError } from './api/errors'

export function useForm(initialValues) {
  const [values, setValues] = useState(initialValues)
  const onChange = (event) => {
    const { name, value, type, checked } = event.target
    setValues((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }
  return { values, setValues, onChange }
}

export function useSubmit(action) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (event) => {
    event?.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(parseApiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return { submit, submitting, error, setError }
}

export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Brightloop` : 'Brightloop Billing'
  }, [title])
}

export function useApiGet(endpoint, params = {}, refreshKey = 0) {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState({ key: null, data: null, error: null })
  const key = JSON.stringify([endpoint, params, reloadKey, refreshKey])

  useEffect(() => {
    const [url, query] = JSON.parse(key)
    if (!url) return undefined
    let cancelled = false
    api
      .get(url, { params: query })
      .then((response) => {
        if (!cancelled) setState({ key, data: response.data, error: null })
      })
      .catch((err) => {
        if (!cancelled) setState((current) => ({ ...current, key, error: parseApiError(err).message }))
      })
    return () => {
      cancelled = true
    }
  }, [key])

  const reload = useCallback(() => setReloadKey((current) => current + 1), [])
  return { data: state.data, error: state.error, loading: state.key !== key, reload }
}

export function useOptions(endpoint, params = {}) {
  const { data } = useApiGet(endpoint, { page_size: 500, ...params })
  return data?.results ?? []
}
