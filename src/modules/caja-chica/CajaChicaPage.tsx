import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'
import EstadoVacio from '../../components/EstadoVacio'

type CajaChica = Database['public']['Tables']['caja_chica']['Row']
type Movimiento = Database['public']['Tables']['caja_chica_movimientos']['Row']
type PlanCuenta = Database['public']['Tables']['plan_cuentas']['Row']

function fmt(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n || 0)
}

const hoy = () => new Date().toISOString().slice(0, 10)

// Fondo de Caja Chica: apertura, gastos y reposiciones, cada uno contabiliza
// un asiento real y balanceado vía las RPC fn_abrir_caja_chica /
// fn_registrar_gasto_caja_chica / fn_reponer_caja_chica. A diferencia del
// legacy (que detectaba la cuenta "Caja Chica" por nombre con un ilike y
// fallaba si no coincidía exacto), aquí la cuenta del fondo se elige
// explícitamente al abrirlo, igual que la cuenta de origen — sin adivinar
// por nombre. Las 3 RPC fueron corregidas de raíz antes de esta migración:
// tenían EXECUTE abierto a `anon` y no validaban permiso de empresa (hueco
// de seguridad real, cerrado aparte). Ahora validan permiso y usan
// fn_crear_asiento (motor atómico central) en vez de insertar directo en
// asientos/asiento_lineas.
export default function CajaChicaPage() {
  const { perfil } = useAuth()
  const empresaId = perfil?.empresa_id ?? null

  const [caja, setCaja] = useState<CajaChica | null>(null)
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [cuentas, setCuentas] = useState<PlanCuenta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modal, setModal] = useState<null | 'apertura' | 'gasto' | 'reposicion'>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorModal, setErrorModal] = useState<string | null>(null)

  const [formApertura, setFormApertura] = useState({ nombre: 'Caja Chica Principal', monto: '', fecha: hoy(), cuentaCajaChica: '', cuentaOrigen: '' })
  const [formGasto, setFormGasto] = useState({ monto: '', fecha: hoy(), concepto: '', beneficiario: '', cuenta: '' })
  const [formReposicion, setFormReposicion] = useState({ monto: '', fecha: hoy(), cuentaOrigen: '' })

  async function cargar() {
    if (!empresaId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [cajaRes, cuentasRes] = await Promise.all([
      supabase.from('caja_chica').select('*').eq('empresa_id', empresaId).eq('estado', 'Activa').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('plan_cuentas').select('*').eq('empresa_id', empresaId).eq('es_detalle', true).order('codigo'),
    ])
    if (cajaRes.error) setError(cajaRes.error.message)
    else setError(null)
    const cajaActual = (cajaRes.data ?? null) as unknown as CajaChica | null
    setCaja(cajaActual)
    setCuentas((cuentasRes.data ?? []) as unknown as PlanCuenta[])

    if (cajaActual) {
      const movsRes = await supabase.from('caja_chica_movimientos').select('*').eq('caja_chica_id', cajaActual.id).order('created_at', { ascending: false })
      setMovimientos((movsRes.data ?? []) as unknown as Movimiento[])
    } else {
      setMovimientos([])
    }
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const cuentasActivo = useMemo(() => cuentas.filter((c) => c.clase === 1), [cuentas])
  const cuentasGasto = useMemo(() => cuentas.filter((c) => c.clase === 5), [cuentas])
  const nombreCuenta = (id: string | null) => (id ? cuentas.find((c) => c.id === id) : null)?.nombre ?? '—'

  const resumen = useMemo(() => {
    const totalGastado = movimientos.filter((m) => m.tipo === 'Gasto').reduce((s, m) => s + (m.monto || 0), 0)
    const totalRepuesto = movimientos.filter((m) => m.tipo === 'Reposicion').reduce((s, m) => s + (m.monto || 0), 0)
    return { totalGastado, totalRepuesto }
  }, [movimientos])

  function abrirModal(tipo: 'apertura' | 'gasto' | 'reposicion') {
    setErrorModal(null)
    if (tipo === 'apertura') setFormApertura({ nombre: 'Caja Chica Principal', monto: '', fecha: hoy(), cuentaCajaChica: '', cuentaOrigen: '' })
    if (tipo === 'gasto') setFormGasto({ monto: '', fecha: hoy(), concepto: '', beneficiario: '', cuenta: '' })
    if (tipo === 'reposicion') setFormReposicion({ monto: '', fecha: hoy(), cuentaOrigen: '' })
    setModal(tipo)
  }

  async function handleApertura(e: FormEvent) {
    e.preventDefault()
    if (!empresaId) return
    const monto = parseFloat(formApertura.monto) || 0
    if (monto <= 0) return setErrorModal('Ingresa el monto del fondo.')
    if (!formApertura.cuentaCajaChica) return setErrorModal('Selecciona la cuenta del fondo de caja chica.')
    if (!formApertura.cuentaOrigen) return setErrorModal('Selecciona la cuenta de origen.')
    if (formApertura.cuentaCajaChica === formApertura.cuentaOrigen) return setErrorModal('La cuenta del fondo y la cuenta de origen deben ser distintas.')

    setGuardando(true)
    setErrorModal(null)
    const { error: err } = await supabase.rpc('fn_abrir_caja_chica', {
      p_empresa_id: empresaId,
      p_nombre: formApertura.nombre.trim() || 'Caja Chica Principal',
      p_monto: monto,
      p_cuenta_caja_chica_id: formApertura.cuentaCajaChica,
      p_cuenta_origen_id: formApertura.cuentaOrigen,
      p_responsable_id: perfil?.id ?? null,
      p_usuario_id: perfil?.id ?? null,
      p_fecha: formApertura.fecha,
    })
    setGuardando(false)
    if (err) return setErrorModal(err.message)
    setModal(null)
    await cargar()
  }

  async function handleGasto(e: FormEvent) {
    e.preventDefault()
    if (!caja) return
    const monto = parseFloat(formGasto.monto) || 0
    if (monto <= 0) return setErrorModal('Ingresa el monto del gasto.')
    if (!formGasto.cuenta) return setErrorModal('Selecciona la cuenta de gasto.')
    if (!formGasto.concepto.trim()) return setErrorModal('Ingresa el concepto.')
    if (monto > caja.saldo_actual + 0.01) return setErrorModal(`El gasto (${fmt(monto)}) supera el saldo disponible (${fmt(caja.saldo_actual)}).`)

    setGuardando(true)
    setErrorModal(null)
    const { error: err } = await supabase.rpc('fn_registrar_gasto_caja_chica', {
      p_caja_chica_id: caja.id,
      p_monto: monto,
      p_cuenta_gasto_id: formGasto.cuenta,
      p_concepto: formGasto.concepto.trim(),
      p_beneficiario: formGasto.beneficiario.trim() || null,
      p_usuario_id: perfil?.id ?? null,
      p_fecha: formGasto.fecha,
    })
    setGuardando(false)
    if (err) return setErrorModal(err.message)
    setModal(null)
    await cargar()
  }

  async function handleReposicion(e: FormEvent) {
    e.preventDefault()
    if (!caja) return
    const monto = parseFloat(formReposicion.monto) || 0
    if (monto <= 0) return setErrorModal('Ingresa el monto a reponer.')
    if (!formReposicion.cuentaOrigen) return setErrorModal('Selecciona la cuenta de origen.')

    setGuardando(true)
    setErrorModal(null)
    const { error: err } = await supabase.rpc('fn_reponer_caja_chica', {
      p_caja_chica_id: caja.id,
      p_monto: monto,
      p_cuenta_origen_id: formReposicion.cuentaOrigen,
      p_usuario_id: perfil?.id ?? null,
      p_fecha: formReposicion.fecha,
    })
    setGuardando(false)
    if (err) return setErrorModal(err.message)
    setModal(null)
    await cargar()
  }

  if (!empresaId) return <EstadoVacio icono="🪙" titulo="Sin empresa asignada" descripcion="Tu usuario no tiene una empresa asignada todavía." />

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-semibold text-white">Fondo de Caja Chica</h1>
      </div>
      <p className="text-xs text-white/40 mb-4">Fondo fijo para gastos menores — cada apertura, gasto y reposición genera su asiento contable automáticamente.</p>

      {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {loading ? (
        <p className="text-xs text-white/40">Cargando…</p>
      ) : !caja ? (
        <div className="rounded-2xl border border-white/10 p-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-white">No hay un fondo de caja chica abierto para esta empresa.</p>
            <p className="text-xs text-white/40 mt-1">Abre un fondo para empezar a registrar gastos menores.</p>
          </div>
          <button onClick={() => abrirModal('apertura')} className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[var(--color-blue-6)] shrink-0">
            + Abrir fondo
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-2xl border border-white/10 p-4">
              <p className="text-[11px] text-white/40">🪙 Saldo disponible</p>
              <p className="text-2xl font-semibold text-emerald-400 font-mono">{fmt(caja.saldo_actual)}</p>
              <p className="text-[11px] text-white/30 mt-1">Fondo asignado: {fmt(caja.monto_fondo)} · {caja.nombre} · abierto desde {caja.fecha_apertura}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => abrirModal('gasto')} className="rounded-lg bg-red-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-red-500">− Registrar gasto</button>
                <button onClick={() => abrirModal('reposicion')} className="rounded-lg border border-white/10 text-white/70 text-xs font-semibold px-3 py-1.5 hover:bg-white/5">🔄 Reponer fondo</button>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 p-4">
              <p className="text-[11px] text-white/40 mb-2">📊 Resumen del fondo</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-white/50">Monto del fondo</span><strong className="text-white font-mono">{fmt(caja.monto_fondo)}</strong></div>
                <div className="flex justify-between"><span className="text-white/50">Total gastado</span><strong className="text-red-400 font-mono">{fmt(resumen.totalGastado)}</strong></div>
                <div className="flex justify-between"><span className="text-white/50">Total repuesto</span><strong className="text-blue-400 font-mono">{fmt(resumen.totalRepuesto)}</strong></div>
                <div className="flex justify-between border-t border-white/10 pt-1.5"><span className="text-white/70 font-medium">Saldo actual</span><strong className="text-emerald-400 font-mono">{fmt(caja.saldo_actual)}</strong></div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 text-xs font-medium text-white/60">📋 Movimientos de caja chica</div>
            {movimientos.length === 0 ? (
              <EstadoVacio icono="📋" titulo="Sin movimientos" descripcion="Aún no hay movimientos en este fondo." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium">Tipo</th>
                    <th className="px-4 py-2 font-medium">Concepto</th>
                    <th className="px-4 py-2 font-medium">Beneficiario</th>
                    <th className="px-4 py-2 font-medium text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5 text-white/70 text-xs">{m.fecha}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className={
                          m.tipo === 'Apertura' ? 'text-blue-400' : m.tipo === 'Gasto' ? 'text-red-400' : m.tipo === 'Reposicion' ? 'text-emerald-400' : 'text-amber-400'
                        }>
                          {m.tipo === 'Reposicion' ? 'Reposición' : m.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-white/60 text-xs">{m.concepto}{m.tipo !== 'Apertura' && m.tipo !== 'Reposicion' && <span className="text-white/30"> · {nombreCuenta(m.cuenta_contrapartida_id)}</span>}</td>
                      <td className="px-4 py-2.5 text-white/50 text-xs">{m.beneficiario || '—'}</td>
                      <td className={`px-4 py-2.5 text-right font-mono text-xs font-medium ${m.tipo === 'Gasto' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {m.tipo === 'Gasto' ? '−' : '+'}{fmt(m.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {modal === 'apertura' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setModal(null)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">🪙 Abrir fondo de caja chica</h3>
            <form onSubmit={handleApertura} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Nombre del fondo</label>
                <input value={formApertura.nombre} onChange={(e) => setFormApertura({ ...formApertura, nombre: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Monto del fondo *</label>
                  <input type="number" step="0.01" placeholder="500.00" value={formApertura.monto} onChange={(e) => setFormApertura({ ...formApertura, monto: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Fecha</label>
                  <input type="date" value={formApertura.fecha} onChange={(e) => setFormApertura({ ...formApertura, fecha: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Cuenta del fondo (Activo) *</label>
                <select value={formApertura.cuentaCajaChica} onChange={(e) => setFormApertura({ ...formApertura, cuentaCajaChica: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                  <option value="">Seleccionar cuenta…</option>
                  {cuentasActivo.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Cuenta de origen (de dónde sale el efectivo) *</label>
                <select value={formApertura.cuentaOrigen} onChange={(e) => setFormApertura({ ...formApertura, cuentaOrigen: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                  <option value="">Seleccionar cuenta…</option>
                  {cuentasActivo.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                </select>
              </div>
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-[11px] text-blue-200">
                💡 Se creará el asiento contable: Debe cuenta del fondo / Haber cuenta de origen.
              </div>
              {errorModal && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorModal}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModal(null)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">Cancelar</button>
                <button type="submit" disabled={guardando} className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">
                  {guardando ? 'Abriendo…' : '💾 Abrir fondo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'gasto' && caja && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setModal(null)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">💳 Registrar gasto de caja chica</h3>
            <p className="text-xs text-white/40 mb-4">Saldo disponible: <strong className="text-white font-mono">{fmt(caja.saldo_actual)}</strong></p>
            <form onSubmit={handleGasto} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Monto *</label>
                  <input type="number" step="0.01" placeholder="150.00" value={formGasto.monto} onChange={(e) => setFormGasto({ ...formGasto, monto: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Fecha</label>
                  <input type="date" value={formGasto.fecha} onChange={(e) => setFormGasto({ ...formGasto, fecha: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Concepto *</label>
                <input placeholder="Pago planilla de luz…" value={formGasto.concepto} onChange={(e) => setFormGasto({ ...formGasto, concepto: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Beneficiario</label>
                <input placeholder="Empresa Eléctrica…" value={formGasto.beneficiario} onChange={(e) => setFormGasto({ ...formGasto, beneficiario: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Cuenta de gasto *</label>
                <select value={formGasto.cuenta} onChange={(e) => setFormGasto({ ...formGasto, cuenta: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                  <option value="">Seleccionar cuenta de gasto…</option>
                  {cuentasGasto.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                </select>
              </div>
              {errorModal && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorModal}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModal(null)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">Cancelar</button>
                <button type="submit" disabled={guardando} className="flex-1 rounded-lg bg-red-600 text-white text-xs font-semibold py-2 hover:bg-red-500 disabled:opacity-60">
                  {guardando ? 'Contabilizando…' : '💾 Registrar gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'reposicion' && caja && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setModal(null)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">🔄 Reponer fondo de caja chica</h3>
            <form onSubmit={handleReposicion} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Monto a reponer *</label>
                  <input type="number" step="0.01" placeholder="200.00" value={formReposicion.monto} onChange={(e) => setFormReposicion({ ...formReposicion, monto: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Fecha</label>
                  <input type="date" value={formReposicion.fecha} onChange={(e) => setFormReposicion({ ...formReposicion, fecha: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Cuenta de origen *</label>
                <select value={formReposicion.cuentaOrigen} onChange={(e) => setFormReposicion({ ...formReposicion, cuentaOrigen: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                  <option value="">Seleccionar cuenta…</option>
                  {cuentasActivo.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                </select>
              </div>
              {errorModal && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorModal}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModal(null)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">Cancelar</button>
                <button type="submit" disabled={guardando} className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">
                  {guardando ? 'Reponiendo…' : '💾 Reponer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
