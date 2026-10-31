import { PASSWORD_RULES } from './passwordRules'

export default function PasswordChecklist({ password }) {
  return (
    <ul className="password-rules">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password)
        return (
          <li key={rule.label} className={met ? 'met' : ''}>
            <span aria-hidden="true">{met ? '✓' : '•'}</span> {rule.label}
          </li>
        )
      })}
    </ul>
  )
}
