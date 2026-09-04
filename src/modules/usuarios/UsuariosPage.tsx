import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database'

type Usuario = Database['public']['Tables']['usuarios']['Row']

const PERMISOS_KEYS = ['pos', 'ventas', 'inventario', 'contabilidad', 'nomina'] as const

const FORM_VACIO = {
  nombre: '',
  email: '',
  password: '',
  rol: '' as string,
  permisos: { pos: false, ventas: true, inventario: true, contabilidad: true, nomina: false },
}

// Módulo "Usuarios y Roles" para Admin Empresa (gestiona su propia empresa,
// limitado a roles_gestionables) y Contador General (gestiona su único
// Contador Auxiliar). El Super Administrador tiene su propia vista completa
// en Panel Super Admin — este módulo es el equivalente al del legacy para
// los otros dos roles, que antes no tenían ninguna pantalla para esto pese
// a que el backend (Edge Function admin-users) ya lo soporta.
export default function UsuariosPage() {
  const { perfil } = useAuth()
  if (!perfil) return null
  if (perfil.rol === 'Contador General') return <ContadorAuxiliarSection perfil={perfil} />
  if (perfil.rol === 'Admin Empresa') return <AdminEmpresaUsuariosSection perfil={perfil} />
  return (
    <div className="p-6">
      <p className="text-sm text-white/50">Tu rol no tiene un módulo de gestión de usuarios propio.</p>
    </div>
  )
}

// ============================= Admin Empresa =============================

