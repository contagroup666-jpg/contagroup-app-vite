import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database'

type Perfil = Database['public']['Tables']['usuarios']['Row']

interface AuthState {
  session: Session | null
  perfil: Perfil | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signInDemo: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

const DEMO_EMAIL = 'demo@contagroup.app'
const DEMO_PASSWORD = 'ContaDemo2026!'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function cargarPerfil(userId: string) {
    const { data, error: err } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', userId)
      .single()
    if (err) {
      // No tumbamos la sesión por esto: mostramos el error y dejamos que la persona reintente o cierre sesión.
      setError('No se pudo cargar tu perfil de usuario. Intenta recargar la página.')
      setPerfil(null)
      return
    }
    setPerfil(data as unknown as Perfil)
  }

  useEffect(() => {
    let activo = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!activo) return
      setSession(data.session)
      if (data.session) await cargarPerfil(data.session.user.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nuevaSesion) => {
      setSession(nuevaSesion)
      if (nuevaSesion) {
        await cargarPerfil(nuevaSesion.user.id)
      } else {
        setPerfil(null)
      }
    })

    return () => {
      activo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      const msg = err.message === 'Invalid login credentials'
        ? 'Correo o contraseña incorrectos.'
        : err.message
      setError(msg)
      return { error: msg }
    }
    return { error: null }
  }

  async function signInDemo() {
    return signIn(DEMO_EMAIL, DEMO_PASSWORD)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setPerfil(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ session, perfil, loading, error, signIn, signInDemo, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
