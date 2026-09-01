import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import LoginPage from '../modules/auth/LoginPage'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, perfil } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-0)]">
        <p className="text-sm text-white/40">Cargando…</p>
      </div>
    )
  }

  if (!session) {
    return <LoginPage />
  }

  if (!perfil) {
    // Sesión válida pero el perfil de public.usuarios aún no cargó o falló.
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-0)]">
        <p className="text-sm text-white/40">Preparando tu perfil…</p>
      </div>
    )
  }

  return <>{children}</>
}
