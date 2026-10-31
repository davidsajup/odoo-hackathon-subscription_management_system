import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

export const useAuth = () => useContext(AuthContext)

export const homePathFor = (user) => (user.role === 'customer' ? '/portal' : '/app')
