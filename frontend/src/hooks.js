import { useEffect, useState } from 'react'
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
