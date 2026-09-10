import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { crearAsiento } from '../../lib/contabilidad'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'
import EstadoVacio from '../../components/EstadoVacio'
import TablaSkeleton from '../../components/TablaSkeleton'
import ControlesPaginacion from '../../components/ControlesPaginacion'
import { usePaginacion } from '../../hooks/usePaginacion'

type MovConc = Database['public']['Tables']['conciliacion_movimientos']['Row']
type Config = Database['public']['Tables']['config_cuentas_contables']['Row']
type CuentaBancaria = Database['public']['Tables']['cuentas_bancarias']['Row']
type PlanCuenta = Database['public']['Tables']['plan_cuentas']['Row']
type ConcConfig = Database['public']['Tables']['conciliacion_config']['Row']
type Cierre = Database['public']['Tables']['conciliacion_cierres']['Row']

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

// Reglas de sugerencia de cuenta contrapartida a partir de palabras clave en
// la descripción del extracto. Esto NO es un modelo de IA — es un
// heurístico simple, honesto sobre su límite: cada empresa nombra sus
// cuentas distinto, así que solo es un punto de partida que el usuario
// SIEMPRE debe confirmar (o cambiar) antes de contabilizar. Nunca se aplica
// una cuenta sin que el usuario la confirme explícitamente.
type Sugerencia = { cuenta: PlanCuenta | null; confianza: 'alta' | 'media' | 'baja'; motivo: string }

function sugerirCuenta(descripcion: string, monto: number, cuentas: PlanCuenta[]): Sugerencia {
  const d = descripcion.toUpperCase()
  const porNombre = (...palabras: string[]) => cuentas.find((c) => c.es_detalle && palabras.some((p) => c.nombre.toUpperCase().includes(p)))
  const primeraDeClase = (clase: number) => cuentas.find((c) => c.es_detalle && c.clase === clase) ?? null

  if (/(COMISION|MANTENIMIENTO|TARIFA|SERVICIO BANCARIO)/.test(d)) {
    const c = porNombre('BANCO', 'COMISION', 'FINANC')
    return c ? { cuenta: c, confianza: 'alta', motivo: 'Parece una comisión o cargo bancario.' } : { cuenta: primeraDeClase(5), confianza: 'media', motivo: 'Parece un gasto bancario, pero no encontré una cuenta específica — verifica cuál aplica.' }
  }
  if (/(NOMINA|SUELDO|ROL DE PAGO|IESS)/.test(d)) {
    const c = porNombre('SUELDO', 'NOMINA', 'PERSONAL', 'REMUNERAC')
    return c ? { cuenta: c, confianza: 'alta', motivo: 'Parece un pago de nómina.' } : { cuenta: primeraDeClase(5), confianza: 'media', motivo: 'Parece nómina, pero no encontré la cuenta específica de sueldos.' }
  }
  if (/(IMPUESTO|RETENCION|SRI|ITF)/.test(d)) {
    const c = porNombre('IMPUESTO', 'RETENCION', 'SRI')
    return c ? { cuenta: c, confianza: 'alta', motivo: 'Parece un impuesto o retención.' } : { cuenta: primeraDeClase(2), confianza: 'media', motivo: 'Parece un impuesto/retención, verifica la cuenta correcta.' }
  }
  if (/(PROVEEDOR|COMPRA|INVENTARIO)/.test(d)) {
    const c = porNombre('POR PAGAR', 'PROVEEDOR')
    return c ? { cuenta: c, confianza: 'alta', motivo: 'Parece un pago a proveedor.' } : { cuenta: primeraDeClase(monto < 0 ? 5 : 2), confianza: 'media', motivo: 'Parece pago a proveedor, verifica la cuenta correcta.' }
  }
  if (/(CLIENTE|COBRO|FACTURA|DEPOSITO)/.test(d) && monto > 0) {
    const c = porNombre('VENTA', 'POR COBRAR', 'CLIENTE')
    return c ? { cuenta: c, confianza: 'alta', motivo: 'Parece un cobro de cliente.' } : { cuenta: primeraDeClase(4), confianza: 'media', motivo: 'Parece un cobro, verifica la cuenta correcta.' }
  }
  return monto > 0
    ? { cuenta: primeraDeClase(4), confianza: 'baja', motivo: 'No reconocí el concepto — revisa bien la cuenta antes de confirmar.' }
    : { cuenta: primeraDeClase(5), confianza: 'baja', motivo: 'No reconocí el concepto — revisa bien la cuenta antes de confirmar.' }
}

