import ResourceFormModal from '../../components/ResourceFormModal'
import { activeColumn } from '../../components/columns'
import ResourceListPage from '../../components/ResourceListPage'
import { FormField } from '../../components/ui'
import { fullName } from '../../format'

const USER_DEFAULTS = { email: '', first_name: '', last_name: '', company_name: '', phone: '', address: '' }

function UserForm({ endpoint, noun, item, onClose, onSaved }) {
  return (
    <ResourceFormModal endpoint={endpoint} noun={noun} item={item} defaults={USER_DEFAULTS} onClose={onClose} onSaved={onSaved}>
      {({ values, onChange, errors }) => (
        <>
          <FormField label="Email" error={errors.email}>
            <input type="email" name="email" value={values.email} onChange={onChange} required autoFocus />
          </FormField>
          <div className="grid-2">
            <FormField label="First name" error={errors.first_name}>
              <input name="first_name" value={values.first_name} onChange={onChange} />
            </FormField>
            <FormField label="Last name" error={errors.last_name}>
              <input name="last_name" value={values.last_name} onChange={onChange} />
            </FormField>
          </div>
          <div className="grid-2">
            <FormField label="Company" error={errors.company_name}>
              <input name="company_name" value={values.company_name} onChange={onChange} />
            </FormField>
            <FormField label="Phone" error={errors.phone}>
              <input name="phone" value={values.phone} onChange={onChange} />
            </FormField>
          </div>
          <FormField label="Address" error={errors.address}>
            <textarea name="address" rows={2} value={values.address} onChange={onChange} />
          </FormField>
          {!item.id && <p className="muted">They&apos;ll get an email with a link to set their own password.</p>}
        </>
      )}
    </ResourceFormModal>
  )
}

const COLUMNS = [
  { label: 'Name', render: (row) => fullName(row) || '—', sort: 'first_name' },
  { label: 'Email', key: 'email', sort: 'email' },
  { label: 'Company', render: (row) => row.company_name || '—', sort: 'company_name' },
  { label: 'Phone', render: (row) => row.phone || '—' },
  activeColumn(['Active', 'Inactive']),
]

export default function UserManagementPage({ endpoint, title, noun }) {
  return (
    <ResourceListPage
      title={title}
      noun={noun}
      endpoint={endpoint}
      columns={COLUMNS}
      searchPlaceholder="Search name, email or company"
      canEdit
      toggleLabels={['Deactivate', 'Activate']}
      renderForm={(props) => <UserForm endpoint={endpoint} noun={noun} {...props} />}
    />
  )
}
