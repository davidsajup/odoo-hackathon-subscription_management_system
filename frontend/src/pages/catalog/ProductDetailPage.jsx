import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../../api/client'
import { parseApiError } from '../../api/errors'
import { useAuth } from '../../auth/useAuth'
import ResourceFormModal from '../../components/ResourceFormModal'
import { Alert, FormField, StatusBadge } from '../../components/ui'
import { formatMoney } from '../../format'
import { useApiGet, useOptions, usePageTitle } from '../../hooks'
import { formatTax, productTypeLabel } from './labels'
import { ProductForm } from './ProductsPage'

function VariantForm({ product, attributes, onClose, onSaved }) {
  const extraFor = (values) =>
    attributes.flatMap((attribute) => attribute.values).filter((value) => values.includes(value.id))
      .reduce((sum, value) => sum + Number(value.extra_price), 0)

  return (
    <ResourceFormModal
      endpoint="/catalog/variants/"
      noun="variant"
      item={{}}
      defaults={{ product: product.id, picks: {} }}
      toPayload={(values) => ({ product: product.id, values: Object.values(values.picks).filter(Boolean).map(Number) })}
      onClose={onClose}
      onSaved={onSaved}
    >
      {({ values, setValues, errors }) => {
        const chosen = Object.values(values.picks).filter(Boolean).map(Number)
        return (
          <>
            {attributes.length === 0 && (
              <p className="muted">
                No attributes yet. Create one (for example &quot;Brand&quot;) on the <Link to="/app/attributes">Attributes</Link>{' '}
                page first.
              </p>
            )}
            {attributes.map((attribute) => (
              <FormField key={attribute.id} label={attribute.name}>
                <select
                  value={values.picks[attribute.id] ?? ''}
                  onChange={(e) =>
                    setValues((current) => ({ ...current, picks: { ...current.picks, [attribute.id]: e.target.value } }))
                  }
                >
                  <option value="">— None —</option>
                  {attribute.values.map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.name}
                      {Number(value.extra_price) ? ` (+${formatMoney(value.extra_price)})` : ''}
                    </option>
                  ))}
                </select>
              </FormField>
            ))}
            {errors.values && <Alert>{errors.values}</Alert>}
            <div className="price-preview">
              <span>Variant price</span>
              <strong>{formatMoney(Number(product.sales_price) + extraFor(chosen))}</strong>
            </div>
          </>
        )
      }}
    </ResourceFormModal>
  )
}

export default function ProductDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const { data: product, error, reload } = useApiGet(`/catalog/products/${id}/`)
  const attributes = useOptions('/catalog/attributes/')
  usePageTitle(product?.name ?? 'Product')
  const [modal, setModal] = useState(null)
  const [actionError, setActionError] = useState(null)

  if (error) return <Alert>{error}</Alert>
  if (!product) return <p className="muted">Loading…</p>

  const closeModal = () => setModal(null)
  const savedAndClose = () => {
    setModal(null)
    reload()
  }

  const toggleVariant = async (variant) => {
    setActionError(null)
    try {
      await api.patch(`/catalog/variants/${variant.id}/`, { is_active: !variant.is_active })
      reload()
    } catch (err) {
      setActionError(parseApiError(err).message)
    }
  }

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <Link to="/app/products" className="back-link">
            ← Products
          </Link>
          <h1>{product.name}</h1>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-secondary" onClick={() => setModal('product')}>
            Edit product
          </button>
        )}
      </div>

      <div className="card detail-grid">
        <div>
          <span className="detail-label">Type</span>
          {productTypeLabel(product.product_type)}
        </div>
        <div>
          <span className="detail-label">Sales price</span>
          {formatMoney(product.sales_price)}
        </div>
        <div>
          <span className="detail-label">Cost price</span>
          {formatMoney(product.cost_price)}
        </div>
        <div>
          <span className="detail-label">Taxes</span>
          {product.tax_details.map((tax) => `${tax.name} (${formatTax(tax)})`).join(', ') || '—'}
        </div>
        <div>
          <span className="detail-label">Status</span>
          <StatusBadge tone={product.is_active ? 'success' : 'neutral'}>
            {product.is_active ? 'Active' : 'Archived'}
          </StatusBadge>
        </div>
        <div className="detail-wide">
          <span className="detail-label">Notes</span>
          {product.notes || '—'}
        </div>
      </div>

      <div className="page-header">
        <h2>Variants</h2>
        {isAdmin && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal('variant')}>
            Add variant
          </button>
        )}
      </div>
      <Alert>{actionError}</Alert>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Variant</th>
              <th className="num">Extra price</th>
              <th className="num">Price</th>
              <th>Status</th>
              {isAdmin && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {product.variants.map((variant) => (
              <tr key={variant.id}>
                <td>{variant.name}</td>
                <td className="num">+{formatMoney(variant.extra_price)}</td>
                <td className="num">{formatMoney(variant.price)}</td>
                <td>
                  <StatusBadge tone={variant.is_active ? 'success' : 'neutral'}>
                    {variant.is_active ? 'Active' : 'Archived'}
                  </StatusBadge>
                </td>
                {isAdmin && (
                  <td className="row-actions">
                    <button type="button" className="btn btn-link" onClick={() => toggleVariant(variant)}>
                      {variant.is_active ? 'Archive' : 'Restore'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {product.variants.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  This product has no variants. It is sold at its base price.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal === 'product' && <ProductForm item={product} onClose={closeModal} onSaved={savedAndClose} />}
      {modal === 'variant' && (
        <VariantForm product={product} attributes={attributes} onClose={closeModal} onSaved={savedAndClose} />
      )}
    </section>
  )
}
