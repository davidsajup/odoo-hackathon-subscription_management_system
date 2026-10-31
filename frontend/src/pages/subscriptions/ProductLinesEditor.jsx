import { formatMoney } from '../../format'
import { catalogPrice } from './labels'

const emptyLine = () => ({ product: '', variant: '', quantity: 1, unit_price: '' })

export default function ProductLinesEditor({ lines, onChange, products, editablePrice = false, error }) {
  const update = (index, changes) => onChange(lines.map((line, i) => (i === index ? { ...line, ...changes } : line)))
  const remove = (index) => onChange(lines.filter((_, i) => i !== index))

  return (
    <div className="field">
      <span className="field-label">Products and add-ons</span>
      {lines.length > 0 && (
        <div className="table-wrap">
          <table className="table line-editor">
            <thead>
              <tr>
                <th>Product</th>
                <th>Variant</th>
                <th className="num">Qty</th>
                {editablePrice && <th className="num">Unit price</th>}
                {editablePrice && <th className="num">Amount</th>}
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const product = products.find((p) => p.id === Number(line.product))
                const variants = product?.variants.filter((v) => v.is_active || v.id === Number(line.variant)) ?? []
                const listPrice = catalogPrice(products, line)
                const unitPrice = line.unit_price === '' ? listPrice : Number(line.unit_price)
                return (
                  <tr key={index}>
                    <td>
                      <select
                        aria-label="Product"
                        value={line.product}
                        required
                        onChange={(e) => update(index, { product: e.target.value, variant: '', unit_price: '' })}
                      >
                        <option value="">Choose…</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label="Variant"
                        value={line.variant ?? ''}
                        disabled={variants.length === 0}
                        onChange={(e) => update(index, { variant: e.target.value, unit_price: '' })}
                      >
                        <option value="">{variants.length ? 'Base product' : '—'}</option>
                        {variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num">
                      <input
                        aria-label="Quantity"
                        type="number"
                        min="1"
                        className="input-qty"
                        value={line.quantity}
                        onChange={(e) => update(index, { quantity: e.target.value })}
                        required
                      />
                    </td>
                    {editablePrice && (
                      <td className="num">
                        <input
                          aria-label="Unit price"
                          type="number"
                          min="0"
                          step="0.01"
                          className="input-price"
                          placeholder={listPrice.toFixed(2)}
                          value={line.unit_price}
                          onChange={(e) => update(index, { unit_price: e.target.value })}
                        />
                      </td>
                    )}
                    {editablePrice && <td className="num">{formatMoney(unitPrice * (Number(line.quantity) || 0))}</td>}
                    <td>
                      <button type="button" className="btn-icon" aria-label="Remove line" onClick={() => remove(index)}>
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {error && <span className="field-error">{error}</span>}
      <button type="button" className="btn btn-secondary btn-sm align-start" onClick={() => onChange([...lines, emptyLine()])}>
        Add product
      </button>
    </div>
  )
}
