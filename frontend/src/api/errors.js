export function parseApiError(error) {
  if (!error.response) {
    return { message: 'Cannot reach the server. Is the backend running?', fields: {} }
  }
  const data = error.response.data
  if (!data || typeof data !== 'object') {
    return { message: 'Something went wrong. Please try again.', fields: {} }
  }

  const { detail, non_field_errors: nonField, ...rest } = data
  const fields = Object.fromEntries(
    Object.entries(rest).map(([name, value]) => [name, Array.isArray(value) ? value.join(' ') : String(value)]),
  )
  const message =
    detail ??
    nonField?.join(' ') ??
    (Object.keys(fields).length ? 'Please fix the highlighted fields.' : 'Something went wrong. Please try again.')
  return { message, fields }
}
