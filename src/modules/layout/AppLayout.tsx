import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { MODULOS, moduloVisible } from './modulos'

export default function AppLayout() {
  const { perfil, signOut } = useAuth()

  const modulosVisibles = MODULOS.filter((m) => moduloVisible(m, perfil?.rol, perfil?.permisos))

  return (
    <div className="min-h-screen flex bg-[var(--color-bg-0)]">
      <aside className="w-60 shrink-0 bg-[var(--color-bg-1)] border-r border-white/10 flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <h1 className="text-sm font-semibold text-white tracking-wide">ContaGroup</h1>
          {perfil && (
            <p className="text-[11px] text-white/40 mt-0.5 truncate">
              {perfil.nombre} · {perfil.rol}
              {perfil.es_demo && <span className="ml-1 text-[var(--color-gold)]">(demo)</span>}
            </p>
          )}
        </div>

        <nav className="flex-1 py-3 px-2 space-y-1">
          {modulosVisibles.map((m) => (
            <NavLink
              key={m.id}
              to={m.path}
              end={m.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  isActive
                    ? 'bg-[var(--color-blue-5)]/20 text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <span aria-hidden>{m.icono}</span>
              {m.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10">
          <button
            onClick={signOut}
            className="w-full text-left text-[13px] text-white/50 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
