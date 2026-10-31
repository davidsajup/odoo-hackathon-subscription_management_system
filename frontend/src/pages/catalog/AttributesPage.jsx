import { useCallback, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import ResourceFormModal from '../../components/ResourceFormModal'
import { Alert, FormField } from '../../components/ui'
import { formatMoney } from '../../format'
import { useApiGet } from '../../hooks'

const ENDPOINT = '/catalog/attributes/'

function AttributeForm(props) {
  return (
    <ResourceFormModal
      endpoint={ENDPOINT}
      noun="attribute"
      defaults={{ name: '', values: [{ name: '', extra_price: '0' }] }}
      toPayload={(values) => ({
        name: values.name,
        values: values.values
          .filter((value) => value.name.trim())
          .map(({ id, name, extra_price }) => ({ id, name, extra_price: extra_price || '0' })),
      })}
      {...props}
    >
      {({ values, setValues, onChange, errors }) => {
        const updateValue = (index, field, value) =>
          setValues((current) => ({
            ...current,
            values: current.values.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
          }))
        const removeValue = (index) =>
          setValues((current) => ({ ...current, values: current.values.filter((_, i) => i !== index) }))
        const addValue = () =>
          setValues((current) => ({ ...current, values: [...current.values, { name: '', extra_price: '0' }] }))

        return (
          <>
            <FormField label="Attribute name" error={errors.name}>
              <input name="name" value={values.name} onChange={onChange} required autoFocus placeholder="Brand" />
            </FormField>
            <div className="field">
              <span className="field-label">Values</span>
              <div className="value-rows">
                {values.values.map((row, index) => (
                  <div key={row.id ?? `new-${index}`} className="value-row">
                    <input
                      aria-label="Value name"
                      placeholder="Odoo"
                      value={row.name}
                      onChange={(e) => updateValue(index, 'name', e.target.value)}
                    />
                    <input
                      aria-label="Extra price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.extra_price}
                      onChange={(e) => updateValue(index, 'extra_price', e.target.value)}
                    />
                    <button type="button" className="btn-icon" aria-label="Remove value" onClick={() => removeValue(index)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <span className="field-hint">Name and extra price added to the product price when this value is chosen.</span>
              {errors.values && <span className="field-error">{errors.values}</span>}
              <button type="button" className="btn btn-secondary btn-sm align-start" onClick={addValue}>
                Add value
              </button>
            </div>
          </>
        )
      }}
    </ResourceFormModal>
  )
}

export default function AttributesPage() {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const { data, error, reload } = useApiGet(ENDPOINT, { page_size: 500 })
  const [editing, setEditing] = useState(null)
  const close = useCallback(() => setEditing(null), [])

  return (
    <section>
      <div className="page-header">
        <h1>Attributes</h1>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>
            Add attribute
          </button>
        )}
      </div>
      <p className="muted page-intro">
        Attributes such as Brand or Edition define product variants. Each value can add an extra amount to the price.
      </p>
      <Alert>{error}</Alert>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Attribute</th>
              <th>Values</th>
              {isAdmin && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {(data?.results ?? []).map((attribute) => (
              <tr key={attribute.id}>
                <td>{attribute.name}</td>
                <td className="wrap">
                  {attribute.values.map((value) => (
                    <span key={value.id} className="chip">
                      {value.name}
                      {Number(value.extra_price) > 0 && <em> +{formatMoney(value.extra_price)}</em>}
                    </span>
                  ))}
                </td>
                {isAdmin && (
                  <td className="row-actions">
                    <button type="button" className="btn btn-link" onClick={() => setEditing(attribute)}>
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {data && data.results.length === 0 && (
              <tr>
                <td colSpan={3} className="empty">
                  No attributes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <AttributeForm
          item={editing}
          onClose={close}
          onSaved={() => {
            close()
            reload()
          }}
        />
      )}
    </section>
  )
}
