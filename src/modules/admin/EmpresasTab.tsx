import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database'

type Empresa = Database['public']['Tables']['empresas']['Row']
type Usuario = Database['public']['Tables']['usuarios']['Row']

const VACIO = { nombre: '', ruc: '', moneda: 'USD', regimen: 'General', estado: 'Activa', iva_porcentaje: '12' }

export default function EmpresasTab() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [adminsPorEmpresa, setAdminsPorEmpresa] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cambiandoEstado, setCambiandoEstado] = useState<string | null>(null)

  const [editando, setEditando] = useState<Empresa | null>(null)
  const [form, setForm] = useState(VACIO)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  async function cargar() {
    setLoading(true)
    const [empresasRes, adminsRes] = await Promise.all([
      supabase.from('empresas').select('*').order('nombre'),
      supabase.from('usuarios').select('nombre, empresa_id').eq('rol', 'Admin Empresa'),
    ])
    if (empresasRes.error) setError(empresasRes.error.message)
    else {
      setEmpresas((empresasRes.data ?? []) as unknown as Empresa[])
      setError(null)
    }
    const mapa: Record<string, string> = {}
    ;((adminsRes.data ?? []) as unknown as Pick<Usuario, 'nombre' | 'empresa_id'>[]).forEach((u) => {
      if (u.empresa_id) mapa[u.empresa_id] = u.nombre
    })
    setAdminsPorEmpresa(mapa)
    setLoading(false)
  }

  async function handleToggleEstado(e: Empresa) {
    const nuevoEstado = e.estado === 'Activa' ? 'Inactiva' : 'Activa'
    setCambiandoEstado(e.id)
    const { error: err } = await supabase.from('empresas').update({ estado: nuevoEstado }).eq('id', e.id)
    setCambiandoEstado(null)
    if (err) {
      setError(err.message)
      return
    }
    await cargar()
  }

  useEffect(() => {
    cargar()
  }, [])

  function abrirNueva() {
    setEditando(null)
    setForm(VACIO)
    setErrorForm(null)
    setMostrarForm(true)
  }

  function abrirEditar(e: Empresa) {
    setEditando(e)
    setForm({
      nombre: e.nombre,
      ruc: e.ruc ?? '',
      moneda: e.moneda,
      regimen: e.regimen ?? 'General',
      estado: e.estado,
      iva_porcentaje: String(e.iva_porcentaje ?? 12),
    })
    setErrorForm(null)
    setMostrarForm(true)
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!form.nombre.trim()) {
      setErrorForm('El nombre es obligatorio.')
      return
    }
    const ivaPct = parseFloat(form.iva_porcentaje)
    if (isNaN(ivaPct) || ivaPct < 0 || ivaPct > 100) {
      setErrorForm('El % de IVA debe estar entre 0 y 100.')
      return
    }
    setGuardando(true)
    setErrorForm(null)

    if (editando) {
      const { error: err } = await supabase
        .from('empresas')
        .update({
          nombre: form.nombre.trim(),
          ruc: form.ruc.trim() || null,
          moneda: form.moneda,
          regimen: form.regimen,
          estado: form.estado,
          iva_porcentaje: ivaPct,
        })
        .eq('id', editando.id)
      setGuardando(false)
      if (err) {
        setErrorForm(err.message)
        return
      }
    } else {
      // Usa la RPC en vez de un insert directo: crea la empresa Y le siembra
      // el plan de cuentas base + config_cuentas_contables en el mismo paso,
      // para que quede lista para facturar/vender de inmediato.
      const { error: err } = await supabase.rpc('crear_empresa_super_admin', {
        p_nombre: form.nombre.trim(),
        p_ruc: form.ruc.trim() || null,
        p_moneda: form.moneda,
        p_regimen: form.regimen,
        p_iva_porcentaje: ivaPct,
      })
      setGuardando(false)
      if (err) {
        setErrorForm(err.message)
        return
      }
    }
    setMostrarForm(false)
    await cargar()
  }

  async function handleEliminar(e: Empresa) {
    if (!confirm(`¿Eliminar la empresa "${e.nombre}"?\n\nSe perderán también sus cuentas contables, asientos, facturas y todos los datos asociados. Esta acción no se puede deshacer.`)) return
    const { error: err } = await supabase.from('empresas').delete().eq('id', e.id)
    if (err) {
      setError(`No se pudo eliminar: ${err.message}`)
      return
    }
    await cargar()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-white/40">{empresas.length} empresa{empresas.length === 1 ? '' : 's'} registrada{empresas.length === 1 ? '' : 's'}</p>
        <button
          onClick={abrirNueva}
          className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[var(--color-blue-6)] transition-colors"
        >
          + Nueva empresa
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
                <th className="px-4 py-2 font-medium">Empresa</th>
                <th className="px-4 py-2 font-medium">RUC</th>
                <th className="px-4 py-2 font-medium">Régimen</th>
                <th className="px-4 py-2 font-medium">Moneda</th>
                <th className="px-4 py-2 font-medium">Admin asignado</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-4 py-2.5 text-white">{e.nombre}</td>
                  <td className="px-4 py-2.5 text-white/60 text-xs">{e.ruc || '—'}</td>
                  <td className="px-4 py-2.5 text-white/60 text-xs">{e.regimen || '—'}</td>
                  <td className="px-4 py-2.5 text-white/60 text-xs">{e.moneda}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {adminsPorEmpresa[e.id] ? (
                      <span className="text-white/60">{adminsPorEmpresa[e.id]}</span>
                    ) : (
                      <span className="text-amber-400/80">⚠ Sin asignar</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => handleToggleEstado(e)}
                      disabled={cambiandoEstado === e.id}
                      title={e.estado === 'Activa' ? 'Clic para desactivar' : 'Clic para activar'}
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded disabled:opacity-50 transition-colors ${
                        e.estado === 'Activa' ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-white/10 text-white/40 hover:bg-white/20'
                      }`}
                    >
                      {cambiandoEstado === e.id ? '…' : e.estado}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => abrirEditar(e)} className="text-[11px] text-white/50 hover:text-white mr-3">
                      Editar
                    </button>
                    <button onClick={() => handleEliminar(e)} className="text-[11px] text-red-400/70 hover:text-red-400">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mostrarForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setMostrarForm(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">{editando ? 'Editar empresa' : 'Nueva empresa'}</h3>
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
                <label className="block text-xs text-white/50 mb-1">RUC</label>
                <input
                  value={form.ruc}
                  onChange={(e) => setForm({ ...form, ruc: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Moneda</label>
                  <input
                    value={form.moneda}
                    onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">% IVA</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.iva_porcentaje}
                    onChange={(e) => setForm({ ...form, iva_porcentaje: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Régimen</label>
                  <select
                    value={form.regimen}
                    onChange={(e) => setForm({ ...form, regimen: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  >
                    <option value="General">General</option>
                    <option value="RIMPE Emprendedor">RIMPE Emprendedor</option>
                    <option value="RIMPE Negocio Popular">RIMPE Negocio Popular</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Estado</label>
                  <select
                    value={form.estado}
                    onChange={(e) => setForm({ ...form, estado: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  >
                    <option value="Activa">Activa</option>
                    <option value="Inactiva">Inactiva</option>
                  </select>
                </div>
              </div>

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
