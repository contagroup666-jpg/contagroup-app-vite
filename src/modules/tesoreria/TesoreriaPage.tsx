import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { crearAsiento } from '../../lib/contabilidad'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'
import EstadoVacio from '../../components/EstadoVacio'

type MovCaja = Database['public']['Tables']['movimientos_caja']['Row']
type CuentaBancaria = Database['public']['Tables']['cuentas_bancarias']['Row']
type CierreCaja = Database['public']['Tables']['cierres_caja']['Row']
type Config = Database['public']['Tables']['config_cuentas_contables']['Row']
type PlanCuenta = Database['public']['Tables']['plan_cuentas']['Row']

function fmt(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n || 0)
}
const hoyISO = () => new Date().toISOString().slice(0, 10)
const horaISO = () => new Date().toTimeString().slice(0, 8)

type Tab = 'resumen' | 'bancos' | 'caja'
type TipoTitular = 'empresa' | 'empleado' | 'proveedor' | 'cliente'

// Tesorería: caja general de la empresa (distinta de la caja del POS y del
// Fondo de Caja Chica) + registro de cuentas bancarias. En el legacy, los
// ingresos/egresos de esta caja llamaban a `crearAsientoAuto()`, una función
// marcada como deprecada que NO hacía nada (solo mostraba una advertencia) —
// es decir, ningún ingreso/egreso de caja se contabilizaba jamás. Los
// depósitos a banco tampoco se contabilizaban NUNCA (ni siquiera lo
// intentaban) y el saldo de `cuentas_bancarias` nunca se actualizaba. Aquí
// los 3 flujos contabilizan de verdad vía fn_crear_asiento, y el depósito sí
// actualiza el saldo informativo de la cuenta bancaria elegida.
export default function TesoreriaPage() {
  const { perfil } = useAuth()
  const empresaId = perfil?.empresa_id ?? null

  const [tab, setTab] = useState<Tab>('resumen')
  const [movimientos, setMovimientos] = useState<MovCaja[]>([])
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [cierres, setCierres] = useState<CierreCaja[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [planCuentas, setPlanCuentas] = useState<PlanCuenta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    if (!empresaId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [movsRes, cuentasRes, cierresRes, configRes, planRes] = await Promise.all([
      supabase.from('movimientos_caja').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('cuentas_bancarias').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('cierres_caja').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('config_cuentas_contables').select('*').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('plan_cuentas').select('*').eq('empresa_id', empresaId).eq('es_detalle', true).order('codigo'),
    ])
    if (movsRes.error) setError(movsRes.error.message)
    else setError(null)
    setMovimientos((movsRes.data ?? []) as unknown as MovCaja[])
    setCuentas((cuentasRes.data ?? []) as unknown as CuentaBancaria[])
    setCierres((cierresRes.data ?? []) as unknown as CierreCaja[])
    setConfig((configRes.data ?? null) as unknown as Config | null)
    setPlanCuentas((planRes.data ?? []) as unknown as PlanCuenta[])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const nombreCuenta = (id: string | null) => (id ? planCuentas.find((c) => c.id === id) : null)?.nombre ?? '—'

  // ── Turno de caja actual (movimientos aún no cerrados) ──
  const turno = useMemo(() => movimientos.filter((m) => !m.cerrada), [movimientos])
  const apertura = useMemo(() => turno.find((m) => m.tipo === 'apertura') ?? null, [turno])
  const cajaAbierta = !!apertura
  const totales = useMemo(() => {
    const ingresos = turno.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const egresos = turno.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0)
    const depositos = turno.filter((m) => m.tipo === 'deposito').reduce((s, m) => s + m.monto, 0)
    const saldo = Math.max(0, (apertura?.monto || 0) + ingresos - egresos - depositos)
    return { ingresos, egresos, depositos, saldo }
  }, [turno, apertura])

  const resumenMes = useMemo(() => {
    const now = new Date()
    const delMes = movimientos.filter((m) => {
      const d = new Date(m.fecha)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    const ingMes = delMes.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const egrMes = delMes.filter((m) => m.tipo === 'egreso' || m.tipo === 'deposito').reduce((s, m) => s + m.monto, 0)
    const cuentasEmpresa = cuentas.filter((c) => c.tipo_titular === 'empresa')
    const saldoBancos = cuentasEmpresa.reduce((s, c) => s + (c.saldo || 0), 0)
    return { ingMes, egrMes, saldoBancos, cuentasEmpresa }
  }, [movimientos, cuentas])

  // ── Apertura / cierre de turno ──
  const [montoApertura, setMontoApertura] = useState('')
  const [abriendo, setAbriendo] = useState(false)
  const [mostrarCierre, setMostrarCierre] = useState(false)
  const [cerrando, setCerrando] = useState(false)

  async function handleAbrirCaja(e: FormEvent) {
    e.preventDefault()
    if (!empresaId) return
    const monto = parseFloat(montoApertura) || 0
    setAbriendo(true)
    const { error: err } = await supabase.from('movimientos_caja').insert({
      empresa_id: empresaId,
      tipo: 'apertura',
      monto,
      concepto: 'Apertura de caja',
      fecha: hoyISO(),
      hora: horaISO(),
      cerrada: false,
      creado_por: perfil?.id ?? null,
    })
    setAbriendo(false)
    if (err) return setError(err.message)
    setMontoApertura('')
    await cargar()
  }

  async function handleCerrarCaja() {
    if (!empresaId || !apertura) return
    setCerrando(true)
    const { error: err } = await supabase.from('cierres_caja').insert({
      empresa_id: empresaId,
      fecha: hoyISO(),
      hora_cierre: horaISO(),
      saldo_apertura: apertura.monto,
      total_ingresos: totales.ingresos,
      total_egresos: totales.egresos,
      total_depositos: totales.depositos,
      saldo_final: totales.saldo,
    })
    if (err) {
      setCerrando(false)
      return setError(err.message)
    }
    const ids = turno.map((m) => m.id)
    await supabase.from('movimientos_caja').update({ cerrada: true }).in('id', ids)
    setCerrando(false)
    setMostrarCierre(false)
    await cargar()
  }

  // ── Ingreso / Egreso ──
  const [modalMov, setModalMov] = useState<null | 'ingreso' | 'egreso'>(null)
  const [formMov, setFormMov] = useState({ monto: '', concepto: '', referencia: '', cuenta: '' })
  const [guardandoMov, setGuardandoMov] = useState(false)
  const [errorMov, setErrorMov] = useState<string | null>(null)

  function abrirModalMov(tipo: 'ingreso' | 'egreso') {
    setFormMov({ monto: '', concepto: '', referencia: '', cuenta: '' })
    setErrorMov(null)
    setModalMov(tipo)
  }

  async function confirmarMov(e: FormEvent) {
    e.preventDefault()
    if (!empresaId || !modalMov) return
    const monto = parseFloat(formMov.monto) || 0
    if (monto <= 0) return setErrorMov('Ingresa el monto.')
    if (!formMov.concepto.trim()) return setErrorMov('Ingresa el concepto.')
    if (!formMov.cuenta) return setErrorMov(`Selecciona la cuenta ${modalMov === 'ingreso' ? 'de origen del ingreso' : 'a la que corresponde el gasto'}.`)
    if (modalMov === 'egreso' && monto > totales.saldo + 0.01) return setErrorMov(`El egreso (${fmt(monto)}) supera el saldo de caja (${fmt(totales.saldo)}).`)
    if (!config?.cuenta_caja_id) return setErrorMov('Falta configurar la cuenta "Caja" en Configuración contable.')

    setGuardandoMov(true)
    setErrorMov(null)
    const { data: movInsertado, error: insErr } = await supabase
      .from('movimientos_caja')
      .insert({
        empresa_id: empresaId,
        tipo: modalMov,
        monto,
        concepto: formMov.concepto.trim(),
        referencia: formMov.referencia.trim() || null,
        fecha: hoyISO(),
        hora: horaISO(),
        cerrada: false,
        cuenta_contrapartida_id: formMov.cuenta,
        creado_por: perfil?.id ?? null,
      })
      .select()
      .single()
    if (insErr) {
      setGuardandoMov(false)
      return setErrorMov(insErr.message)
    }

    try {
      const lineas =
        modalMov === 'ingreso'
          ? [
              { cuenta_id: config.cuenta_caja_id, debe: monto, haber: 0 },
              { cuenta_id: formMov.cuenta, debe: 0, haber: monto },
            ]
          : [
              { cuenta_id: formMov.cuenta, debe: monto, haber: 0 },
              { cuenta_id: config.cuenta_caja_id, debe: 0, haber: monto },
            ]
      const asientoId = await crearAsiento({
        empresaId,
        concepto: `${modalMov === 'ingreso' ? 'Ingreso' : 'Egreso'} de caja: ${formMov.concepto.trim()}`,
        fecha: hoyISO(),
        lineas,
        prefijo: modalMov === 'ingreso' ? 'ING' : 'EGR',
        creadoPor: perfil?.id ?? null,
      })
      await supabase.from('movimientos_caja').update({ asiento_id: asientoId }).eq('id', movInsertado.id)
    } catch (asientoErr) {
      setGuardandoMov(false)
      setModalMov(null)
      await cargar()
      setError(`Movimiento registrado, pero el asiento contable falló: ${(asientoErr as Error).message}. Regístralo manualmente en Libro Diario.`)
      return
    }

    setGuardandoMov(false)
    setModalMov(null)
    await cargar()
  }

  // ── Depósito a banco ──
  const [modalDeposito, setModalDeposito] = useState(false)
  const [formDeposito, setFormDeposito] = useState({ monto: '', concepto: '', cuentaBancaria: '' })
  const [guardandoDeposito, setGuardandoDeposito] = useState(false)
  const [errorDeposito, setErrorDeposito] = useState<string | null>(null)

  function abrirModalDeposito() {
    setFormDeposito({ monto: '', concepto: '', cuentaBancaria: '' })
    setErrorDeposito(null)
    setModalDeposito(true)
  }

  async function confirmarDeposito(e: FormEvent) {
    e.preventDefault()
    if (!empresaId) return
    const monto = parseFloat(formDeposito.monto) || 0
    if (monto <= 0) return setErrorDeposito('Ingresa el monto.')
    if (!formDeposito.cuentaBancaria) return setErrorDeposito('Selecciona la cuenta bancaria destino.')
    if (monto > totales.saldo + 0.01) return setErrorDeposito(`El depósito (${fmt(monto)}) supera el saldo de caja (${fmt(totales.saldo)}).`)
    if (!config?.cuenta_caja_id || !config?.cuenta_bancos_id) return setErrorDeposito('Falta configurar las cuentas "Caja" y/o "Bancos" en Configuración contable.')

    setGuardandoDeposito(true)
    setErrorDeposito(null)
    const cuentaDestino = cuentas.find((c) => c.id === formDeposito.cuentaBancaria)
    const { data: movInsertado, error: insErr } = await supabase
      .from('movimientos_caja')
      .insert({
        empresa_id: empresaId,
        tipo: 'deposito',
        monto,
        concepto: formDeposito.concepto.trim() || `Depósito a ${cuentaDestino?.banco ?? 'banco'}`,
        referencia: cuentaDestino?.numero_cuenta ?? null,
        fecha: hoyISO(),
        hora: horaISO(),
        cerrada: false,
        cuenta_bancaria_id: formDeposito.cuentaBancaria,
        creado_por: perfil?.id ?? null,
      })
      .select()
      .single()
    if (insErr) {
      setGuardandoDeposito(false)
      return setErrorDeposito(insErr.message)
    }

    try {
      const asientoId = await crearAsiento({
        empresaId,
        concepto: `Depósito a banco: ${cuentaDestino?.banco ?? ''} ${cuentaDestino?.numero_cuenta ?? ''}`,
        fecha: hoyISO(),
        lineas: [
          { cuenta_id: config.cuenta_bancos_id, debe: monto, haber: 0 },
          { cuenta_id: config.cuenta_caja_id, debe: 0, haber: monto },
        ],
        prefijo: 'DEP',
        creadoPor: perfil?.id ?? null,
      })
      await supabase.from('movimientos_caja').update({ asiento_id: asientoId }).eq('id', movInsertado.id)
      if (cuentaDestino) {
        await supabase.from('cuentas_bancarias').update({ saldo: (cuentaDestino.saldo || 0) + monto }).eq('id', cuentaDestino.id)
      }
    } catch (asientoErr) {
      setGuardandoDeposito(false)
      setModalDeposito(false)
      await cargar()
      setError(`Depósito registrado, pero el asiento contable falló: ${(asientoErr as Error).message}. Regístralo manualmente en Libro Diario.`)
      return
    }

    setGuardandoDeposito(false)
    setModalDeposito(false)
    await cargar()
  }

  // ── Cuentas bancarias ──
  const [modalCuenta, setModalCuenta] = useState(false)
  const [formCuenta, setFormCuenta] = useState({ banco: '', tipoCuenta: 'Ahorros', numero: '', tipoTitular: 'empresa' as TipoTitular, titularNombre: '', referencia: '' })
  const [guardandoCuenta, setGuardandoCuenta] = useState(false)
  const [errorCuenta, setErrorCuenta] = useState<string | null>(null)

  function abrirModalCuenta() {
    setFormCuenta({ banco: '', tipoCuenta: 'Ahorros', numero: '', tipoTitular: 'empresa', titularNombre: '', referencia: '' })
    setErrorCuenta(null)
    setModalCuenta(true)
  }

  async function confirmarCuenta(e: FormEvent) {
    e.preventDefault()
    if (!empresaId) return
    if (!formCuenta.banco.trim()) return setErrorCuenta('Ingresa el nombre del banco.')
    if (!formCuenta.numero.trim()) return setErrorCuenta('Ingresa el número de cuenta.')
    setGuardandoCuenta(true)
    setErrorCuenta(null)
    const { error: err } = await supabase.from('cuentas_bancarias').insert({
      empresa_id: empresaId,
      banco: formCuenta.banco.trim(),
      tipo_cuenta: formCuenta.tipoCuenta,
      numero_cuenta: formCuenta.numero.trim(),
      tipo_titular: formCuenta.tipoTitular,
      titular_nombre: formCuenta.titularNombre.trim() || null,
      referencia: formCuenta.referencia.trim() || null,
      saldo: 0,
    })
    setGuardandoCuenta(false)
    if (err) return setErrorCuenta(err.message)
    setModalCuenta(false)
    await cargar()
  }

  async function eliminarCuenta(id: string) {
    if (!confirm('¿Eliminar esta cuenta bancaria del registro?')) return
    const { error: err } = await supabase.from('cuentas_bancarias').delete().eq('id', id)
    if (err) return setError(err.message)
    await cargar()
  }

  if (!empresaId) return <EstadoVacio icono="🏦" titulo="Sin empresa asignada" descripcion="Tu usuario no tiene una empresa asignada todavía." />

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-white mb-1">Tesorería</h1>
      <p className="text-xs text-white/40 mb-4">Caja general de la empresa y registro de cuentas bancarias — distinta de la caja del Punto de Venta y del Fondo de Caja Chica.</p>

      <div className="flex gap-1 mb-4 border-b border-white/10">
        {(['resumen', 'bancos', 'caja'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-[var(--color-blue-5)] text-white' : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            {t === 'resumen' ? '📊 Resumen' : t === 'bancos' ? '🏦 Bancos' : '💵 Caja'}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}
      {loading && <p className="text-xs text-white/40">Cargando…</p>}

      {!loading && tab === 'resumen' && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-2xl border border-white/10 p-4">
              <p className="text-[11px] text-white/40">💵 Saldo caja</p>
              <p className="text-xl font-semibold text-emerald-400 font-mono">{fmt(totales.saldo)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 p-4">
              <p className="text-[11px] text-white/40">↑ Ingresos del mes</p>
              <p className="text-xl font-semibold text-blue-400 font-mono">{fmt(resumenMes.ingMes)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 p-4">
              <p className="text-[11px] text-white/40">↓ Egresos del mes</p>
              <p className="text-xl font-semibold text-red-400 font-mono">{fmt(resumenMes.egrMes)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 p-4">
              <p className="text-[11px] text-white/40">🏦 Saldo en bancos</p>
              <p className="text-xl font-semibold text-white font-mono">{fmt(resumenMes.saldoBancos)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10 text-xs font-medium text-white/60">Posición de bancos (empresa)</div>
              {resumenMes.cuentasEmpresa.length === 0 ? (
                <EstadoVacio icono="🏦" titulo="Sin cuentas de empresa" descripcion="Registra una cuenta bancaria en la pestaña Bancos." />
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {resumenMes.cuentasEmpresa.map((c) => (
                      <tr key={c.id} className="border-t border-white/5">
                        <td className="px-4 py-2 text-white text-xs">{c.banco}</td>
                        <td className="px-4 py-2 text-white/50 font-mono text-xs">{c.numero_cuenta}</td>
                        <td className="px-4 py-2 text-right text-emerald-400 font-mono text-xs font-medium">{fmt(c.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10 text-xs font-medium text-white/60">Últimos movimientos de caja</div>
              {movimientos.length === 0 ? (
                <EstadoVacio icono="💵" titulo="Sin movimientos" descripcion="Aún no hay movimientos de caja." />
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {movimientos.slice(0, 8).map((m) => (
                      <tr key={m.id} className="border-t border-white/5">
                        <td className="px-4 py-2 text-white/50 text-xs">{m.fecha}</td>
                        <td className="px-4 py-2 text-white text-xs">{m.concepto || '—'}</td>
                        <td className={`px-4 py-2 text-right font-mono text-xs font-medium ${m.tipo === 'ingreso' ? 'text-emerald-400' : m.tipo === 'apertura' ? 'text-white/40' : 'text-red-400'}`}>
                          {m.tipo === 'ingreso' ? '+' : m.tipo === 'apertura' ? '' : '−'}
                          {fmt(m.monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && tab === 'bancos' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={abrirModalCuenta} className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[var(--color-blue-6)]">
              + Registrar cuenta bancaria
            </button>
          </div>
          <div className="rounded-2xl border border-white/10 overflow-hidden">
            {cuentas.length === 0 ? (
              <EstadoVacio icono="🏦" titulo="Sin cuentas registradas" descripcion="Registra las cuentas bancarias de la empresa, empleados, proveedores o clientes." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">Banco</th>
                    <th className="px-4 py-2 font-medium">N° de cuenta</th>
                    <th className="px-4 py-2 font-medium">Tipo</th>
                    <th className="px-4 py-2 font-medium">Titular</th>
                    <th className="px-4 py-2 font-medium">Referencia</th>
                    <th className="px-4 py-2 font-medium text-right">Saldo</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {cuentas.map((c) => (
                    <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5 text-white text-xs font-medium">{c.banco}</td>
                      <td className="px-4 py-2.5 text-blue-300 font-mono text-xs">{c.numero_cuenta}</td>
                      <td className="px-4 py-2.5 text-white/60 text-xs">{c.tipo_cuenta}</td>
                      <td className="px-4 py-2.5 text-white/60 text-xs">
                        {c.titular_nombre || '—'}{' '}
                        <span className="text-white/30">
                          ({c.tipo_titular === 'empresa' ? 'Empresa' : c.tipo_titular === 'empleado' ? 'Empleado' : c.tipo_titular === 'proveedor' ? 'Proveedor' : 'Cliente'})
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-white/40 text-xs">{c.referencia || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-400 font-mono text-xs font-medium">{fmt(c.saldo)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => eliminarCuenta(c.id)} className="text-white/30 hover:text-red-400 text-xs">
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {!loading && tab === 'caja' && (
        <div>
          {!cajaAbierta ? (
            <div className="rounded-2xl border border-white/10 p-6 max-w-sm">
              <p className="text-sm text-white mb-1">Caja cerrada</p>
              <p className="text-xs text-white/40 mb-4">Abre la caja para empezar a registrar movimientos del día.</p>
              <form onSubmit={handleAbrirCaja}>
                <label className="block text-xs text-white/50 mb-1">Saldo inicial en efectivo</label>
                <input
                  type="number"
                  step="0.01"
                  value={montoApertura}
                  onChange={(e) => setMontoApertura(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)] mb-3"
                />
                <button type="submit" disabled={abriendo} className="w-full rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">
                  {abriendo ? 'Abriendo…' : 'Abrir caja'}
                </button>
              </form>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 p-4 mb-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-[11px] text-white/40">Saldo actual de caja</p>
                    <p className="text-2xl font-semibold text-emerald-400 font-mono">{fmt(totales.saldo)}</p>
                    <p className="text-[11px] text-white/30 mt-1">
                      Apertura: {fmt(apertura?.monto || 0)} · Ingresos: {fmt(totales.ingresos)} · Egresos: {fmt(totales.egresos)} · Depósitos: {fmt(totales.depositos)}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => abrirModalMov('ingreso')} className="rounded-lg border border-emerald-500/30 text-emerald-400 text-xs font-semibold px-3 py-1.5 hover:bg-emerald-500/10">
                      + Ingreso
                    </button>
                    <button onClick={() => abrirModalMov('egreso')} className="rounded-lg border border-red-500/30 text-red-400 text-xs font-semibold px-3 py-1.5 hover:bg-red-500/10">
                      − Egreso
                    </button>
                    <button onClick={abrirModalDeposito} className="rounded-lg border border-white/10 text-white/70 text-xs font-semibold px-3 py-1.5 hover:bg-white/5">
                      🏦 Depósito a banco
                    </button>
                    <button onClick={() => setMostrarCierre(true)} className="rounded-lg border border-white/10 text-white/50 text-xs font-semibold px-3 py-1.5 hover:bg-white/5">
                      🔒 Cerrar caja
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 overflow-hidden mb-4">
                <div className="px-4 py-2.5 border-b border-white/10 text-xs font-medium text-white/60">Movimientos del turno actual</div>
                {turno.filter((m) => m.tipo !== 'apertura').length === 0 ? (
                  <EstadoVacio icono="💵" titulo="Sin movimientos" descripcion="Aún no hay movimientos en este turno." />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                        <th className="px-4 py-2 font-medium">Hora</th>
                        <th className="px-4 py-2 font-medium">Tipo</th>
                        <th className="px-4 py-2 font-medium">Concepto</th>
                        <th className="px-4 py-2 font-medium">Cuenta</th>
                        <th className="px-4 py-2 font-medium text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...turno]
                        .filter((m) => m.tipo !== 'apertura')
                        .sort((a, b) => b.created_at.localeCompare(a.created_at))
                        .map((m) => (
                          <tr key={m.id} className="border-t border-white/5">
                            <td className="px-4 py-2.5 text-white/50 text-xs">{m.hora || '—'}</td>
                            <td className="px-4 py-2.5 text-xs">
                              <span className={m.tipo === 'ingreso' ? 'text-emerald-400' : m.tipo === 'deposito' ? 'text-blue-400' : 'text-red-400'}>
                                {m.tipo === 'ingreso' ? 'Ingreso' : m.tipo === 'deposito' ? 'Depósito' : 'Egreso'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-white/70 text-xs">{m.concepto || '—'}</td>
                            <td className="px-4 py-2.5 text-white/40 text-xs">{nombreCuenta(m.cuenta_contrapartida_id)}</td>
                            <td className={`px-4 py-2.5 text-right font-mono text-xs font-medium ${m.tipo === 'ingreso' ? 'text-emerald-400' : 'text-red-400'}`}>
                              {m.tipo === 'ingreso' ? '+' : '−'}
                              {fmt(m.monto)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {cierres.length > 0 && (
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10 text-xs font-medium text-white/60">Cierres anteriores</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium text-right">Apertura</th>
                    <th className="px-4 py-2 font-medium text-right">Ingresos</th>
                    <th className="px-4 py-2 font-medium text-right">Egresos</th>
                    <th className="px-4 py-2 font-medium text-right">Depósitos</th>
                    <th className="px-4 py-2 font-medium text-right">Saldo final</th>
                  </tr>
                </thead>
                <tbody>
                  {cierres.map((c) => (
                    <tr key={c.id} className="border-t border-white/5">
                      <td className="px-4 py-2.5 text-white/70 text-xs">{c.fecha} {c.hora_cierre}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-white/50">{fmt(c.saldo_apertura)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-emerald-400">{fmt(c.total_ingresos)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-red-400">{fmt(c.total_egresos)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-blue-400">{fmt(c.total_depositos)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-white">{fmt(c.saldo_final)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal ingreso/egreso */}
      {modalMov && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setModalMov(null)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">{modalMov === 'ingreso' ? '💵 Registrar ingreso de caja' : '💸 Registrar egreso de caja'}</h3>
            <form onSubmit={confirmarMov} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Monto *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formMov.monto}
                  onChange={(e) => setFormMov({ ...formMov, monto: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Concepto *</label>
                <input
                  value={formMov.concepto}
                  onChange={(e) => setFormMov({ ...formMov, concepto: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Referencia</label>
                <input
                  value={formMov.referencia}
                  onChange={(e) => setFormMov({ ...formMov, referencia: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">{modalMov === 'ingreso' ? 'Cuenta de origen del ingreso *' : 'Cuenta a la que corresponde el gasto *'}</label>
                <select
                  value={formMov.cuenta}
                  onChange={(e) => setFormMov({ ...formMov, cuenta: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                >
                  <option value="">Seleccionar cuenta…</option>
                  {planCuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} — {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              {errorMov && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorMov}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModalMov(null)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoMov}
                  className={`flex-1 rounded-lg text-white text-xs font-semibold py-2 disabled:opacity-60 ${modalMov === 'ingreso' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}
                >
                  {guardandoMov ? 'Contabilizando…' : '💾 Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal depósito */}
      {modalDeposito && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setModalDeposito(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">🏦 Depósito a banco</h3>
            <form onSubmit={confirmarDeposito} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Monto *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formDeposito.monto}
                  onChange={(e) => setFormDeposito({ ...formDeposito, monto: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Cuenta bancaria destino *</label>
                <select
                  value={formDeposito.cuentaBancaria}
                  onChange={(e) => setFormDeposito({ ...formDeposito, cuentaBancaria: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                >
                  <option value="">Seleccionar cuenta…</option>
                  {cuentas
                    .filter((c) => c.tipo_titular === 'empresa')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.banco} — {c.numero_cuenta}
                      </option>
                    ))}
                </select>
                {cuentas.filter((c) => c.tipo_titular === 'empresa').length === 0 && (
                  <p className="text-[11px] text-amber-400 mt-1">No hay cuentas bancarias de la empresa registradas. Regístralas en la pestaña Bancos.</p>
                )}
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Concepto</label>
                <input
                  value={formDeposito.concepto}
                  onChange={(e) => setFormDeposito({ ...formDeposito, concepto: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              {errorDeposito && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorDeposito}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModalDeposito(false)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">
                  Cancelar
                </button>
                <button type="submit" disabled={guardandoDeposito} className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">
                  {guardandoDeposito ? 'Contabilizando…' : '💾 Depositar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal cierre de caja */}
      {mostrarCierre && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setMostrarCierre(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Cerrar caja</h3>
            <p className="text-xs text-white/40 mb-4">
              Se cerrará el turno con saldo final de <strong className="text-white font-mono">{fmt(totales.saldo)}</strong>. Se generará el resumen del turno.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setMostrarCierre(false)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">
                Cancelar
              </button>
              <button onClick={handleCerrarCaja} disabled={cerrando} className="flex-1 rounded-lg bg-red-500/80 text-white text-xs font-semibold py-2 hover:bg-red-500 disabled:opacity-60">
                {cerrando ? 'Cerrando…' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal registrar cuenta bancaria */}
      {modalCuenta && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setModalCuenta(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">🏦 Registrar cuenta bancaria</h3>
            <form onSubmit={confirmarCuenta} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Banco *</label>
                <input
                  value={formCuenta.banco}
                  onChange={(e) => setFormCuenta({ ...formCuenta, banco: e.target.value })}
                  placeholder="Banco Pichincha…"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Tipo de cuenta</label>
                  <select
                    value={formCuenta.tipoCuenta}
                    onChange={(e) => setFormCuenta({ ...formCuenta, tipoCuenta: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  >
                    <option value="Ahorros">Ahorros</option>
                    <option value="Corriente">Corriente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">N° de cuenta *</label>
                  <input
                    value={formCuenta.numero}
                    onChange={(e) => setFormCuenta({ ...formCuenta, numero: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Titular</label>
                <select
                  value={formCuenta.tipoTitular}
                  onChange={(e) => setFormCuenta({ ...formCuenta, tipoTitular: e.target.value as TipoTitular })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)] mb-2"
                >
                  <option value="empresa">Empresa</option>
                  <option value="empleado">Empleado</option>
                  <option value="proveedor">Proveedor</option>
                  <option value="cliente">Cliente</option>
                </select>
                <input
                  value={formCuenta.titularNombre}
                  onChange={(e) => setFormCuenta({ ...formCuenta, titularNombre: e.target.value })}
                  placeholder="Nombre del titular"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Referencia</label>
                <input
                  value={formCuenta.referencia}
                  onChange={(e) => setFormCuenta({ ...formCuenta, referencia: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              {errorCuenta && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorCuenta}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModalCuenta(false)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">
                  Cancelar
                </button>
                <button type="submit" disabled={guardandoCuenta} className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">
                  {guardandoCuenta ? 'Guardando…' : '💾 Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
