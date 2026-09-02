import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database'

type Empresa = Database['public']['Tables']['empresas']['Row']

const VACIO = { nombre: '', ruc: '', moneda: 'USD', regimen: 'General', estado: 'Activa', iva_porcentaje: '12' }

export default function EmpresasTab() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editando, setEditando] = useState<Empresa | null>(null)
  const [form, setForm] = useState(VACIO)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  async function cargar() {
    setLoading(true)
    const { data, error: err } = await supabase.from('empresas').select('*').order('nombre')
    if (err) setError(err.message)
    else {
      setEmpresas((data ?? []) as unknown as Empresa[])
      setError(null)
    }
    setLoading(false)
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

    const payload = {
      nombre: form.nombre.trim(),
      ruc: form.ruc.trim() || null,
      moneda: form.moneda,
      regimen: form.regimen,
      estado: form.estado,
      iva_porcentaje: ivaPct,
    }

    const resultado = editando
      ? await supabase.from('empresas').update(payload).eq('id', editando.id)
      : await supabase.from('empresas').insert(payload)

    setGuardando(false)
    if (resultado.error) {
      setErrorForm(resultado.error.message)
      return
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
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        e.estado === 'Activa' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/10 text-white/40'
                      }`}
                    >
                      {e.estado}
                    </span>
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
