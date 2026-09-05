import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { crearAsiento } from '../../lib/contabilidad'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'
import EstadoVacio from '../../components/EstadoVacio'

type Cargo = Database['public']['Tables']['cxc_cargos']['Row']
type Abono = Database['public']['Tables']['cxc_abonos']['Row']
type Cliente = Database['public']['Tables']['clientes']['Row']
type Config = Database['public']['Tables']['config_cuentas_contables']['Row']

function fmt(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n || 0)
}

const CARGO_VACIO = { cliente_id: '', concepto: '', fecha: new Date().toISOString().slice(0, 10), total: '', fecha_vencimiento: '', observaciones: '' }

type Fila = Cargo & { abonado: number; saldo: number; vencido: boolean; diasParaVencer: number | null }

// Cuentas por Cobrar: cargos a clientes (facturas a crédito, servicios, etc.),
// abonos parciales/totales, y aging (vencido / por vencer / al día). Registrar
// un abono SÍ contabiliza (débito Caja/Bancos, crédito CxC vía
// config_cuentas_contables) — corrige el bug heredado del legacy que tenía
// los códigos de cuenta hardcodeados ('1.1.01'/'1.1.02'/'1.1.03') en vez de
// usar la configuración real de la empresa. Fuera de alcance por ahora
// (como en Compras/Nómina): convenios de pago/condonación y recordatorios
// automáticos — son funciones secundarias del legacy, no el núcleo de CxC.
export default function CxCPage() {
  const { perfil } = useAuth()
  const empresaId = perfil?.empresa_id ?? null

  const [cargos, setCargos] = useState<Cargo[]>([])
  const [abonos, setAbonos] = useState<Abono[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'vencido' | 'por_vencer' | 'al_dia' | 'pagado'>('todos')

  const [mostrarForm, setMostrarForm] = useState(false)
  const [formCargo, setFormCargo] = useState(CARGO_VACIO)
  const [guardandoCargo, setGuardandoCargo] = useState(false)
  const [errorCargo, setErrorCargo] = useState<string | null>(null)

  const [abonando, setAbonando] = useState<Fila | null>(null)
  const [formAbono, setFormAbono] = useState({ monto: '', fecha: new Date().toISOString().slice(0, 10), metodo: 'Efectivo', referencia: '', observacion: '' })
  const [guardandoAbono, setGuardandoAbono] = useState(false)
  const [errorAbono, setErrorAbono] = useState<string | null>(null)

  const [ledger, setLedger] = useState<Fila | null>(null)

  async function cargar() {
    if (!empresaId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [cargosRes, abonosRes, clientesRes, configRes] = await Promise.all([
      supabase.from('cxc_cargos').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }),
      supabase.from('cxc_abonos').select('*').eq('empresa_id', empresaId),
      supabase.from('clientes').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('config_cuentas_contables').select('*').eq('empresa_id', empresaId).maybeSingle(),
    ])
    if (cargosRes.error) setError(cargosRes.error.message)
    else setError(null)
    setCargos((cargosRes.data ?? []) as unknown as Cargo[])
    setAbonos((abonosRes.data ?? []) as unknown as Abono[])
    setClientes((clientesRes.data ?? []) as unknown as Cliente[])
    setConfig((configRes.data ?? null) as unknown as Config | null)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const nombreCliente = (id: string) => clientes.find((c) => c.id === id)?.nombre ?? '—'

  const filas: Fila[] = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10)
    return cargos.map((c) => {
      const abonado = abonos.filter((a) => a.cargo_id === c.id).reduce((s, a) => s + (a.monto || 0), 0)
      const saldo = Math.max(0, (c.total || 0) - abonado)
      const vencido = saldo > 0.01 && !!c.fecha_vencimiento && c.fecha_vencimiento < hoy
      let diasParaVencer: number | null = null
      if (saldo > 0.01 && c.fecha_vencimiento) {
        diasParaVencer = Math.ceil((new Date(c.fecha_vencimiento).getTime() - new Date(hoy).getTime()) / 86400000)
      }
      return { ...c, abonado, saldo, vencido, diasParaVencer }
    })
  }, [cargos, abonos])

  const filasFiltradas = filas.filter((f) => {
    if (filtro === 'todos') return true
    if (filtro === 'pagado') return f.saldo <= 0.01
    if (f.saldo <= 0.01) return false
    if (filtro === 'vencido') return f.vencido
    if (filtro === 'por_vencer') return !f.vencido && f.diasParaVencer !== null && f.diasParaVencer <= 7
    if (filtro === 'al_dia') return !f.vencido && !(f.diasParaVencer !== null && f.diasParaVencer <= 7)
    return true
  })

  const resumen = useMemo(() => {
    const pendientes = filas.filter((f) => f.saldo > 0.01)
    return {
      totalPorCobrar: pendientes.reduce((s, f) => s + f.saldo, 0),
      vencido: pendientes.filter((f) => f.vencido).reduce((s, f) => s + f.saldo, 0),
      porVencer7: pendientes.filter((f) => !f.vencido && f.diasParaVencer !== null && f.diasParaVencer <= 7).reduce((s, f) => s + f.saldo, 0),
      numPendientes: pendientes.length,
    }
  }, [filas])

  // ── Nuevo cargo ──
  async function handleSubmitCargo(e: FormEvent) {
    e.preventDefault()
    if (!empresaId) return
    if (!formCargo.cliente_id || !formCargo.concepto.trim()) {
      setErrorCargo('Cliente y concepto son obligatorios.')
      return
    }
    const total = parseFloat(formCargo.total) || 0
    if (total <= 0) {
      setErrorCargo('El total debe ser mayor a 0.')
      return
    }
    setGuardandoCargo(true)
    setErrorCargo(null)
    const { error: err } = await supabase.from('cxc_cargos').insert({
      empresa_id: empresaId,
      cliente_id: formCargo.cliente_id,
      concepto: formCargo.concepto.trim(),
      fecha: formCargo.fecha,
      total,
      fecha_vencimiento: formCargo.fecha_vencimiento || null,
      observaciones: formCargo.observaciones.trim() || null,
    })
    setGuardandoCargo(false)
    if (err) {
      setErrorCargo(err.message)
      return
    }
    setMostrarForm(false)
    setFormCargo(CARGO_VACIO)
    await cargar()
  }

  async function handleEliminarCargo(f: Fila) {
    if (f.abonado > 0) {
      setError('No se puede eliminar un cargo que ya tiene abonos registrados.')
      return
    }
    if (!confirm(`¿Eliminar el cargo "${f.concepto}"?`)) return
    const { error: err } = await supabase.from('cxc_cargos').delete().eq('id', f.id)
    if (err) {
      setError(err.message)
      return
    }
    await cargar()
  }

  // ── Abono ──
  function abrirAbono(f: Fila) {
    setAbonando(f)
    setFormAbono({ monto: f.saldo.toFixed(2), fecha: new Date().toISOString().slice(0, 10), metodo: 'Efectivo', referencia: '', observacion: '' })
    setErrorAbono(null)
  }

  async function confirmarAbono(e: FormEvent) {
    e.preventDefault()
    if (!abonando || !empresaId) return
    const monto = parseFloat(formAbono.monto) || 0
    if (monto <= 0) return setErrorAbono('El monto debe ser mayor a 0.')
    if (monto > abonando.saldo + 0.01) return setErrorAbono(`El abono (${fmt(monto)}) supera el saldo pendiente (${fmt(abonando.saldo)}).`)

    const cuentaOrigenId = formAbono.metodo === 'Efectivo' ? config?.cuenta_caja_id : config?.cuenta_bancos_id
    if (!config?.cuenta_cxc_id || !cuentaOrigenId) {
      setErrorAbono(`Falta configurar Cuentas por Cobrar y/o ${formAbono.metodo === 'Efectivo' ? 'Caja' : 'Bancos'} en Configuración contable.`)
      return
    }

    setGuardandoAbono(true)
    setErrorAbono(null)

    try {
      await crearAsiento({
        empresaId,
        concepto: `Abono CxC: ${abonando.concepto} — ${nombreCliente(abonando.cliente_id)} (${formAbono.metodo} / Cuentas por Cobrar)`,
        fecha: formAbono.fecha,
        lineas: [
          { cuenta_id: cuentaOrigenId, debe: monto, haber: 0 },
          { cuenta_id: config.cuenta_cxc_id, debe: 0, haber: monto },
        ],
        prefijo: 'ABN',
        creadoPor: perfil?.id ?? null,
      })
    } catch (asientoErr) {
      setGuardandoAbono(false)
      setErrorAbono(`El asiento contable falló: ${(asientoErr as Error).message}`)
      return
    }

    const { error: err } = await supabase.from('cxc_abonos').insert({
      empresa_id: empresaId,
      cargo_id: abonando.id,
      cliente_id: abonando.cliente_id,
      monto,
      fecha: formAbono.fecha,
      metodo: formAbono.metodo,
      referencia: formAbono.referencia.trim() || null,
      observacion: formAbono.observacion.trim() || null,
    })

    setGuardandoAbono(false)
    if (err) {
      setErrorAbono(`El abono se contabilizó pero no se pudo registrar el detalle: ${err.message}`)
      return
    }
    setAbonando(null)
    await cargar()
  }

  if (!empresaId) return <EstadoVacio icono="💳" titulo="Sin empresa asignada" descripcion="Tu usuario no tiene una empresa asignada todavía." />

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold text-white">Cuentas por Cobrar</h1>
        <button onClick={() => setMostrarForm(true)} className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[var(--color-blue-6)]">
          + Nuevo cargo
        </button>
      </div>
      <p className="text-xs text-white/40 mb-4">Cargos a clientes, abonos y antigüedad de saldos.</p>

      {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-2xl border border-white/10 p-3">
          <p className="text-[11px] text-white/40">Total por cobrar</p>
          <p className="text-lg font-semibold text-white">{fmt(resumen.totalPorCobrar)}</p>
          <p className="text-[11px] text-white/30">{resumen.numPendientes} cargo(s) pendiente(s)</p>
        </div>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-[11px] text-red-300/70">Vencido</p>
          <p className="text-lg font-semibold text-red-400">{fmt(resumen.vencido)}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-[11px] text-amber-300/70">Por vencer (7 días)</p>
          <p className="text-lg font-semibold text-amber-400">{fmt(resumen.porVencer7)}</p>
        </div>
      </div>

      <div className="flex gap-1.5 mb-3">
        {([
          ['todos', 'Todos'],
          ['vencido', 'Vencidos'],
          ['por_vencer', 'Por vencer'],
          ['al_dia', 'Al día'],
          ['pagado', 'Pagados'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFiltro(key)}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${filtro === key ? 'bg-[var(--color-blue-5)] text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-xs text-white/40">Cargando…</p>
      ) : filasFiltradas.length === 0 ? (
        <EstadoVacio icono="💳" titulo="Sin cargos" descripcion="No hay cargos que coincidan con este filtro." />
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Concepto</th>
                <th className="px-4 py-2 font-medium">Vence</th>
                <th className="px-4 py-2 font-medium text-right">Total</th>
                <th className="px-4 py-2 font-medium text-right">Saldo</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.map((f) => (
                <tr key={f.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-4 py-2.5 text-white">{nombreCliente(f.cliente_id)}</td>
                  <td className="px-4 py-2.5 text-white/60 text-xs">{f.concepto}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {f.fecha_vencimiento ? (
                      <span className={f.vencido ? 'text-red-400' : f.diasParaVencer !== null && f.diasParaVencer <= 7 ? 'text-amber-400' : 'text-white/50'}>
                        {f.fecha_vencimiento}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-white/70 text-xs">{fmt(f.total)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-xs">
                    <span className={f.saldo <= 0.01 ? 'text-emerald-400' : 'text-white'}>{fmt(f.saldo)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => setLedger(f)} className="text-[11px] text-white/50 hover:text-white mr-3">Ver</button>
                    {f.saldo > 0.01 && <button onClick={() => abrirAbono(f)} className="text-[11px] text-emerald-400 hover:text-emerald-300 mr-3">Abonar</button>}
                    {f.abonado === 0 && <button onClick={() => handleEliminarCargo(f)} className="text-[11px] text-red-400/70 hover:text-red-400">Eliminar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mostrarForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setMostrarForm(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">Nuevo cargo</h3>
            <form onSubmit={handleSubmitCargo} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Cliente *</label>
                <select value={formCargo.cliente_id} onChange={(e) => setFormCargo({ ...formCargo, cliente_id: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                  <option value="">Selecciona…</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Concepto *</label>
                <input value={formCargo.concepto} onChange={(e) => setFormCargo({ ...formCargo, concepto: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Fecha</label>
                  <input type="date" value={formCargo.fecha} onChange={(e) => setFormCargo({ ...formCargo, fecha: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Vencimiento</label>
                  <input type="date" value={formCargo.fecha_vencimiento} onChange={(e) => setFormCargo({ ...formCargo, fecha_vencimiento: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Total *</label>
                <input type="number" step="0.01" value={formCargo.total} onChange={(e) => setFormCargo({ ...formCargo, total: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Observaciones</label>
                <input value={formCargo.observaciones} onChange={(e) => setFormCargo({ ...formCargo, observaciones: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <p className="text-[11px] text-white/30">Este cargo no genera asiento automático (igual que en el sistema anterior) — regístralo en Libro Diario si corresponde. Cuando se abone, el abono sí contabiliza.</p>
              {errorCargo && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorCargo}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setMostrarForm(false)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">Cancelar</button>
                <button type="submit" disabled={guardandoCargo} className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">
                  {guardandoCargo ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {abonando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setAbonando(null)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Registrar abono</h3>
            <p className="text-xs text-white/40 mb-4">{abonando.concepto} · {nombreCliente(abonando.cliente_id)} · Saldo: {fmt(abonando.saldo)}</p>
            <form onSubmit={confirmarAbono} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Monto *</label>
                <input type="number" step="0.01" value={formAbono.monto} onChange={(e) => setFormAbono({ ...formAbono, monto: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Fecha</label>
                  <input type="date" value={formAbono.fecha} onChange={(e) => setFormAbono({ ...formAbono, fecha: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Método</label>
                  <select value={formAbono.metodo} onChange={(e) => setFormAbono({ ...formAbono, metodo: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                    <option>Efectivo</option>
                    <option>Tarjeta</option>
                    <option>Transferencia</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Referencia</label>
                <input value={formAbono.referencia} onChange={(e) => setFormAbono({ ...formAbono, referencia: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              {errorAbono && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorAbono}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setAbonando(null)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">Cancelar</button>
                <button type="submit" disabled={guardandoAbono} className="flex-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold py-2 hover:bg-emerald-500 disabled:opacity-60">
                  {guardandoAbono ? 'Contabilizando…' : '💾 Registrar abono'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {ledger && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setLedger(null)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-md my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Detalle del cargo</h3>
            <p className="text-xs text-white/40 mb-4">{nombreCliente(ledger.cliente_id)} · {ledger.concepto} · Total {fmt(ledger.total)}</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/10">
                  <th className="py-1.5 font-medium">Fecha</th>
                  <th className="py-1.5 font-medium">Tipo</th>
                  <th className="py-1.5 font-medium text-right">Debe</th>
                  <th className="py-1.5 font-medium text-right">Haber</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/5 font-medium">
                  <td className="py-1.5 text-white">{ledger.fecha}</td>
                  <td className="py-1.5 text-white">Cargo</td>
                  <td className="py-1.5 text-right text-red-300">{fmt(ledger.total)}</td>
                  <td className="py-1.5 text-right">—</td>
                </tr>
                {abonos.filter((a) => a.cargo_id === ledger.id).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((a) => (
                  <tr key={a.id} className="border-b border-white/5">
                    <td className="py-1.5 text-white/70">{a.fecha}</td>
                    <td className="py-1.5 text-white/70">Abono ({a.metodo})</td>
                    <td className="py-1.5 text-right">—</td>
                    <td className="py-1.5 text-right text-emerald-400">{fmt(a.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end mt-3">
              <button onClick={() => setLedger(null)} className="text-xs text-white/50 hover:text-white">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
