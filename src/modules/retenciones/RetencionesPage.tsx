import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { crearAsiento } from '../../lib/contabilidad'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'
import EstadoVacio from '../../components/EstadoVacio'

type Retencion = Database['public']['Tables']['retenciones']['Row']
type Proveedor = Database['public']['Tables']['proveedores']['Row']
type Compra = Database['public']['Tables']['compras']['Row']
type Config = Database['public']['Tables']['config_cuentas_contables']['Row']

function fmt(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n || 0)
}

const VACIO = {
  proveedor_id: '',
  numero: '',
  fecha: new Date().toISOString().slice(0, 10),
  base_iva: '0',
  pct_iva: '70',
  base_renta: '0',
  pct_renta: '1',
  factura_ref: '',
  autorizacion: '',
  compra_id: '',
}

// Retenciones Emitidas (a proveedores). A diferencia del legacy, que contabilizaba
// con postearCuenta() (ajuste directo del saldo, sin dejar rastro en Libro Diario),
// esta versión SÍ crea un asiento real vía fn_crear_asiento — mismo criterio que
// Compras/CxC. Al vincular una retención a una compra a crédito: débito Cuentas
// por Pagar (reduce lo que se le debe al proveedor) / crédito Retenciones por Pagar
// (nueva obligación con el SRI). Al eliminar una retención vinculada, se crea un
// asiento de reversión (no se reescribe historia).
export default function RetencionesPage() {
  const { perfil } = useAuth()
  const empresaId = perfil?.empresa_id ?? null

  const [retenciones, setRetenciones] = useState<Retencion[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [comprasPendientes, setComprasPendientes] = useState<Compra[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editando, setEditando] = useState<Retencion | null>(null)
  const [form, setForm] = useState(VACIO)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  async function cargar() {
    if (!empresaId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [retRes, provRes, configRes] = await Promise.all([
      supabase.from('retenciones').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('proveedores').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('config_cuentas_contables').select('*').eq('empresa_id', empresaId).maybeSingle(),
    ])
    if (retRes.error) setError(retRes.error.message)
    else setError(null)
    setRetenciones((retRes.data ?? []) as unknown as Retencion[])
    setProveedores((provRes.data ?? []) as unknown as Proveedor[])
    setConfig((configRes.data ?? null) as unknown as Config | null)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  async function cargarComprasPendientes(proveedorId: string) {
    if (!proveedorId) {
      setComprasPendientes([])
      return
    }
    const { data } = await supabase.from('compras').select('*').eq('proveedor_id', proveedorId).neq('estado', 'Pagado')
    setComprasPendientes((data ?? []) as unknown as Compra[])
  }

  const nombreProveedor = (id: string) => proveedores.find((p) => p.id === id)?.nombre ?? 'N/D'

  const calculo = useMemo(() => {
    const biva = parseFloat(form.base_iva) || 0
    const piva = parseFloat(form.pct_iva) || 0
    const bren = parseFloat(form.base_renta) || 0
    const pren = parseFloat(form.pct_renta) || 0
    const retIva = (biva * piva) / 100
    const retRenta = (bren * pren) / 100
    return { retIva, retRenta, total: retIva + retRenta }
  }, [form.base_iva, form.pct_iva, form.base_renta, form.pct_renta])

  function abrirNueva() {
    setEditando(null)
    setForm(VACIO)
    setComprasPendientes([])
    setErrorForm(null)
    setMostrarForm(true)
  }

  function abrirEditar(r: Retencion) {
    setEditando(r)
    setForm({
      proveedor_id: r.proveedor_id,
      numero: r.numero,
      fecha: r.fecha,
      base_iva: String(r.base_iva),
      pct_iva: String(r.pct_iva),
      base_renta: String(r.base_renta),
      pct_renta: String(r.pct_renta),
      factura_ref: r.factura_ref ?? '',
      autorizacion: r.autorizacion ?? '',
      compra_id: r.compra_id ?? '',
    })
    cargarComprasPendientes(r.proveedor_id)
    setErrorForm(null)
    setMostrarForm(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!empresaId) return
    if (!form.proveedor_id || !form.numero.trim()) return setErrorForm('Proveedor y número son obligatorios.')

    setGuardando(true)
    setErrorForm(null)

    const payload = {
      empresa_id: empresaId,
      proveedor_id: form.proveedor_id,
      numero: form.numero.trim(),
      fecha: form.fecha,
      base_iva: parseFloat(form.base_iva) || 0,
      pct_iva: parseFloat(form.pct_iva) || 0,
      ret_iva: calculo.retIva,
      base_renta: parseFloat(form.base_renta) || 0,
      pct_renta: parseFloat(form.pct_renta) || 0,
      ret_renta: calculo.retRenta,
      total_retenido: calculo.total,
      factura_ref: form.factura_ref.trim() || null,
      autorizacion: form.autorizacion.trim() || null,
      compra_id: form.compra_id || null,
    }

    let retId: string
    if (editando) {
      const { error: err } = await supabase.from('retenciones').update(payload).eq('id', editando.id)
      setGuardando(false)
      if (err) return setErrorForm(err.message)
      retId = editando.id
    } else {
      const { data, error: err } = await supabase.from('retenciones').insert(payload).select().single()
      if (err || !data) {
        setGuardando(false)
        setErrorForm(err?.message ?? 'No se pudo registrar la retención.')
        return
      }
      retId = (data as unknown as Retencion).id

      // Solo se contabiliza al CREAR (no al editar) y solo si está vinculada a una
      // compra — mismo criterio que el legacy.
      if (form.compra_id && calculo.total > 0) {
        if (!config?.cuenta_cxp_id || !config?.cuenta_retenciones_id) {
          setGuardando(false)
          setMostrarForm(false)
          setError('Retención registrada, pero NO se contabilizó: falta configurar Cuentas por Pagar y/o Retenciones por Pagar en Configuración contable.')
          await cargar()
          return
        }
        try {
          await crearAsiento({
            empresaId,
            concepto: `Retención emitida ${payload.numero} — ${nombreProveedor(form.proveedor_id)} (Cuentas por Pagar / Retenciones por Pagar)`,
            fecha: form.fecha,
            lineas: [
              { cuenta_id: config.cuenta_cxp_id, debe: calculo.total, haber: 0 },
              { cuenta_id: config.cuenta_retenciones_id, debe: 0, haber: calculo.total },
            ],
            prefijo: 'RET',
            creadoPor: perfil?.id ?? null,
          })
        } catch (asientoErr) {
          setGuardando(false)
          setMostrarForm(false)
          setError(`La retención se registró pero el asiento contable falló: ${(asientoErr as Error).message}`)
          await cargar()
          return
        }
        await supabase.from('compras').update({ retencion_id: retId, monto_retenido: calculo.total }).eq('id', form.compra_id)
      }
    }

    setGuardando(false)
    setMostrarForm(false)
    await cargar()
  }

  async function handleEliminar(r: Retencion) {
    if (!confirm(`¿Eliminar la retención "${r.numero}"?${r.compra_id ? ' Se revertirá el asiento contable que generó.' : ''}`)) return
    const { error: err } = await supabase.from('retenciones').delete().eq('id', r.id)
    if (err) {
      setError(err.message)
      return
    }
    if (r.compra_id && r.total_retenido > 0 && empresaId) {
      if (!config?.cuenta_cxp_id || !config?.cuenta_retenciones_id) {
        setError('Retención eliminada, pero el asiento NO se revirtió: falta configurar Cuentas por Pagar y/o Retenciones por Pagar.')
      } else {
        try {
          await crearAsiento({
            empresaId,
            concepto: `Reversión retención ${r.numero} — ${nombreProveedor(r.proveedor_id)} (eliminada)`,
            fecha: new Date().toISOString().slice(0, 10),
            lineas: [
              { cuenta_id: config.cuenta_retenciones_id, debe: r.total_retenido, haber: 0 },
              { cuenta_id: config.cuenta_cxp_id, debe: 0, haber: r.total_retenido },
            ],
            prefijo: 'RET',
            creadoPor: perfil?.id ?? null,
          })
        } catch (asientoErr) {
          setError(`Retención eliminada, pero la reversión contable falló: ${(asientoErr as Error).message}`)
        }
      }
      await supabase.from('compras').update({ retencion_id: null, monto_retenido: 0 }).eq('id', r.compra_id)
    }
    await cargar()
  }

  if (!empresaId) return <EstadoVacio icono="📑" titulo="Sin empresa asignada" descripcion="Tu usuario no tiene una empresa asignada todavía." />

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold text-white">Retenciones Emitidas</h1>
        <button onClick={abrirNueva} className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[var(--color-blue-6)]">
          + Nueva retención
        </button>
      </div>
      <p className="text-xs text-white/40 mb-4">Comprobantes de retención (IVA/Renta) emitidos a tus proveedores.</p>

      {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {loading ? (
        <p className="text-xs text-white/40">Cargando…</p>
      ) : retenciones.length === 0 ? (
        <EstadoVacio icono="📑" titulo="Sin retenciones" descripcion="Registra tu primer comprobante de retención." accion={{ label: '+ Nueva retención', onClick: abrirNueva }} />
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2 font-medium">Número</th>
                <th className="px-4 py-2 font-medium">Proveedor</th>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium text-right">Ret. IVA</th>
                <th className="px-4 py-2 font-medium text-right">Ret. Renta</th>
                <th className="px-4 py-2 font-medium text-right">Total</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {retenciones.map((r) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-4 py-2.5 text-white font-mono text-xs">{r.numero}</td>
                  <td className="px-4 py-2.5 text-white/70 text-xs">{nombreProveedor(r.proveedor_id)}</td>
                  <td className="px-4 py-2.5 text-white/50 text-xs">{r.fecha}</td>
                  <td className="px-4 py-2.5 text-right text-white/60 text-xs">{fmt(r.ret_iva)}</td>
                  <td className="px-4 py-2.5 text-right text-white/60 text-xs">{fmt(r.ret_renta)}</td>
                  <td className="px-4 py-2.5 text-right text-white font-medium text-xs">{fmt(r.total_retenido)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => abrirEditar(r)} className="text-[11px] text-white/50 hover:text-white mr-3">Editar</button>
                    <button onClick={() => handleEliminar(r)} className="text-[11px] text-red-400/70 hover:text-red-400">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mostrarForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setMostrarForm(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-md my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">{editando ? 'Editar retención' : 'Nueva retención'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Proveedor *</label>
                  <select
                    value={form.proveedor_id}
                    onChange={(e) => {
                      setForm({ ...form, proveedor_id: e.target.value, compra_id: '' })
                      cargarComprasPendientes(e.target.value)
                    }}
                    disabled={!!editando}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)] disabled:opacity-50"
                  >
                    <option value="">Selecciona…</option>
                    {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Número *</label>
                  <input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
              </div>

              {!editando && (
                <div>
                  <label className="block text-xs text-white/50 mb-1">Vincular a compra (opcional)</label>
                  <select value={form.compra_id} onChange={(e) => {
                    const compraId = e.target.value
                    const compra = comprasPendientes.find((c) => c.id === compraId)
                    setForm({ ...form, compra_id: compraId, base_iva: compra ? String(compra.baseiva || 0) : form.base_iva })
                  }} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                    <option value="">Sin compra asociada</option>
                    {comprasPendientes.map((c) => <option key={c.id} value={c.id}>{c.numero} · {fmt(c.total)} · {c.fecha}</option>)}
                  </select>
                  {form.compra_id && <p className="text-[11px] text-white/30 mt-1">Al guardar se contabilizará: débito Cuentas por Pagar / crédito Retenciones por Pagar.</p>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Base IVA</label>
                  <input type="number" step="0.01" value={form.base_iva} onChange={(e) => setForm({ ...form, base_iva: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">% Ret. IVA</label>
                  <input type="number" step="1" value={form.pct_iva} onChange={(e) => setForm({ ...form, pct_iva: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Base Renta</label>
                  <input type="number" step="0.01" value={form.base_renta} onChange={(e) => setForm({ ...form, base_renta: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">% Ret. Renta</label>
                  <input type="number" step="0.5" value={form.pct_renta} onChange={(e) => setForm({ ...form, pct_renta: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
              </div>

              <div className="rounded-lg bg-white/5 p-3 text-xs space-y-1">
                <div className="flex justify-between text-white/60"><span>Ret. IVA</span><span>{fmt(calculo.retIva)}</span></div>
                <div className="flex justify-between text-white/60"><span>Ret. Renta</span><span>{fmt(calculo.retRenta)}</span></div>
                <div className="flex justify-between text-white font-semibold border-t border-white/10 pt-1 mt-1"><span>Total retenido</span><span>{fmt(calculo.total)}</span></div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Fecha</label>
                  <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Autorización</label>
                  <input value={form.autorizacion} onChange={(e) => setForm({ ...form, autorizacion: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Ref. factura</label>
                <input value={form.factura_ref} onChange={(e) => setForm({ ...form, factura_ref: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
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
    </div>
  )
}