function AdminEmpresaUsuariosSection({ perfil }: { perfil: Usuario }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const rolesGestionables = Array.isArray(perfil.roles_gestionables) ? perfil.roles_gestionables : []

  const [editando, setEditando] = useState<Usuario | null>(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const [mostrarInvitar, setMostrarInvitar] = useState(false)

  async function cargar() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('usuarios')
      .select('*')
      .eq('empresa_id', perfil.empresa_id)
      .order('nombre')
    if (err) setError(err.message)
    else {
      setUsuarios((data ?? []) as unknown as Usuario[])
      setError(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function abrirNuevo() {
    setEditando(null)
    setForm({ ...FORM_VACIO, rol: rolesGestionables[0] ?? '' })
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
      permisos: {
        pos: !!u.permisos?.pos,
        ventas: u.permisos?.ventas ?? true,
        inventario: u.permisos?.inventario ?? true,
        contabilidad: u.permisos?.contabilidad ?? true,
        nomina: !!u.permisos?.nomina,
      },
    })
    setErrorForm(null)
    setMostrarForm(true)
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!form.nombre.trim() || !form.email.trim()) return setErrorForm('Nombre y correo son obligatorios.')
    if (!form.rol) return setErrorForm('Selecciona un rol.')
    if (!editando && (!form.password || form.password.length < 8)) return setErrorForm('La contraseña debe tener al menos 8 caracteres.')
    if (form.password && form.password.length < 8) return setErrorForm('La contraseña debe tener al menos 8 caracteres.')

    setGuardando(true)
    setErrorForm(null)

    const payload: Record<string, unknown> = {
      action: editando ? 'update' : 'create',
      nombre: form.nombre.trim(),
      email: form.email.trim(),
      rol: form.rol,
      permisos: form.permisos,
    }
    if (editando) payload.id = editando.id
    if (form.password) payload.password = form.password

    const { data, error: err } = await supabase.functions.invoke('admin-users', { body: payload })
    setGuardando(false)
    if (err) return setErrorForm(err.message)
    if (data && data.ok === false) return setErrorForm(data.error || 'No se pudo guardar el usuario.')
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
    <div className="p-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold text-white">Usuarios y Roles</h1>
      </div>
      <p className="text-xs text-white/40 mb-4">Usuarios de tu empresa, limitado a los roles que puedes gestionar.</p>

      {rolesGestionables.length === 0 && (
        <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
          Tu Super Administrador aún no te ha asignado roles que puedas gestionar. Pídele que configure "Roles que puede gestionar" en tu cuenta.
        </p>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-white/40">{usuarios.length} usuario{usuarios.length === 1 ? '' : 's'} en tu empresa</p>
        <div className="flex gap-2">
          <button
            onClick={() => setMostrarInvitar(true)}
            className="rounded-lg border border-white/15 text-white/70 text-xs font-semibold px-3 py-1.5 hover:bg-white/5 transition-colors"
          >
            🌐 Invitar contador externo
          </button>
          <button
            onClick={abrirNuevo}
            disabled={rolesGestionables.length === 0}
            className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[var(--color-blue-6)] disabled:opacity-40 transition-colors"
          >
            + Nuevo usuario
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}

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
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const puedeGestionar = rolesGestionables.includes(u.rol)
                return (
                  <tr key={u.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5 text-white">{u.nombre}</td>
                    <td className="px-4 py-2.5 text-white/60 text-xs">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-white/60">{u.rol}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {puedeGestionar ? (
                        <>
                          <button onClick={() => abrirEditar(u)} className="text-[11px] text-white/50 hover:text-white mr-3">Editar</button>
                          <button onClick={() => handleEliminar(u)} className="text-[11px] text-red-400/70 hover:text-red-400">Eliminar</button>
                        </>
                      ) : (
                        <span className="text-[11px] text-white/25">Sin permiso sobre este rol</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {mostrarForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setMostrarForm(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">{editando ? 'Editar usuario' : 'Nuevo usuario'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Nombre *</label>
                <input autoFocus value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Correo *</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">{editando ? 'Nueva contraseña (opcional)' : 'Contraseña *'}</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editando ? 'Dejar en blanco para no cambiarla' : 'Mínimo 8 caracteres'}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Rol</label>
                <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                  {rolesGestionables.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Permisos</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PERMISOS_KEYS.map((p) => (
                    <label key={p} className="flex items-center gap-1.5 text-xs text-white/60">
                      <input type="checkbox" checked={form.permisos[p]} onChange={(e) => setForm({ ...form, permisos: { ...form.permisos, [p]: e.target.checked } })} />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
              {errorForm && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorForm}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setMostrarForm(false)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">Cancelar</button>
                <button type="submit" disabled={guardando} className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mostrarInvitar && <InvitarContadorModal perfil={perfil} onClose={() => setMostrarInvitar(false)} />}
    </div>
  )
}

function InvitarContadorModal({ perfil, onClose }: { perfil: Usuario; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [permisos, setPermisos] = useState({ ventas: true, inventario: true, contabilidad: true, nomina: false })
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'error' | 'ok'; texto: string } | null>(null)

  async function handleInvitar(ev: FormEvent) {
    ev.preventDefault()
    const correo = email.trim().toLowerCase()
    if (!correo) return setMsg({ tipo: 'error', texto: 'Correo requerido.' })
    setEnviando(true)
    setMsg(null)

    const { data: existente } = (await supabase
      .rpc('buscar_usuario_para_invitar', { p_email: correo })
      .maybeSingle()) as { data: { id: string; nombre: string; rol: string } | null }

    if (!existente) {
      setEnviando(false)
      setMsg({
        tipo: 'error',
        texto: 'No existe ninguna cuenta con ese correo. Pide a tu Super Administrador que cree la cuenta de Contador General primero — luego podrás darle acceso a tu empresa desde aquí.',
      })
      return
    }
    if (existente.rol !== 'Contador General') {
      setEnviando(false)
      setMsg({ tipo: 'error', texto: 'Ese correo ya está registrado con otro rol en el sistema.' })
      return
    }

    const { data: acceso } = await supabase
      .from('accesos_multiempresa')
      .select('*')
      .eq('usuario_id', existente.id)
      .eq('empresa_id', perfil.empresa_id)
      .maybeSingle()

    const { error: errAcceso } = acceso
      ? await supabase.from('accesos_multiempresa').update({ permisos, estado: 'Activo' }).eq('id', acceso.id)
      : await supabase.from('accesos_multiempresa').insert({ usuario_id: existente.id, empresa_id: perfil.empresa_id, permisos, asignado_por: perfil.id, estado: 'Activo' })

    setEnviando(false)
    if (errAcceso) return setMsg({ tipo: 'error', texto: errAcceso.message })
    setMsg({ tipo: 'ok', texto: `${existente.nombre} ahora tiene acceso a tu empresa.` })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={onClose}>
      <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm my-8" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-white mb-1">🌐 Invitar contador externo</h3>
        <p className="text-xs text-white/40 mb-4">Dale acceso a tu empresa a un Contador General que ya tenga cuenta en el sistema.</p>
        <form onSubmit={handleInvitar} className="space-y-3">
          <div>
            <label className="block text-xs text-white/50 mb-1">Correo del contador *</label>
            <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Permisos sobre tu empresa</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['ventas', 'inventario', 'contabilidad', 'nomina'] as const).map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-xs text-white/60">
                  <input type="checkbox" checked={permisos[p]} onChange={(e) => setPermisos({ ...permisos, [p]: e.target.checked })} />
                  {p}
                </label>
              ))}
            </div>
          </div>
          {msg && (
            <p role="alert" className={`text-xs rounded-lg px-3 py-2 border ${msg.tipo === 'error' ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'}`}>
              {msg.texto}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">Cerrar</button>
            <button type="submit" disabled={enviando} className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">
              {enviando ? 'Guardando…' : '💾 Dar acceso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================= Contador General =============================

function ContadorAuxiliarSection({ perfil }: { perfil: Usuario }) {
  const [auxiliar, setAuxiliar] = useState<Usuario | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ nombre: '', email: '', password: '' })
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  async function cargar() {
    const { data, error: err } = await supabase
      .from('usuarios')
      .select('*')
      .eq('supervisor_id', perfil.id)
      .eq('rol', 'Contador Auxiliar')
      .maybeSingle()
    if (err) setError(err.message)
    setAuxiliar((data ?? null) as unknown as Usuario | null)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCrear(ev: FormEvent) {
    ev.preventDefault()
    if (!form.nombre.trim() || !form.email.trim()) return setErrorForm('Nombre y correo son obligatorios.')
    if (!form.password || form.password.length < 8) return setErrorForm('La contraseña debe tener al menos 8 caracteres.')
    setGuardando(true)
    setErrorForm(null)
    const { data, error: err } = await supabase.functions.invoke('admin-users', {
      body: { action: 'create', nombre: form.nombre.trim(), email: form.email.trim(), password: form.password, rol: 'Contador Auxiliar' },
    })
    setGuardando(false)
    if (err) return setErrorForm(err.message)
    if (data && data.ok === false) return setErrorForm(data.error || 'No se pudo crear la cuenta.')
    setForm({ nombre: '', email: '', password: '' })
    await cargar()
  }

  async function handleEliminar() {
    if (!auxiliar) return
    if (!confirm(`¿Eliminar a "${auxiliar.nombre}"? Perderá acceso a todas las empresas que atiendes.`)) return
    const { data, error: err } = await supabase.functions.invoke('admin-users', { body: { action: 'delete', id: auxiliar.id } })
    if (err || (data && data.ok === false)) {
      setError(err?.message || data?.error || 'No se pudo eliminar.')
      return
    }
    await cargar()
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-lg font-semibold text-white mb-1">Mi Contador Auxiliar</h1>
      <p className="text-xs text-white/40 mb-4">Puedes tener exactamente un Contador Auxiliar. Recibe acceso automático a todas las empresas que tú atiendes.</p>

      {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {auxiliar === undefined ? (
        <p className="text-xs text-white/40">Cargando…</p>
      ) : auxiliar ? (
        <div className="rounded-2xl border border-white/10 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-white font-medium">{auxiliar.nombre}</p>
            <p className="text-xs text-white/50">{auxiliar.email}</p>
          </div>
          <button onClick={handleEliminar} className="text-xs text-red-400/70 hover:text-red-400">Eliminar</button>
        </div>
      ) : (
        <form onSubmit={handleCrear} className="space-y-3 rounded-2xl border border-white/10 p-4">
          <div>
            <label className="block text-xs text-white/50 mb-1">Nombre *</label>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">Correo *</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">Contraseña *</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Mínimo 8 caracteres"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
          </div>
          {errorForm && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorForm}</p>}
          <button type="submit" disabled={guardando} className="w-full rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">
            {guardando ? 'Creando…' : '+ Crear Contador Auxiliar'}
          </button>
        </form>
      )}
    </div>
  )
}
