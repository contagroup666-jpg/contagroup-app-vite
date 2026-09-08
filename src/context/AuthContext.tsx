import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { Database } from '../types/database'

type Perfil = Database['public']['Tables']['usuarios']['Row']
type EmpresaAcceso = { empresa_id: string; nombre: string }

interface AuthState {
  session: Session | null
  perfil: Perfil | null
  loading: boolean
  error: string | null
  // Multiempresa (Contador General / Contador Auxiliar): estos usuarios no tienen
  // una empresa fija (usuarios.empresa_id es null) — operan sobre varias empresas
  // vía accesos_multiempresa, y eligen cuál tienen activa en cada momento.
  // `perfil.empresa_id` se sobreescribe en memoria con la empresa activa para que
  // el resto del sistema (que ya lee perfil.empresa_id en todas partes) funcione
  // sin cambios.
  empresasAcceso: EmpresaAcceso[]
  empresaActivaId: string | null
  cambiarEmpresaActiva: (empresaId: string) => void
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signInDemo: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  recargarEmpresasAcceso: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

const DEMO_EMAIL = 'demo@contagroup.app'
const DEMO_PASSWORD = 'ContaDemo2026!'

function claveEmpresaActiva(userId: string) {
  return `contagroup_empresa_activa_${userId}`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfilBase, setPerfilBase] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [empresasAcceso, setEmpresasAcceso] = useState<EmpresaAcceso[]>([])
  const [empresaActivaId, setEmpresaActivaId] = useState<string | null>(null)

  async function cargarEmpresasAcceso(userId: string) {
    const { data } = await supabase
      .from('accesos_multiempresa')
      .select('empresa_id, empresas(nombre)')
      .eq('usuario_id', userId)
      .eq('estado', 'Activo')
    type Fila = { empresa_id: string; empresas: { nombre: string } | null }
    const filas = ((data ?? []) as unknown as Fila[]).map((f) => ({ empresa_id: f.empresa_id, nombre: f.empresas?.nombre ?? 'Empresa' }))
    setEmpresasAcceso(filas)

    const guardada = localStorage.getItem(claveEmpresaActiva(userId))
    const activa = filas.find((f) => f.empresa_id === guardada)?.empresa_id ?? filas[0]?.empresa_id ?? null
    setEmpresaActivaId(activa)
    return activa
  }

  async function cargarPerfil(userId: string) {
    const { data, error: err } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', userId)
      .single()
    if (err) {
      // No tumbamos la sesión por esto: mostramos el error y dejamos que la persona reintente o cierre sesión.
      setError('No se pudo cargar tu perfil de usuario. Intenta recargar la página.')
      setPerfilBase(null)
      return
    }
    const fila = data as unknown as Perfil
    setPerfilBase(fila)
    if (!fila.empresa_id && (fila.rol === 'Contador General' || fila.rol === 'Contador Auxiliar')) {
      await cargarEmpresasAcceso(userId)
    } else {
      setEmpresasAcceso([])
      setEmpresaActivaId(null)
    }
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
        setPerfilBase(null)
        setEmpresasAcceso([])
        setEmpresaActivaId(null)
      }
    })

    return () => {
      activo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  function cambiarEmpresaActiva(empresaId: string) {
    if (!session) return
    setEmpresaActivaId(empresaId)
    localStorage.setItem(claveEmpresaActiva(session.user.id), empresaId)
  }

  async function recargarEmpresasAcceso() {
    if (!session) return
    await cargarEmpresasAcceso(session.user.id)
  }

  // perfil "efectivo": para usuarios normales, empresa_id ya viene fijo desde la
  // tabla usuarios. Para Contador General/Auxiliar, se sobreescribe con la
  // empresa que tienen activa en este momento.
  const perfil: Perfil | null =
    perfilBase && empresasAcceso.length > 0 ? { ...perfilBase, empresa_id: empresaActivaId } : perfilBase

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
    setPerfilBase(null)
    setSession(null)
    setEmpresasAcceso([])
    setEmpresaActivaId(null)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        perfil,
        loading,
        error,
        empresasAcceso,
        empresaActivaId,
        cambiarEmpresaActiva,
        signIn,
        signInDemo,
        signOut,
        recargarEmpresasAcceso,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
