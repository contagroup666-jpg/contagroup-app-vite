import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { calcularDepreciacion, type ResultadoDepreciacion } from '../../lib/motorContable'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'
import EstadoVacio from '../../components/EstadoVacio'

type Activo = Database['public']['Tables']['activos_fijos']['Row']

function fmt(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n || 0)
}

const CATEGORIAS = ['Equipo', 'Mobiliario', 'Vehículo', 'Maquinaria', 'Edificio', 'Software', 'Otro']

const VACIO = {
  nombre: '',
  categoria: 'Equipo',
  fecha_compra: new Date().toISOString().slice(0, 10),
  valor_compra: '0',
  valor_residual: '0',
  vida_util_anios: '5',
}

export default function ActivosFijosPage() {
  const { perfil } = useAuth()
  const empresaId = perfil?.empresa_id ?? null

  const [activos, setActivos] = useState<Activo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState(VACIO)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Cada activo, con su depreciación calculada por el motor contable (no en el frontend).
  const [depreciaciones, setDepreciaciones] = useState<Record<string, ResultadoDepreciacion | 'error'>>({})

  async function cargar() {
    if (!empresaId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: err } = await supabase.from('activos_fijos').select('*').eq('empresa_id', empresaId).order('fecha_compra', { ascending: false })
    if (err) setError(err.message)
    else setActivos((data ?? []) as unknown as Activo[])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  // Al cargar la lista, pide la depreciación real de cada activo al motor contable.
  useEffect(() => {
    let cancelado = false
    async function calcularTodas() {
      for (const a of activos) {
        if (depreciaciones[a.id]) continue
        try {
          const resultado = await calcularDepreciacion({
            valorCompra: a.valor_compra,
            valorResidual: a.valor_residual,
            vidaUtilAnios: a.vida_util_anios,
            fechaCompra: a.fecha_compra,
          })
          if (!cancelado) setDepreciaciones((prev) => ({ ...prev, [a.id]: resultado }))
        } catch {
          if (!cancelado) setDepreciaciones((prev) => ({ ...prev, [a.id]: 'error' }))
        }
      }
    }
    calcularTodas()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activos])

  const totales = useMemo(() => {
    let valor = 0,
      depAcum = 0,
      libros = 0
    activos.forEach((a) => {
      valor += a.valor_compra || 0
      const d = depreciaciones[a.id]
      if (d && d !== 'error') {
        depAcum += d.depreciacionAcumulada
        libros += d.valorEnLibros
      } else {
        libros += a.valor_compra || 0
      }
    })
    return { valor, depAcum, libros }
  }, [activos, depreciaciones])

  function abrirNuevo() {
    setForm(VACIO)
    setErrorForm(null)
    setMostrarForm(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim() || !form.fecha_compra) {
      setErrorForm('Nombre y fecha de compra son obligatorios.')
      return
    }
    const valorCompra = parseFloat(form.valor_compra) || 0
    const valorResidual = parseFloat(form.valor_residual) || 0
    const vidaUtil = parseInt(form.vida_util_anios) || 5
    if (valorCompra <= 0) {
      setErrorForm('El valor de compra debe ser mayor a 0.')
      return
    }
    if (valorResidual >= valorCompra) {
      setErrorForm('El valor residual debe ser menor al valor de compra.')
      return
    }
    if (!empresaId) return

    // Se valida contra el motor contable antes de guardar — si rechaza los
    // números, ni se registra el activo.
    setGuardando(true)
    setErrorForm(null)
    try {
      await calcularDepreciacion({ valorCompra, valorResidual, vidaUtilAnios: vidaUtil, fechaCompra: form.fecha_compra })
    } catch (err) {
      setGuardando(false)
      setErrorForm((err as Error).message)
      return
    }

    const { error: err } = await supabase.from('activos_fijos').insert({
      empresa_id: empresaId,
      nombre: form.nombre.trim(),
      categoria: form.categoria,
      fecha_compra: form.fecha_compra,
      valor_compra: valorCompra,
      valor_residual: valorResidual,
      vida_util_anios: vidaUtil,
    })
    setGuardando(false)
    if (err) {
      setErrorForm(err.message)
      return
    }
    setMostrarForm(false)
    await cargar()
  }

  async function handleEliminar(a: Activo) {
    if (!confirm(`¿Eliminar el activo "${a.nombre}"?`)) return
    const { error: err } = await supabase.from('activos_fijos').delete().eq('id', a.id)
    if (err) {
      setError(err.message)
      return
    }
    await cargar()
  }

  if (!empresaId) {
    return (
      <div className="p-6">
        <p className="text-sm text-white/60">Tu usuario no tiene una empresa activa asignada.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Activos Fijos</h2>
          <p className="text-xs text-white/40 mt-0.5">Depreciación en línea recta — calculada por el motor contable</p>
        </div>
        <button onClick={abrirNuevo} className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[var(--color-blue-6)] transition-colors">+ Nuevo Activo</button>
      </div>

      {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {loading ? (
        <p className="text-xs text-white/40">Cargando…</p>
      ) : activos.length === 0 ? (
        <EstadoVacio icono="🏭" titulo="Sin activos fijos registrados" descripcion="Registra el primer activo (equipo, mobiliario, vehículo…)." accion={{ label: '+ Nuevo Activo', onClick: abrirNuevo }} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-[11px] text-white/40">Valor de compra total</p>
              <p className="text-base font-semibold text-white">{fmt(totales.valor)}</p>
            </div>
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-[11px] text-amber-400/70">Depreciación acumulada</p>
              <p className="text-base font-semibold text-amber-400">{fmt(totales.depAcum)}</p>
            </div>
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-[11px] text-emerald-400/70">Valor en libros</p>
              <p className="text-base font-semibold text-emerald-400">{fmt(totales.libros)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                  <th className="px-4 py-2 font-medium">Activo</th>
                  <th className="px-4 py-2 font-medium">Compra</th>
                  <th className="px-4 py-2 font-medium text-right">Valor</th>
                  <th className="px-4 py-2 font-medium text-right">Vida útil</th>
                  <th className="px-4 py-2 font-medium text-right">Dep. mensual</th>
                  <th className="px-4 py-2 font-medium text-right">Dep. acumulada</th>
                  <th className="px-4 py-2 font-medium text-right">Valor en libros</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {activos.map((a) => {
                  const d = depreciaciones[a.id]
                  return (
                    <tr key={a.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5">
                        <p className="text-white">{a.nombre}</p>
                        <p className="text-[11px] text-white/40">{a.categoria}</p>
                      </td>
                      <td className="px-4 py-2.5 text-white/60 text-xs">{a.fecha_compra}</td>
                      <td className="px-4 py-2.5 text-right text-white/70">{fmt(a.valor_compra)}</td>
                      <td className="px-4 py-2.5 text-right text-white/60 text-xs">{a.vida_util_anios} años</td>
                      {!d ? (
                        <td colSpan={3} className="px-4 py-2.5 text-center text-white/30 text-xs">Calculando…</td>
                      ) : d === 'error' ? (
                        <td colSpan={3} className="px-4 py-2.5 text-center text-red-400 text-xs">Error al calcular</td>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 text-right text-white/70">{fmt(d.depreciacionMensual)}</td>
                          <td className="px-4 py-2.5 text-right text-amber-400">{fmt(d.depreciacionAcumulada)}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-400 font-medium">
                            {fmt(d.valorEnLibros)}
                            {d.vidaUtilAgotada && <span className="ml-1 text-[10px] text-white/30">(agotado)</span>}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => handleEliminar(a)} className="text-[11px] text-red-400/70 hover:text-red-400">Eliminar</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {mostrarForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setMostrarForm(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">Nuevo activo fijo</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Nombre *</label>
                <input autoFocus value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Categoría</label>
                <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                  {CATEGORIAS.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Fecha de compra *</label>
                <input type="date" value={form.fecha_compra} onChange={(e) => setForm({ ...form, fecha_compra: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Valor de compra</label>
                  <input type="number" step="0.01" value={form.valor_compra} onChange={(e) => setForm({ ...form, valor_compra: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Valor residual</label>
                  <input type="number" step="0.01" value={form.valor_residual} onChange={(e) => setForm({ ...form, valor_residual: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Vida útil (años)</label>
                <input type="number" min="1" value={form.vida_util_anios} onChange={(e) => setForm({ ...form, vida_util_anios: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              {errorForm && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorForm}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setMostrarForm(false)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">Cancelar</button>
                <button type="submit" disabled={guardando} className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">{guardando ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
