import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'
import EstadoVacio from '../../components/EstadoVacio'

type MovConc = Database['public']['Tables']['conciliacion_movimientos']['Row']
type Config = Database['public']['Tables']['config_cuentas_contables']['Row']
type CuentaBancaria = Database['public']['Tables']['cuentas_bancarias']['Row']

type LineaBanco = {
  id: string // asiento_linea_id
  asiento_id: string
  numero: string
  concepto: string
  fecha: string
  debe: number
  haber: number
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n || 0)
}

const EJEMPLO_DEMO = [
  { fecha: '2025-06-01', descripcion: 'DEPOSITO CLIENTE LA ESPERANZA', monto: 5600 },
  { fecha: '2025-06-05', descripcion: 'TRANSFERENCIA NOMINA JUNIO', monto: -2300 },
  { fecha: '2025-06-08', descripcion: 'COBRO FACTURA 002', monto: 3584 },
  { fecha: '2025-06-12', descripcion: 'PAGO PROVEEDOR INVENTARIO', monto: -1200 },
  { fecha: '2025-06-15', descripcion: 'COMISION BANCARIA', monto: -25 },
]

// Conciliación Bancaria: en el legacy, este módulo era 100% en memoria del
// navegador (un array JS `bancarios`) — nunca se guardaba nada en la base de
// datos. Al recargar la página, o al dar clic en "Limpiar", se perdía todo
// el trabajo de conciliación. Además, "conciliar automático" comparaba el
// monto contra CUALQUIER asiento de la empresa (sin filtrar por la cuenta
// Bancos, y sin evitar que el mismo asiento se emparejara con dos
// movimientos bancarios distintos).
//
// Aquí los movimientos bancarios se guardan en `conciliacion_movimientos`
// (persisten entre sesiones) y el match — automático o manual — se hace
// contra líneas reales de `asiento_lineas` de la cuenta Bancos configurada,
// con un índice único que impide que una misma línea contable se concilie
// dos veces.
export default function ConciliacionPage() {
  const { perfil } = useAuth()
  const empresaId = perfil?.empresa_id ?? null
  const fileRef = useRef<HTMLInputElement>(null)

  const [movimientos, setMovimientos] = useState<MovConc[]>([])
  const [lineasBanco, setLineasBanco] = useState<LineaBanco[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([])
  const [cuentaBancariaImport, setCuentaBancariaImport] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conciliando, setConciliando] = useState(false)
  const [manualAbierto, setManualAbierto] = useState<string | null>(null)
  const [manualSeleccion, setManualSeleccion] = useState('')

  async function cargar() {
    if (!empresaId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [movsRes, configRes, cuentasRes] = await Promise.all([
      supabase.from('conciliacion_movimientos').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }),
      supabase.from('config_cuentas_contables').select('*').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('cuentas_bancarias').select('*').eq('empresa_id', empresaId).eq('tipo_titular', 'empresa'),
    ])
    if (movsRes.error) setError(movsRes.error.message)
    else setError(null)
    const cfg = (configRes.data ?? null) as unknown as Config | null
    setMovimientos((movsRes.data ?? []) as unknown as MovConc[])
    setConfig(cfg)
    setCuentasBancarias((cuentasRes.data ?? []) as unknown as CuentaBancaria[])

    if (cfg?.cuenta_bancos_id) {
      const { data: lineasD } = await supabase
        .from('asiento_lineas')
        .select('id,asiento_id,debe,haber,asientos!inner(numero,concepto,fecha,empresa_id)')
        .eq('cuenta_id', cfg.cuenta_bancos_id)
        .eq('asientos.empresa_id', empresaId)
      type LineaRaw = { id: string; asiento_id: string; debe: number; haber: number; asientos: { numero: string; concepto: string; fecha: string } }
      const lineas: LineaBanco[] = ((lineasD ?? []) as unknown as LineaRaw[]).map((l) => ({
        id: l.id,
        asiento_id: l.asiento_id,
        numero: l.asientos.numero,
        concepto: l.asientos.concepto,
        fecha: l.asientos.fecha,
        debe: l.debe,
        haber: l.haber,
      }))
      setLineasBanco(lineas)
    } else {
      setLineasBanco([])
    }
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const idsYaConciliados = useMemo(
    () => new Set(movimientos.filter((m) => m.estado === 'conciliado' && m.asiento_linea_id).map((m) => m.asiento_linea_id as string)),
    [movimientos]
  )
  const lineasDisponibles = useMemo(() => lineasBanco.filter((l) => !idsYaConciliados.has(l.id)), [lineasBanco, idsYaConciliados])

  const resumen = useMemo(() => {
    const importados = movimientos.length
    const conciliados = movimientos.filter((m) => m.estado === 'conciliado').length
    return { importados, conciliados, pendientes: importados - conciliados }
  }, [movimientos])

  function candidatosPara(mov: MovConc): LineaBanco[] {
    // Un depósito (monto>0) se concilia con el débito de la cuenta Bancos;
    // un retiro/pago (monto<0) se concilia con el crédito.
    const esDeposito = mov.monto > 0
    return lineasDisponibles
      .filter((l) => (esDeposito ? l.debe > 0 : l.haber > 0))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  }

  async function conciliarAutomatico() {
    if (!empresaId || !config?.cuenta_bancos_id) return
    setConciliando(true)
    const pendientes = movimientos.filter((m) => m.estado === 'pendiente' && m.monto !== 0).sort((a, b) => a.fecha.localeCompare(b.fecha))
    const usadas = new Set(idsYaConciliados)
    const actualizaciones: { id: string; asiento_linea_id: string }[] = []

    for (const mov of pendientes) {
      const esDeposito = mov.monto > 0
      const objetivo = Math.abs(mov.monto)
      const candidatas = lineasBanco.filter((l) => !usadas.has(l.id) && (esDeposito ? l.debe > 0 : l.haber > 0) && Math.abs((esDeposito ? l.debe : l.haber) - objetivo) < 0.01)
      if (candidatas.length === 0) continue
      // Preferimos la fecha más cercana al movimiento bancario.
      candidatas.sort((a, b) => Math.abs(new Date(a.fecha).getTime() - new Date(mov.fecha).getTime()) - Math.abs(new Date(b.fecha).getTime() - new Date(mov.fecha).getTime()))
      const elegida = candidatas[0]
      usadas.add(elegida.id)
      actualizaciones.push({ id: mov.id, asiento_linea_id: elegida.id })
    }

    for (const a of actualizaciones) {
      await supabase.from('conciliacion_movimientos').update({ estado: 'conciliado', asiento_linea_id: a.asiento_linea_id }).eq('id', a.id)
    }
    setConciliando(false)
    await cargar()
  }

  async function conciliarManual(movId: string) {
    if (!manualSeleccion) return
    await supabase.from('conciliacion_movimientos').update({ estado: 'conciliado', asiento_linea_id: manualSeleccion }).eq('id', movId)
    setManualAbierto(null)
    setManualSeleccion('')
    await cargar()
  }

  async function desconciliar(movId: string) {
    await supabase.from('conciliacion_movimientos').update({ estado: 'pendiente', asiento_linea_id: null }).eq('id', movId)
    await cargar()
  }

  async function eliminarMovimiento(id: string) {
    await supabase.from('conciliacion_movimientos').delete().eq('id', id)
    await cargar()
  }

  async function limpiarTodo() {
    if (!empresaId) return
    if (!confirm('¿Eliminar TODOS los movimientos bancarios importados (conciliados y pendientes) de esta empresa?')) return
    await supabase.from('conciliacion_movimientos').delete().eq('empresa_id', empresaId)
    await cargar()
  }

  async function insertarMovimientos(filas: { fecha: string; descripcion: string; monto: number }[], lote: string) {
    if (!empresaId || filas.length === 0) return
    const { error: err } = await supabase.from('conciliacion_movimientos').insert(
      filas.map((f) => ({
        empresa_id: empresaId,
        cuenta_bancaria_id: cuentaBancariaImport || null,
        fecha: f.fecha,
        descripcion: f.descripcion,
        monto: f.monto,
        estado: 'pendiente' as const,
        lote,
        creado_por: perfil?.id ?? null,
      }))
    )
    if (err) setError(err.message)
    await cargar()
  }

  function manejarCSV(input: HTMLInputElement) {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      const texto = String(e.target?.result || '')
      const lineas = texto.split('\n').slice(1) // saltar encabezado
      const filas = lineas
        .filter((l) => l.trim())
        .map((l) => {
          const partes = l.split(',')
          return { fecha: (partes[0] || '').trim(), descripcion: (partes[1] || 'Sin descripción').trim(), monto: parseFloat(partes[2]) || 0 }
        })
        .filter((f) => f.fecha)
      await insertarMovimientos(filas, file.name)
      input.value = ''
    }
    reader.readAsText(file)
  }

  async function cargarEjemploDemo() {
    await insertarMovimientos(EJEMPLO_DEMO, 'ejemplo-demo')
  }

  if (!empresaId) return <EstadoVacio icono="🏦" titulo="Sin empresa asignada" descripcion="Tu usuario no tiene una empresa asignada todavía." />

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-white mb-1">Conciliación Bancaria</h1>
      <p className="text-xs text-white/40 mb-4">Importa tu estado de cuenta CSV y cruza con los asientos reales de la cuenta Bancos — se guarda de forma persistente, no en memoria del navegador.</p>

      {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}
      {!config?.cuenta_bancos_id && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
          Falta configurar la cuenta "Bancos" en Configuración contable — sin eso no se puede conciliar contra el libro diario.
        </p>
      )}
      {loading && <p className="text-xs text-white/40">Cargando…</p>}

      {!loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="rounded-2xl border border-white/10 p-4">
              <p className="text-xs font-medium text-white/60 mb-2">📂 Importar estado de cuenta</p>
              <p className="text-[11px] text-white/40 mb-2">Formato CSV: fecha,descripcion,monto (con encabezado)</p>
              {cuentasBancarias.length > 0 && (
                <select
                  value={cuentaBancariaImport}
                  onChange={(e) => setCuentaBancariaImport(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-[var(--color-blue-5)] mb-2"
                >
                  <option value="">Cuenta bancaria (opcional)…</option>
                  {cuentasBancarias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.banco} — {c.numero_cuenta}
                    </option>
                  ))}
                </select>
              )}
              <input ref={fileRef} type="file" accept=".csv" onChange={(e) => manejarCSV(e.target)} className="w-full text-xs text-white/60 mb-2" />
              <button onClick={cargarEjemploDemo} className="w-full rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-1.5 hover:bg-white/5">
                📋 Cargar ejemplo demo
              </button>
            </div>
            <div className="rounded-2xl border border-white/10 p-4">
              <p className="text-xs font-medium text-white/60 mb-2">📊 Resumen</p>
              <div className="space-y-1.5 text-xs mb-3">
                <div className="flex justify-between"><span className="text-white/50">Importados</span><strong className="text-white">{resumen.importados}</strong></div>
                <div className="flex justify-between"><span className="text-emerald-400">✅ Conciliados</span><strong className="text-emerald-400">{resumen.conciliados}</strong></div>
                <div className="flex justify-between"><span className="text-amber-400">⏳ Pendientes</span><strong className="text-amber-400">{resumen.pendientes}</strong></div>
              </div>
              <button
                onClick={conciliarAutomatico}
                disabled={conciliando || resumen.pendientes === 0 || !config?.cuenta_bancos_id}
                className="w-full rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60"
              >
                {conciliando ? 'Conciliando…' : '🤖 Conciliar automático'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-medium text-white/60">🏦 Movimientos bancarios</span>
              {movimientos.length > 0 && (
                <button onClick={limpiarTodo} className="text-[11px] text-white/40 hover:text-red-400">
                  🗑 Limpiar todo
                </button>
              )}
            </div>
            {movimientos.length === 0 ? (
              <EstadoVacio icono="📂" titulo="Sin movimientos" descripcion="Importa un CSV o carga el ejemplo demo para comenzar." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium">Descripción</th>
                    <th className="px-4 py-2 font-medium text-right">Monto</th>
                    <th className="px-4 py-2 font-medium">Asiento</th>
                    <th className="px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => {
                    const linea = m.asiento_linea_id ? lineasBanco.find((l) => l.id === m.asiento_linea_id) : null
                    return (
                      <tr key={m.id} className="border-t border-white/5 hover:bg-white/[0.03] align-top">
                        <td className="px-4 py-2.5 text-white/60 text-xs whitespace-nowrap">{m.fecha}</td>
                        <td className="px-4 py-2.5 text-white text-xs">{m.descripcion}</td>
                        <td className={`px-4 py-2.5 text-right font-mono text-xs font-medium whitespace-nowrap ${m.monto >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(m.monto)}</td>
                        <td className="px-4 py-2.5 text-xs">
                          {linea ? (
                            <span className="text-blue-300">{linea.numero}</span>
                          ) : manualAbierto === m.id ? (
                            <div className="flex flex-col gap-1 min-w-[220px]">
                              <select
                                value={manualSeleccion}
                                onChange={(e) => setManualSeleccion(e.target.value)}
                                className="rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white outline-none focus:border-[var(--color-blue-5)]"
                              >
                                <option value="">Seleccionar asiento…</option>
                                {candidatosPara(m).map((l) => (
                                  <option key={l.id} value={l.id}>
                                    {l.fecha} · {l.numero} · {fmt(m.monto > 0 ? l.debe : l.haber)}
                                  </option>
                                ))}
                              </select>
                              <div className="flex gap-1">
                                <button onClick={() => conciliarManual(m.id)} disabled={!manualSeleccion} className="text-[11px] text-emerald-400 hover:underline disabled:opacity-40">
                                  Confirmar
                                </button>
                                <button onClick={() => { setManualAbierto(null); setManualSeleccion('') }} className="text-[11px] text-white/40 hover:underline">
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setManualAbierto(m.id)} className="text-[11px] text-white/40 hover:text-white underline">
                              🔗 Conciliar manual
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {m.estado === 'conciliado' ? (
                            <span className="text-emerald-400">✅ Conciliado</span>
                          ) : (
                            <span className="text-amber-400">⏳ Pendiente</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {m.estado === 'conciliado' && (
                            <button onClick={() => desconciliar(m.id)} className="text-[11px] text-white/30 hover:text-amber-400 mr-2">
                              Desconciliar
                            </button>
                          )}
                          <button onClick={() => eliminarMovimiento(m.id)} className="text-white/30 hover:text-red-400 text-xs">
                            🗑
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
