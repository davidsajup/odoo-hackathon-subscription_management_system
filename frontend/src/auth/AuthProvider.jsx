import { useCallback, useEffect, useMemo, useState } from 'react'
import api, { tokenStore } from '../api/client'
import { AuthContext } from './useAuth'

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()))

  useEffect(() => {
    if (!tokenStore.get()) return
    api
      .get('/auth/me/')
      .then((response) => setUser(response.data))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const handleLogout = () => setUser(null)
    window.addEventListener('auth:logout', handleLogout)
    return () => window.removeEventListener('auth:logout', handleLogout)
  }, [])

  const startSession = useCallback(({ token, user: sessionUser }) => {
    tokenStore.set(token)
    setUser(sessionUser)
    return sessionUser
  }, [])

  const login = useCallback(
    (email, password) => api.post('/auth/login/', { email, password }).then((r) => startSession(r.data)),
    [startSession],
  )

  const signup = useCallback(
    (data) => api.post('/auth/signup/', data).then((r) => startSession(r.data)),
    [startSession],
  )

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout/')
    } finally {
      tokenStore.clear()
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, setUser, loading, login, signup, logout }),
    [user, loading, login, signup, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
