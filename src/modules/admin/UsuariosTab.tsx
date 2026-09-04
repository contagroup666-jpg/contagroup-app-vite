import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database, Rol } from '../../types/database'

type Usuario = Database['public']['Tables']['usuarios']['Row']
type Empresa = Database['public']['Tables']['empresas']['Row']
type Acceso = Database['public']['Tables']['accesos_multiempresa']['Row']

const ROLES: Rol[] = [
  'Super Administrador',
  'Admin Empresa',
  'Contador General',
  'Contador',
  'Cajero',
  'Contador de Empresa',
  'Jefe de Nómina',
  'Bodeguero',
  'Auditor',
]

const ROLES_OPERATIVOS = ['Contador', 'Cajero', 'Contador de Empresa', 'Jefe de Nómina', 'Bodeguero', 'Auditor']

function requiereEmpresa(rol: Rol) {
  return rol !== 'Super Administrador' && rol !== 'Contador General'
}

const VACIO = {
  nombre: '',
  email: '',
  password: '',
  rol: 'Contador' as Rol,
  empresa_id: '',
  permisos: { pos: false, ventas: true, inventario: true, contabilidad: true, nomina: false },
  roles_gestionables: [] as string[],
  cupo_empresas: '',
}

export default function UsuariosTab() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [accesos, setAccesos] = useState<Acceso[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editando, setEditando] = useState<Usuario | null>(null)
  const [form, setForm] = useState(VACIO)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  async function cargar() {
    setLoading(true)
    const [usuariosRes, empresasRes, accesosRes] = await Promise.all([
      supabase.from('usuarios').select('*').order('nombre'),
      supabase.from('empresas').select('*').order('nombre'),
      supabase.from('accesos_multiempresa').select('*').eq('estado', 'Activo'),
    ])
    if (usuariosRes.error) setError(usuariosRes.error.message)
    else {
      setUsuarios((usuariosRes.data ?? []) as unknown as Usuario[])
      setError(null)
    }
    setEmpresas((empresasRes.data ?? []) as unknown as Empresa[])
    setAccesos((accesosRes.data ?? []) as unknown as Acceso[])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const nombreEmpresa = (id: string | null) => empresas.find((e) => e.id === id)?.nombre ?? '—'

  function abrirNuevo() {
    setEditando(null)
    setForm(VACIO)
    setErrorForm(null)
    setMostrarForm(true)
  }

  function abrirEditar(u: Usuario) {
    setEditando(u)
    setForm({
      nombre: u.nombre,
      email: u.email,
      password: '',
      rol: u.rol,
      empresa_id: u.empresa_id ?? '',
      permisos: {
        pos: !!u.permisos?.pos,
        ventas: u.permisos?.ventas ?? true,
        inventario: u.permisos?.inventario ?? true,
        contabilidad: u.permisos?.contabilidad ?? true,
        nomina: !!u.permisos?.nomina,
      },
      roles_gestionables: Array.isArray(u.roles_gestionables) ? u.roles_gestionables : [],
      cupo_empresas: u.cupo_empresas != null ? String(u.cupo_empresas) : '',
    })
    setErrorForm(null)
    setMostrarForm(true)
  }

  function toggleRolGestionable(rol: string) {
    setForm((f) => ({
      ...f,
      roles_gestionables: f.roles_gestionables.includes(rol)
        ? f.roles_gestionables.filter((r) => r !== rol)
        : [...f.roles_gestionables, rol],
    }))
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!form.nombre.trim() || !form.email.trim()) {
      setErrorForm('Nombre y correo son obligatorios.')
      return
    }
    if (!editando && (!form.password || form.password.length < 8)) {
      setErrorForm('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (form.password && form.password.length < 8) {
      setErrorForm('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (requiereEmpresa(form.rol) && !form.empresa_id) {
      setErrorForm('Este rol requiere una empresa asignada.')
      return
    }

    setGuardando(true)
    setErrorForm(null)

    const payload: Record<string, unknown> = {
      action: editando ? 'update' : 'create',
      nombre: form.nombre.trim(),
      email: form.email.trim(),
      rol: form.rol,
      empresa_id: requiereEmpresa(form.rol) ? form.empresa_id : null,
      permisos: form.permisos,
    }
    if (editando) payload.id = editando.id
    if (form.password) payload.password = form.password
    if (form.rol === 'Admin Empresa') payload.roles_gestionables = form.roles_gestionables
    if (form.rol === 'Contador General') payload.cupo_empresas = form.cupo_empresas === '' ? null : parseInt(form.cupo_empresas)

    const { data, error: err } = await supabase.functions.invoke('admin-users', { body: payload })

    setGuardando(false)
    if (err) {
      setErrorForm(err.message)
      return
    }
    if (data && data.ok === false) {
      setErrorForm(data.error || 'No se pudo guardar el usuario.')
      return
    }
    setMostrarForm(false)
    await cargar()
  }

  async function handleEliminar(u: Usuario) {
    if (!confirm(`¿Eliminar a "${u.nombre}"? Esto borra también su acceso de inicio de sesión.`)) return
    const { data, error: err } = await supabase.functions.invoke('admin-users', { body: { action: 'delete', id: u.id } })
    if (err || (data && data.ok === false)) {
      setError(err?.message || data?.error || 'No se pudo eliminar el usuario.')
      return
    }
    await cargar()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-white/40">{usuarios.length} usuario{usuarios.length === 1 ? '' : 's'} registrado{usuarios.length === 1 ? '' : 's'}</p>
        <button
          onClick={abrirNuevo}
          className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[var(--color-blue-6)] transition-colors"
        >
          + Nuevo usuario
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-white/40">Cargando…</p>
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Correo</th>
                <th className="px-4 py-2 font-medium">Rol</th>
                <th className="px-4 py-2 font-medium">Empresa</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-4 py-2.5 text-white">{u.nombre}</td>
                  <td className="px-4 py-2.5 text-white/60 text-xs">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-white/60">{u.rol}</span>
                  </td>
                  <td className="px-4 py-2.5 text-white/60 text-xs">{u.empresa_id ? nombreEmpresa(u.empresa_id) : '—'}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => abrirEditar(u)} className="text-[11px] text-white/50 hover:text-white mr-3">
                      Editar
                    </button>
                    <button onClick={() => handleEliminar(u)} className="text-[11px] text-red-400/70 hover:text-red-400">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(() => {
        const contadores = usuarios.filter((u) => u.rol === 'Contador General' || u.rol === 'Contador Auxiliar')
        if (contadores.length === 0) return null
        return (
          <div className="mt-6 rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02]">
              <p className="text-sm font-semibold text-white">Contadores multiempresa</p>
              <p className="text-xs text-white/40 mt-0.5">Qué empresas atiende cada Contador General/Auxiliar</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                  <th className="px-4 py-2 font-medium">Nombre</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium text-right">Cupo</th>
                  <th className="px-4 py-2 font-medium text-right"># Empresas</th>
                  <th className="px-4 py-2 font-medium">Empresas con acceso</th>
                </tr>
              </thead>
              <tbody>
                {contadores.map((c) => {
                  const suyas = accesos.filter((a) => a.usuario_id === c.id)
                  const nombresEmp = suyas.map((a) => nombreEmpresa(a.empresa_id)).filter((n) => n !== '—')
                  return (
                    <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5 text-white">
                        {c.nombre}
                        <div className="text-[11px] text-white/40">{c.email}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                          {c.rol === 'Contador General' ? 'General' : 'Auxiliar'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-white/60 text-xs">
                        {c.rol === 'Contador General' ? (c.cupo_empresas ?? <span className="text-white/30">Sin cupo</span>) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-white font-medium text-xs">{suyas.length}</td>
                      <td className="px-4 py-2.5 text-white/50 text-xs">{nombresEmp.join(', ') || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })()}

      {mostrarForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setMostrarForm(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">{editando ? 'Editar usuario' : 'Nuevo usuario'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Nombre *</label>
                <input
                  autoFocus
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Correo *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">{editando ? 'Nueva contraseña (opcional)' : 'Contraseña *'}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editando ? 'Dejar en blanco para no cambiarla' : 'Mínimo 8 caracteres'}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Rol</label>
                <select
                  value={form.rol}
                  onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {requiereEmpresa(form.rol) && (
                <div>
                  <label className="block text-xs text-white/50 mb-1">Empresa *</label>
                  <select
                    value={form.empresa_id}
                    onChange={(e) => setForm({ ...form, empresa_id: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  >
                    <option value="">Seleccionar…</option>
                    {empresas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {requiereEmpresa(form.rol) && (
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Permisos</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['pos', 'ventas', 'inventario', 'contabilidad', 'nomina'] as const).map((p) => (
                      <label key={p} className="flex items-center gap-1.5 text-xs text-white/60">
                        <input
                          type="checkbox"
                          checked={form.permisos[p]}
                          onChange={(e) => setForm({ ...form, permisos: { ...form.permisos, [p]: e.target.checked } })}
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {form.rol === 'Admin Empresa' && (
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Roles que puede gestionar</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ROLES_OPERATIVOS.map((r) => (
                      <label key={r} className="flex items-center gap-1.5 text-xs text-white/60">
                        <input type="checkbox" checked={form.roles_gestionables.includes(r)} onChange={() => toggleRolGestionable(r)} />
                        {r}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {form.rol === 'Contador General' && (
                <div>
                  <label className="block text-xs text-white/50 mb-1">Cupo de empresas (autoservicio)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.cupo_empresas}
                    onChange={(e) => setForm({ ...form, cupo_empresas: e.target.value })}
                    placeholder="0"
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  />
                </div>
              )}

              {errorForm && (
                <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {errorForm}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setMostrarForm(false)}
                  className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60"
                >
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
