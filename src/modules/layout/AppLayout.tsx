import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { MODULOS, moduloVisible } from './modulos'

export default function AppLayout() {
  const { perfil, empresasAcceso, empresaActivaId, cambiarEmpresaActiva, signOut } = useAuth()

  const modulosVisibles = MODULOS.filter((m) => moduloVisible(m, perfil?.rol, perfil?.permisos))
  const iniciales = (perfil?.nombre ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  return (
    <div className="min-h-screen flex bg-[var(--color-bg-0)]">
      <aside className="w-64 shrink-0 bg-[var(--color-bg-1)] border-r border-white/10 flex flex-col">
        <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-gold)]/15 border border-[var(--color-gold)]/30 flex items-center justify-center shrink-0">
            <span className="font-display-serif text-[var(--color-gold)] text-sm leading-none">C</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-display-serif text-[15px] text-white leading-tight tracking-tight truncate">ContaGroup</h1>
            {perfil && (
              <p className="text-[11px] text-white/40 leading-tight truncate">
                {perfil.rol}
                {perfil.es_demo && <span className="ml-1 text-[var(--color-gold)]">· demo</span>}
              </p>
            )}
          </div>
        </div>

        {empresasAcceso.length > 0 && (
          <div className="px-3 pt-3">
            <label className="block text-[10px] text-white/35 uppercase tracking-wide mb-1 px-1">Empresa activa</label>
            <select
              value={empresaActivaId ?? ''}
              onChange={(e) => cambiarEmpresaActiva(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-2.5 py-2 text-[12.5px] text-white outline-none focus:border-[var(--color-gold)]/50"
            >
              {empresasAcceso.map((e) => (
                <option key={e.empresa_id} value={e.empresa_id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav className="flex-1 py-3 px-2.5 space-y-0.5 overflow-y-auto">
          {modulosVisibles.map((m) => (
            <NavLink
              key={m.id}
              to={m.path}
              end={m.path === '/'}
              className={({ isActive }) =>
                `group relative flex items-center gap-2.5 rounded-lg pl-3 pr-3 py-2 text-[13px] transition-colors ${
                  isActive ? 'text-white bg-white/[0.06]' : 'text-white/55 hover:bg-white/[0.04] hover:text-white/90'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--color-gold)] transition-opacity ${
                      isActive ? 'opacity-100' : 'opacity-0'
                    }`}
                    aria-hidden
                  />
                  <span className="text-[15px] shrink-0" aria-hidden>
                    {m.icono}
                  </span>
                  <span className="truncate">{m.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10">
          {perfil && (
            <div className="flex items-center gap-2.5 px-2 py-1.5 mb-1 rounded-lg">
              <div className="w-7 h-7 rounded-full bg-[var(--color-blue-5)]/20 border border-[var(--color-blue-5)]/30 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-semibold text-blue-200">{iniciales || '?'}</span>
              </div>
              <p className="text-[12px] text-white/70 truncate">{perfil.nombre}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className="w-full text-left text-[13px] text-white/45 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
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