// Conciliación Bancaria: en el legacy, este módulo era 100% en memoria del
// navegador — nunca se guardaba nada, y "conciliar automático" solo
// comparaba montos contra cualquier asiento de la empresa. Esta versión:
// (1) persiste todo en `conciliacion_movimientos`, con un índice único que
// impide conciliar la misma línea contable dos veces; (2) diagnostica los
// DOS lados del descuadre — movimientos bancarios sin registrar en libros,
// y asientos de Bancos que el extracto todavía no muestra; (3) calcula la
// diferencia real (saldo banco vs saldo libro) ajustada por las partidas
// pendientes — si después de esa aritmética queda una diferencia distinta
// de cero, es un error de verdad, no solo timing; (4) para movimientos
// bancarios huérfanos, sugiere una cuenta contrapartida por palabras clave
// y, con un clic de confirmación del usuario, contabiliza vía
// fn_crear_asiento y concilia en el mismo paso. Nunca se corrige nada sin
// que el usuario confirme la cuenta — la sugerencia es solo un punto de
// partida.
export default function ConciliacionPage() {
  const { perfil } = useAuth()
  const empresaId = perfil?.empresa_id ?? null

  const [movimientos, setMovimientos] = useState<MovConc[]>([])
  const [lineasBanco, setLineasBanco] = useState<LineaBanco[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [cuentaBancosPlan, setCuentaBancosPlan] = useState<PlanCuenta | null>(null)
  const [planCuentas, setPlanCuentas] = useState<PlanCuenta[]>([])
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([])
  const [cuentaBancariaImport, setCuentaBancariaImport] = useState('')
  const [, setConcConfig] = useState<ConcConfig | null>(null)
  const [saldoInicialInput, setSaldoInicialInput] = useState('0')
  const [cierres, setCierres] = useState<Cierre[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conciliando, setConciliando] = useState(false)
  const [manualAbierto, setManualAbierto] = useState<string | null>(null)
  const [manualSeleccion, setManualSeleccion] = useState('')
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null)
  const [correccionCuenta, setCorreccionCuenta] = useState<Record<string, string>>({})
  const [guardandoCierre, setGuardandoCierre] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ fecha: string; descripcion: string; monto: string }>({ fecha: '', descripcion: '', monto: '' })

  async function cargar() {
    if (!empresaId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [movsRes, configRes, cuentasRes, planRes, concConfigRes, cierresRes] = await Promise.all([
      supabase.from('conciliacion_movimientos').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }),
      supabase.from('config_cuentas_contables').select('*').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('cuentas_bancarias').select('*').eq('empresa_id', empresaId).eq('tipo_titular', 'empresa'),
      supabase.from('plan_cuentas').select('*').eq('empresa_id', empresaId).order('codigo'),
      supabase.from('conciliacion_config').select('*').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('conciliacion_cierres').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
    ])
    if (movsRes.error) setError(movsRes.error.message)
    else setError(null)
    const cfg = (configRes.data ?? null) as unknown as Config | null
    const plan = (planRes.data ?? []) as unknown as PlanCuenta[]
    setMovimientos((movsRes.data ?? []) as unknown as MovConc[])
    setConfig(cfg)
    setPlanCuentas(plan)
    setCuentasBancarias((cuentasRes.data ?? []) as unknown as CuentaBancaria[])
    setCierres((cierresRes.data ?? []) as unknown as Cierre[])
    const cc = (concConfigRes.data ?? null) as unknown as ConcConfig | null
    setConcConfig(cc)
    setSaldoInicialInput(String(cc?.saldo_inicial_extracto ?? 0))
    setCuentaBancosPlan(cfg?.cuenta_bancos_id ? plan.find((c) => c.id === cfg.cuenta_bancos_id) ?? null : null)

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
  const pendientesBanco = useMemo(() => movimientos.filter((m) => m.estado === 'pendiente'), [movimientos])

  // Paginación del lado del cliente SOLO para la tabla "Todos los movimientos
  // bancarios" (historial de repaso). La consulta que trae `movimientos`
  // sigue trayendo todo a propósito — el motor de diagnóstico y de
  // conciliación automática necesitan el conjunto completo para sumar bien
  // y no reutilizar una línea ya conciliada; paginar esa consulta rompería
  // esos cálculos. Esto solo evita que el navegador renderice miles de filas
  // de tabla de golpe.
  const pagMovs = usePaginacion(40)
  useEffect(() => {
    pagMovs.setTotalFilas(movimientos.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movimientos.length])
  const movimientosPagina = useMemo(() => movimientos.slice(pagMovs.rango[0], pagMovs.rango[1] + 1), [movimientos, pagMovs.rango])

  const resumen = useMemo(() => {
    const importados = movimientos.length
    const conciliados = movimientos.filter((m) => m.estado === 'conciliado').length
    return { importados, conciliados, pendientes: importados - conciliados }
  }, [movimientos])

  // ── Diagnóstico de saldos: la aritmética real de una conciliación bancaria ──
  const diagnostico = useMemo(() => {
    const saldoInicial = parseFloat(saldoInicialInput) || 0
    const saldoBanco = saldoInicial + movimientos.reduce((s, m) => s + m.monto, 0)
    const saldoLibro = cuentaBancosPlan?.saldo ?? 0
    const pendientesBancoSuma = pendientesBanco.reduce((s, m) => s + m.monto, 0)
    const pendientesLibroSuma = lineasDisponibles.reduce((s, l) => s + (l.debe - l.haber), 0)
    // saldo_banco_ajustado = saldo_banco + pendientesLibro (lo que el libro ya registró y el banco aún no muestra)
    // saldo_libro_ajustado = saldo_libro + pendientesBanco (lo que el banco ya hizo y el libro aún no registra)
    // Si ambos ajustados coinciden, la diferencia es solo de tiempo (normal). Si no, hay un error real.
    const diferenciaNoExplicada = saldoBanco + pendientesLibroSuma - (saldoLibro + pendientesBancoSuma)
    return { saldoInicial, saldoBanco, saldoLibro, pendientesBancoSuma, pendientesLibroSuma, diferenciaNoExplicada }
  }, [saldoInicialInput, movimientos, cuentaBancosPlan, pendientesBanco, lineasDisponibles])

  async function guardarSaldoInicial() {
    if (!empresaId) return
    const valor = parseFloat(saldoInicialInput) || 0
    await supabase.from('conciliacion_config').upsert({ empresa_id: empresaId, saldo_inicial_extracto: valor, updated_por: perfil?.id ?? null, updated_at: new Date().toISOString() })
    await cargar()
  }

  function candidatosPara(mov: MovConc): LineaBanco[] {
    const esDeposito = mov.monto > 0
    return lineasDisponibles.filter((l) => (esDeposito ? l.debe > 0 : l.haber > 0)).sort((a, b) => b.fecha.localeCompare(a.fecha))
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

  function abrirEdicion(m: MovConc) {
    setEditandoId(m.id)
    setEditForm({ fecha: m.fecha, descripcion: m.descripcion, monto: String(m.monto) })
  }

  async function guardarEdicion(id: string) {
    const monto = parseFloat(editForm.monto)
    if (!editForm.fecha || !editForm.descripcion.trim() || Number.isNaN(monto)) return
    await supabase
      .from('conciliacion_movimientos')
      .update({ fecha: editForm.fecha, descripcion: editForm.descripcion.trim(), monto })
      .eq('id', id)
    setEditandoId(null)
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
      const lineas = texto.split('\n').slice(1)
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

  // ── Motor de corrección: contabiliza el movimiento huérfano y lo concilia en un solo paso ──
  async function contabilizarYConciliar(mov: MovConc) {
    if (!empresaId || !config?.cuenta_bancos_id) return
    const cuentaId = correccionCuenta[mov.id]
    if (!cuentaId) return
    setCorrigiendo(mov.id)
    try {
      const monto = Math.abs(mov.monto)
      const lineas =
        mov.monto > 0
          ? [
              { cuenta_id: config.cuenta_bancos_id, debe: monto, haber: 0 },
              { cuenta_id: cuentaId, debe: 0, haber: monto },
            ]
          : [
              { cuenta_id: cuentaId, debe: monto, haber: 0 },
              { cuenta_id: config.cuenta_bancos_id, debe: 0, haber: monto },
            ]
      const asientoId = await crearAsiento({
        empresaId,
        concepto: `Conciliación bancaria: ${mov.descripcion}`,
        fecha: mov.fecha,
        lineas,
        prefijo: 'CONC',
        creadoPor: perfil?.id ?? null,
      })
      const { data: nuevaLinea } = await supabase.from('asiento_lineas').select('id').eq('asiento_id', asientoId).eq('cuenta_id', config.cuenta_bancos_id).maybeSingle()
      if (nuevaLinea) {
        await supabase.from('conciliacion_movimientos').update({ estado: 'conciliado', asiento_linea_id: (nuevaLinea as { id: string }).id }).eq('id', mov.id)
      }
    } catch (e) {
      setError(`No se pudo contabilizar: ${(e as Error).message}`)
    } finally {
      setCorrigiendo(null)
      await cargar()
    }
  }

  async function eliminarCierre(id: string) {
    if (!confirm('¿Eliminar este cierre de conciliación del historial? Esto no modifica los movimientos ni los asientos, solo borra el registro guardado.')) return
    await supabase.from('conciliacion_cierres').delete().eq('id', id)
    await cargar()
  }

  async function guardarCierre() {
    if (!empresaId) return
    setGuardandoCierre(true)
    await supabase.from('conciliacion_cierres').insert({
      empresa_id: empresaId,
      saldo_inicial_extracto: diagnostico.saldoInicial,
      saldo_banco: diagnostico.saldoBanco,
      saldo_libro: diagnostico.saldoLibro,
      pendientes_banco: diagnostico.pendientesBancoSuma,
      pendientes_libro: diagnostico.pendientesLibroSuma,
      diferencia_no_explicada: diagnostico.diferenciaNoExplicada,
      num_pendientes_banco: pendientesBanco.length,
      num_pendientes_libro: lineasDisponibles.length,
      creado_por: perfil?.id ?? null,
    })
    setGuardandoCierre(false)
    await cargar()
  }

  if (!empresaId) return <EstadoVacio icono="🏦" titulo="Sin empresa asignada" descripcion="Tu usuario no tiene una empresa asignada todavía." />

  const conciliaLimpio = Math.abs(diagnostico.diferenciaNoExplicada) < 0.01

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-white mb-1">Conciliación Bancaria</h1>
      <p className="text-xs text-white/40 mb-4">Importa tu estado de cuenta y cruza contra los asientos reales de la cuenta Bancos — persistido, con diagnóstico de ambos lados y corrección asistida.</p>

      {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}
      {!config?.cuenta_bancos_id && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
          Falta configurar la cuenta "Bancos" en Configuración contable — sin eso no se puede conciliar contra el libro diario.
        </p>
      )}
      {loading && <TablaSkeleton />}

      {!loading && (
        <>
          {/* Diagnóstico de saldos */}
          <div className={`rounded-2xl border p-4 mb-4 ${conciliaLimpio ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <p className="text-xs font-semibold text-white">{conciliaLimpio ? '✅ La conciliación cuadra' : '⚠️ Hay una diferencia sin explicar'}</p>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-white/40">Saldo inicial del extracto</label>
                <input
                  type="number"
                  step="0.01"
                  value={saldoInicialInput}
                  onChange={(e) => setSaldoInicialInput(e.target.value)}
                  onBlur={guardarSaldoInicial}
                  className="w-28 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-2">
              <div><p className="text-white/40">Saldo según extracto</p><p className="font-mono text-white font-medium">{fmt(diagnostico.saldoBanco)}</p></div>
              <div><p className="text-white/40">Saldo según libro (Bancos)</p><p className="font-mono text-white font-medium">{fmt(diagnostico.saldoLibro)}</p></div>
              <div><p className="text-white/40">Pendientes lado banco</p><p className="font-mono text-amber-300">{fmt(diagnostico.pendientesBancoSuma)} ({pendientesBanco.length})</p></div>
              <div><p className="text-white/40">Pendientes lado libro</p><p className="font-mono text-amber-300">{fmt(diagnostico.pendientesLibroSuma)} ({lineasDisponibles.length})</p></div>
            </div>
            <p className={`text-xs font-mono font-semibold ${conciliaLimpio ? 'text-emerald-400' : 'text-red-400'}`}>
              Diferencia no explicada: {fmt(diagnostico.diferenciaNoExplicada)}
            </p>
            <p className="text-[11px] text-white/30 mt-1">
              {conciliaLimpio
                ? 'Todo lo que no coincide entre banco y libro está cubierto por partidas pendientes normales (depósitos en tránsito, movimientos aún no registrados).'
                : 'Después de descontar las partidas pendientes de ambos lados, queda una diferencia real — revisa montos duplicados o mal ingresados.'}
            </p>
            <div className="flex justify-end mt-2">
              <button onClick={guardarCierre} disabled={guardandoCierre} className="rounded-lg border border-white/10 text-white/60 text-xs font-semibold px-3 py-1.5 hover:bg-white/5 disabled:opacity-60">
                {guardandoCierre ? 'Guardando…' : '📌 Guardar cierre de conciliación'}
              </button>
            </div>
          </div>

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
              <input type="file" accept=".csv" onChange={(e) => manejarCSV(e.target)} className="w-full text-xs text-white/60 mb-2" />
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

          {/* Diagnóstico lado banco: movimientos sin registrar en libros, con corrección asistida */}
          <div className="rounded-2xl border border-amber-500/20 overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-white/10 bg-amber-500/5">
              <p className="text-xs font-medium text-white">🩺 Movimientos bancarios sin registrar en libros ({pendientesBanco.length})</p>
              <p className="text-[11px] text-white/40 mt-0.5">Algo pasó en el banco que nadie contabilizó todavía. Elige la cuenta y confirma para contabilizar y conciliar en un paso.</p>
            </div>
            {pendientesBanco.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-white/30">Sin pendientes de este lado.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {pendientesBanco.map((m) => {
                    const sug = sugerirCuenta(m.descripcion, m.monto, planCuentas)
                    const seleccion = correccionCuenta[m.id] ?? sug.cuenta?.id ?? ''
                    return (
                      <tr key={m.id} className="border-t border-white/5 align-top">
                        <td className="px-4 py-2.5 text-white/50 text-xs whitespace-nowrap">{m.fecha}</td>
                        <td className="px-4 py-2.5 text-white text-xs">{m.descripcion}</td>
                        <td className={`px-4 py-2.5 text-right font-mono text-xs font-medium whitespace-nowrap ${m.monto >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(m.monto)}</td>
                        <td className="px-4 py-2.5 min-w-[260px]">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${sug.confianza === 'alta' ? 'bg-emerald-500/20 text-emerald-300' : sug.confianza === 'media' ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-white/40'}`}>
                                {sug.confianza === 'alta' ? 'sugerencia sólida' : sug.confianza === 'media' ? 'sugerencia parcial' : 'sin sugerencia clara'}
                              </span>
                              <span className="text-[10px] text-white/30">{sug.motivo}</span>
                            </div>
                            <select
                              value={seleccion}
                              onChange={(e) => setCorreccionCuenta({ ...correccionCuenta, [m.id]: e.target.value })}
                              className="rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white outline-none focus:border-[var(--color-blue-5)]"
                            >
                              <option value="">Seleccionar cuenta…</option>
                              {planCuentas.filter((c) => c.es_detalle).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.codigo} — {c.nombre}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => contabilizarYConciliar(m)}
                              disabled={!seleccion || corrigiendo === m.id}
                              className="self-start rounded-md bg-emerald-600 text-white text-[11px] font-semibold px-2 py-1 hover:bg-emerald-500 disabled:opacity-50"
                            >
                              {corrigiendo === m.id ? 'Contabilizando…' : '✅ Contabilizar y conciliar'}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right align-top">
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

          {/* Diagnóstico lado libro: asientos que el extracto todavía no muestra */}
          <div className="rounded-2xl border border-white/10 overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-white/10">
              <p className="text-xs font-medium text-white/60">📖 Asientos de Bancos sin aparecer en el extracto ({lineasDisponibles.length})</p>
              <p className="text-[11px] text-white/30 mt-0.5">
                Normalmente son partidas en tránsito (depósitos o pagos ya contabilizados que el banco aún no procesa). Si crees que alguno es un error, revísalo en Libro Diario — por seguridad, esta pantalla no modifica asientos existentes.
              </p>
            </div>
            {lineasDisponibles.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-white/30">Sin pendientes de este lado.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {lineasDisponibles.map((l) => (
                    <tr key={l.id} className="border-t border-white/5">
                      <td className="px-4 py-2.5 text-white/50 text-xs whitespace-nowrap">{l.fecha}</td>
                      <td className="px-4 py-2.5 text-blue-300 text-xs whitespace-nowrap">{l.numero}</td>
                      <td className="px-4 py-2.5 text-white/70 text-xs">{l.concepto}</td>
                      <td className={`px-4 py-2.5 text-right font-mono text-xs font-medium ${l.debe > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(l.debe > 0 ? l.debe : -l.haber)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-medium text-white/60">🏦 Todos los movimientos bancarios</span>
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
                  {movimientosPagina.map((m) => {
                    const linea = m.asiento_linea_id ? lineasBanco.find((l) => l.id === m.asiento_linea_id) : null
                    const editando = editandoId === m.id
                    return (
                      <tr key={m.id} className="border-t border-white/5 hover:bg-white/[0.03] align-top">
                        {editando ? (
                          <>
                            <td className="px-4 py-2.5">
                              <input
                                type="date"
                                value={editForm.fecha}
                                onChange={(e) => setEditForm((f) => ({ ...f, fecha: e.target.value }))}
                                className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white outline-none focus:border-[var(--color-blue-5)]"
                              />
                            </td>
                            <td className="px-4 py-2.5">
                              <input
                                type="text"
                                value={editForm.descripcion}
                                onChange={(e) => setEditForm((f) => ({ ...f, descripcion: e.target.value }))}
                                className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white outline-none focus:border-[var(--color-blue-5)]"
                              />
                            </td>
                            <td className="px-4 py-2.5">
                              <input
                                type="number"
                                step="0.01"
                                value={editForm.monto}
                                onChange={(e) => setEditForm((f) => ({ ...f, monto: e.target.value }))}
                                className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white text-right outline-none focus:border-[var(--color-blue-5)]"
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-2.5 text-white/60 text-xs whitespace-nowrap">{m.fecha}</td>
                            <td className="px-4 py-2.5 text-white text-xs">{m.descripcion}</td>
                            <td className={`px-4 py-2.5 text-right font-mono text-xs font-medium whitespace-nowrap ${m.monto >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(m.monto)}</td>
                          </>
                        )}
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
                          {m.estado === 'conciliado' ? <span className="text-emerald-400">✅ Conciliado</span> : <span className="text-amber-400">⏳ Pendiente</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {editando ? (
                            <>
                              <button onClick={() => guardarEdicion(m.id)} className="text-[11px] text-emerald-400 hover:underline mr-2">
                                Guardar
                              </button>
                              <button onClick={() => setEditandoId(null)} className="text-[11px] text-white/40 hover:underline">
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              {m.estado === 'conciliado' && (
                                <button onClick={() => desconciliar(m.id)} className="text-[11px] text-white/30 hover:text-amber-400 mr-2">
                                  Desconciliar
                                </button>
                              )}
                              {m.estado === 'pendiente' && (
                                <button onClick={() => abrirEdicion(m)} className="text-white/30 hover:text-white text-xs mr-2" title="Corregir fecha, descripción o monto">
                                  ✏️
                                </button>
                              )}
                              <button onClick={() => eliminarMovimiento(m.id)} className="text-white/30 hover:text-red-400 text-xs">
                                🗑
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <div className="px-2">
              <ControlesPaginacion
                pagina={pagMovs.pagina}
                totalPaginas={pagMovs.totalPaginas}
                totalFilas={pagMovs.totalFilas}
                porPagina={pagMovs.porPagina}
                hayAnterior={pagMovs.hayAnterior}
                haySiguiente={pagMovs.haySiguiente}
                onAnterior={pagMovs.anterior}
                onSiguiente={pagMovs.siguiente}
              />
            </div>
          </div>

          {cierres.length > 0 && (
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10 text-xs font-medium text-white/60">🗂 Historial de cierres de conciliación</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium text-right">Saldo banco</th>
                    <th className="px-4 py-2 font-medium text-right">Saldo libro</th>
                    <th className="px-4 py-2 font-medium text-right">Diferencia no explicada</th>
                    <th className="px-4 py-2 font-medium text-right">Pendientes</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {cierres.map((c) => (
                    <tr key={c.id} className="border-t border-white/5">
                      <td className="px-4 py-2.5 text-white/70 text-xs">{c.fecha}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-white/70">{fmt(c.saldo_banco)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-white/70">{fmt(c.saldo_libro)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold ${Math.abs(c.diferencia_no_explicada) < 0.01 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(c.diferencia_no_explicada)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-amber-300">{c.num_pendientes_banco} banco / {c.num_pendientes_libro} libro</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => eliminarCierre(c.id)} className="text-white/30 hover:text-red-400 text-xs" title="Eliminar este cierre del historial">
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
