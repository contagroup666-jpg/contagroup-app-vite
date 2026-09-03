import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { crearAsiento } from '../../lib/contabilidad'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'
import EstadoVacio from '../../components/EstadoVacio'

type Compra = Database['public']['Tables']['compras']['Row']
type Proveedor = Database['public']['Tables']['proveedores']['Row']
type Cuenta = Database['public']['Tables']['plan_cuentas']['Row']
type Config = Database['public']['Tables']['config_cuentas_contables']['Row']

const SUSTENTO_TRIBUTARIO = [
  '01- Crédito Tributario para declaración de IVA',
  '02- Costo o Gasto para declaración de IR',
  '03- Activo Fijo - Crédito Tributario IVA',
  '04- Activo Fijo - Costo o Gasto IR',
  '05- Liquidación de compra bienes y servicios',
  '06- No de crédito tributario ni gasto',
  '07- Compras bienes sector agrícola',
  '10- Dist. de dividendos, beneficios o utilidades',
]

function fmt(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n || 0)
}

const PROV_VACIO = { nombre: '', ruc: '', tipo: '01-Sociedad', email: '', telefono: '' }
const COMPRA_VACIA = {
  proveedor_id: '',
  numero: '',
  fecha: new Date().toISOString().slice(0, 10),
  fecha_vencimiento: '',
  tipo_comprobante: '01-Factura',
  autorizacion: '',
  sustento: SUSTENTO_TRIBUTARIO[0],
  tipo_compra: 'Gastos',
  cuenta_id: '',
  categoria: '',
  base0: '0',
  baseiva: '0',
  iva: '0',
  concepto: '',
}

export default function ComprasPage() {
  const { perfil } = useAuth()
  const empresaId = perfil?.empresa_id ?? null
  const [tab, setTab] = useState<'compras' | 'proveedores' | 'cxp'>('compras')

  const [compras, setCompras] = useState<Compra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editandoProv, setEditandoProv] = useState<Proveedor | null>(null)
  const [formProv, setFormProv] = useState(PROV_VACIO)
  const [mostrarFormProv, setMostrarFormProv] = useState(false)
  const [errorProv, setErrorProv] = useState<string | null>(null)
  const [guardandoProv, setGuardandoProv] = useState(false)

  const [editandoCompra, setEditandoCompra] = useState<Compra | null>(null)
  const [formCompra, setFormCompra] = useState(COMPRA_VACIA)
  const [mostrarFormCompra, setMostrarFormCompra] = useState(false)
  const [errorCompra, setErrorCompra] = useState<string | null>(null)
  const [guardandoCompra, setGuardandoCompra] = useState(false)

  const [pagando, setPagando] = useState<Compra | null>(null)
  const [formPago, setFormPago] = useState({ monto: '0', fecha: new Date().toISOString().slice(0, 10), forma: 'Efectivo' as 'Efectivo' | 'Bancos' })
  const [errorPago, setErrorPago] = useState<string | null>(null)
  const [guardandoPago, setGuardandoPago] = useState(false)

  async function cargar() {
    if (!empresaId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [comprasRes, provRes, cuentasRes, configRes] = await Promise.all([
      supabase.from('compras').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('proveedores').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('plan_cuentas').select('*').eq('empresa_id', empresaId).eq('es_detalle', true).in('clase', [1, 5]).order('codigo'),
      supabase.from('config_cuentas_contables').select('*').eq('empresa_id', empresaId).maybeSingle(),
    ])
    if (comprasRes.error) setError(comprasRes.error.message)
    else setCompras((comprasRes.data ?? []) as unknown as Compra[])
    setProveedores((provRes.data ?? []) as unknown as Proveedor[])
    setCuentas((cuentasRes.data ?? []) as unknown as Cuenta[])
    setConfig((configRes.data as unknown as Config) ?? null)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const nombreProveedor = (id: string) => proveedores.find((p) => p.id === id)?.nombre ?? 'N/D'
  const nombreCuenta = (id: string | null) => {
    const c = cuentas.find((x) => x.id === id)
    return c ? `${c.codigo} — ${c.nombre}` : '—'
  }

  // ── Proveedores ──
  function abrirNuevoProv() {
    setEditandoProv(null)
    setFormProv(PROV_VACIO)
    setErrorProv(null)
    setMostrarFormProv(true)
  }
  function abrirEditarProv(p: Proveedor) {
    setEditandoProv(p)
    setFormProv({ nombre: p.nombre, ruc: p.ruc ?? '', tipo: p.tipo, email: p.email ?? '', telefono: p.telefono ?? '' })
    setErrorProv(null)
    setMostrarFormProv(true)
  }
  async function handleSubmitProv(e: FormEvent) {
    e.preventDefault()
    if (!formProv.nombre.trim()) {
      setErrorProv('El nombre es obligatorio.')
      return
    }
    if (!empresaId) return
    setGuardandoProv(true)
    setErrorProv(null)
    const payload = { nombre: formProv.nombre.trim(), ruc: formProv.ruc.trim() || null, tipo: formProv.tipo, email: formProv.email.trim() || null, telefono: formProv.telefono.trim() || null }
    const resultado = editandoProv
      ? await supabase.from('proveedores').update(payload).eq('id', editandoProv.id)
      : await supabase.from('proveedores').insert({ ...payload, empresa_id: empresaId })
    setGuardandoProv(false)
    if (resultado.error) {
      setErrorProv(resultado.error.message)
      return
    }
    setMostrarFormProv(false)
    await cargar()
  }
  async function handleEliminarProv(p: Proveedor) {
    if (!confirm(`¿Eliminar al proveedor "${p.nombre}"?`)) return
    const { error: err } = await supabase.from('proveedores').delete().eq('id', p.id)
    if (err) {
      setError(`No se pudo eliminar (verifica que no tenga compras asociadas): ${err.message}`)
      return
    }
    await cargar()
  }

  // ── Compras ──
  function abrirNuevaCompra() {
    setEditandoCompra(null)
    setFormCompra(COMPRA_VACIA)
    setErrorCompra(null)
    setMostrarFormCompra(true)
  }
  function abrirEditarCompra(c: Compra) {
    setEditandoCompra(c)
    setFormCompra({
      proveedor_id: c.proveedor_id,
      numero: c.numero,
      fecha: c.fecha,
      fecha_vencimiento: c.fecha_vencimiento ?? '',
      tipo_comprobante: c.tipo_comprobante,
      autorizacion: c.autorizacion ?? '',
      sustento: c.sustento ?? SUSTENTO_TRIBUTARIO[0],
      tipo_compra: c.tipo_compra,
      cuenta_id: c.cuenta_id ?? '',
      categoria: c.categoria ?? '',
      base0: String(c.base0 ?? 0),
      baseiva: String(c.baseiva ?? 0),
      iva: String(c.iva ?? 0),
      concepto: c.concepto ?? '',
    })
    setErrorCompra(null)
    setMostrarFormCompra(true)
  }

  async function handleSubmitCompra(e: FormEvent) {
    e.preventDefault()
    if (!formCompra.proveedor_id || !formCompra.numero.trim()) {
      setErrorCompra('Proveedor y número son obligatorios.')
      return
    }
    if (!formCompra.cuenta_id) {
      setErrorCompra('Selecciona a qué cuenta contable va esta compra.')
      return
    }
    if (!empresaId) return
    setGuardandoCompra(true)
    setErrorCompra(null)

    const base0 = parseFloat(formCompra.base0) || 0
    const baseiva = parseFloat(formCompra.baseiva) || 0
    const iva = parseFloat(formCompra.iva) || 0
    const total = base0 + baseiva + iva

    const payload = {
      proveedor_id: formCompra.proveedor_id,
      numero: formCompra.numero.trim(),
      fecha: formCompra.fecha,
      fecha_vencimiento: formCompra.fecha_vencimiento || null,
      tipo_comprobante: formCompra.tipo_comprobante,
      autorizacion: formCompra.autorizacion.trim() || null,
      sustento: formCompra.sustento,
      tipo_compra: formCompra.tipo_compra,
      cuenta_id: formCompra.cuenta_id,
      categoria: formCompra.categoria.trim() || null,
      base0,
      baseiva,
      iva,
      total,
      concepto: formCompra.concepto.trim() || null,
    }

    if (editandoCompra) {
      const { error: err } = await supabase.from('compras').update(payload).eq('id', editandoCompra.id)
      setGuardandoCompra(false)
      if (err) {
        setErrorCompra(err.message)
        return
      }
      setMostrarFormCompra(false)
      await cargar()
      return
    }

    const { error: err } = await supabase.from('compras').insert({ ...payload, empresa_id: empresaId })
    setGuardandoCompra(false)
    if (err) {
      setErrorCompra(err.message)
      return
    }
    setMostrarFormCompra(false)

    if (!config?.cuenta_cxp_id) {
      setError('Compra registrada, pero NO se contabilizó: falta configurar la cuenta de Cuentas por Pagar en Configuración contable.')
    } else {
      try {
        await crearAsiento({
          empresaId,
          concepto: `Compra ${payload.numero} — ${nombreProveedor(payload.proveedor_id)}`,
          fecha: payload.fecha,
          lineas: [
            { cuenta_id: payload.cuenta_id, debe: total, haber: 0 },
            { cuenta_id: config.cuenta_cxp_id, debe: 0, haber: total },
          ],
          prefijo: 'CMP',
          creadoPor: perfil?.id ?? null,
        })
      } catch (asientoErr) {
        setError(`Compra registrada, pero el asiento contable falló: ${(asientoErr as Error).message}`)
      }
    }
    await cargar()
  }

  async function handleEliminarCompra(c: Compra) {
    if (!confirm(`¿Eliminar la compra "${c.numero}"?\n\nNo se revertirá el asiento contable automáticamente — hazlo manual en Libro Diario si ya se había contabilizado.`)) return
    const { error: err } = await supabase.from('compras').delete().eq('id', c.id)
    if (err) {
      setError(`No se pudo eliminar (verifica que no tenga retenciones asociadas): ${err.message}`)
      return
    }
    await cargar()
  }

  // ── Pago (CxP) ──
  function abrirPago(c: Compra) {
    setPagando(c)
    const neto = (c.total || 0) - (c.monto_retenido || 0)
    setFormPago({ monto: neto.toFixed(2), fecha: new Date().toISOString().slice(0, 10), forma: 'Efectivo' })
    setErrorPago(null)
  }

  async function confirmarPago(e: FormEvent) {
    e.preventDefault()
    if (!pagando || !empresaId) return
    const monto = parseFloat(formPago.monto) || 0
    if (monto <= 0) {
      setErrorPago('El monto debe ser mayor a 0.')
      return
    }
    setGuardandoPago(true)
    setErrorPago(null)

    const cuentaOrigenId = formPago.forma === 'Efectivo' ? config?.cuenta_caja_id : config?.cuenta_bancos_id
    if (!config?.cuenta_cxp_id || !cuentaOrigenId) {
      setGuardandoPago(false)
      setErrorPago(`Falta configurar Cuentas por Pagar y/o ${formPago.forma === 'Efectivo' ? 'Caja' : 'Bancos'} en Configuración contable.`)
      return
    }

    try {
      await crearAsiento({
        empresaId,
        concepto: `Pago a proveedor ${nombreProveedor(pagando.proveedor_id)} — Factura ${pagando.numero} (Cuentas por Pagar / ${formPago.forma === 'Efectivo' ? 'Caja' : 'Bancos'})`,
        fecha: formPago.fecha,
        lineas: [
          { cuenta_id: config.cuenta_cxp_id, debe: monto, haber: 0 },
          { cuenta_id: cuentaOrigenId, debe: 0, haber: monto },
        ],
        prefijo: 'CMP',
        creadoPor: perfil?.id ?? null,
      })
    } catch (asientoErr) {
      setGuardandoPago(false)
      setErrorPago(`El asiento contable falló: ${(asientoErr as Error).message}`)
      return
    }

    const { error: err } = await supabase
      .from('compras')
      .update({ estado: 'Pagado', fecha_pago: formPago.fecha, forma_pago: formPago.forma })
      .eq('id', pagando.id)

    setGuardandoPago(false)
    if (err) {
      setErrorPago(err.message)
      return
    }
    setPagando(null)
    await cargar()
  }

  // ── CxP aging ──
  const cxp = useMemo(() => {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const en7 = new Date(hoy)
    en7.setDate(en7.getDate() + 7)
    let totalPorPagar = 0,
      totalVencido = 0,
      totalPorVencer = 0,
      totalPagadoMes = 0
    const mesActual = hoy.getMonth(),
      anioActual = hoy.getFullYear()
    const filas = compras
      .map((c) => {
        const neto = (c.total || 0) - (c.monto_retenido || 0)
        const venc = c.fecha_vencimiento ? new Date(c.fecha_vencimiento + 'T00:00:00') : null
        const vencida = c.estado !== 'Pagado' && !!venc && venc < hoy
        const porVencer = c.estado !== 'Pagado' && !!venc && venc >= hoy && venc <= en7
        if (c.estado !== 'Pagado') {
          totalPorPagar += neto
          if (vencida) totalVencido += neto
          if (porVencer) totalPorVencer += neto
        }
        if (c.estado === 'Pagado' && c.fecha_pago) {
          const fp = new Date(c.fecha_pago)
          if (fp.getMonth() === mesActual && fp.getFullYear() === anioActual) totalPagadoMes += neto
        }
        return { ...c, neto, vencida, porVencer }
      })
      .sort((a, b) => (a.fecha_vencimiento || '').localeCompare(b.fecha_vencimiento || ''))
    return { filas, totalPorPagar, totalVencido, totalPorVencer, totalPagadoMes }
  }, [compras])

  if (!empresaId) {
    return (
      <div className="p-6">
        <p className="text-sm text-white/60">Tu usuario no tiene una empresa activa asignada.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Compras — Proveedores</h2>
          <p className="text-xs text-white/40 mt-0.5">Registro de facturas de compra y proveedores</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={abrirNuevoProv} className="rounded-lg border border-white/10 text-white/60 text-xs font-semibold px-3 py-1.5 hover:bg-white/5 transition-colors">+ Proveedor</button>
          <button onClick={abrirNuevaCompra} className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[var(--color-blue-6)] transition-colors">+ Nueva Compra</button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-white/10">
        <button onClick={() => setTab('compras')} className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === 'compras' ? 'border-[var(--color-blue-5)] text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}>🧾 Facturas de Compra</button>
        <button onClick={() => setTab('proveedores')} className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === 'proveedores' ? 'border-[var(--color-blue-5)] text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}>🏭 Proveedores</button>
        <button onClick={() => setTab('cxp')} className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === 'cxp' ? 'border-[var(--color-blue-5)] text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}>💳 Cuentas por Pagar</button>
      </div>

      {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {loading && <p className="text-xs text-white/40">Cargando…</p>}

      {!loading && tab === 'compras' && (
        <>
          {compras.length === 0 ? (
            <EstadoVacio icono="🧾" titulo="Sin compras registradas" descripcion="Registra tu primera factura de compra." accion={{ label: '+ Nueva Compra', onClick: abrirNuevaCompra }} />
          ) : (
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">Número</th>
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium">Proveedor</th>
                    <th className="px-4 py-2 font-medium">Cuenta contable</th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                    <th className="px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {compras.map((c) => (
                    <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5 text-white font-mono text-xs">{c.numero}</td>
                      <td className="px-4 py-2.5 text-white/60 text-xs">{c.fecha}</td>
                      <td className="px-4 py-2.5 text-white">{nombreProveedor(c.proveedor_id)}</td>
                      <td className="px-4 py-2.5 text-white/50 text-xs">{nombreCuenta(c.cuenta_id)}</td>
                      <td className="px-4 py-2.5 text-right text-white font-medium">{fmt(c.total)}</td>
                      <td className="px-4 py-2.5"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${c.estado === 'Pagado' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{c.estado}</span></td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => abrirEditarCompra(c)} className="text-[11px] text-white/50 hover:text-white mr-3">Editar</button>
                        <button onClick={() => handleEliminarCompra(c)} className="text-[11px] text-red-400/70 hover:text-red-400">Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!loading && tab === 'proveedores' && (
        <>
          {proveedores.length === 0 ? (
            <EstadoVacio icono="🏭" titulo="Sin proveedores" descripcion="Registra tu primer proveedor." accion={{ label: '+ Proveedor', onClick: abrirNuevoProv }} />
          ) : (
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">Nombre</th>
                    <th className="px-4 py-2 font-medium">RUC</th>
                    <th className="px-4 py-2 font-medium">Tipo</th>
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 font-medium">Teléfono</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {proveedores.map((p) => (
                    <tr key={p.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5 text-white">{p.nombre}</td>
                      <td className="px-4 py-2.5 text-white/60 text-xs font-mono">{p.ruc || '—'}</td>
                      <td className="px-4 py-2.5 text-white/60 text-xs">{p.tipo}</td>
                      <td className="px-4 py-2.5 text-white/60 text-xs">{p.email || '—'}</td>
                      <td className="px-4 py-2.5 text-white/60 text-xs">{p.telefono || '—'}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => abrirEditarProv(p)} className="text-[11px] text-white/50 hover:text-white mr-3">Editar</button>
                        <button onClick={() => handleEliminarProv(p)} className="text-[11px] text-red-400/70 hover:text-red-400">Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!loading && tab === 'cxp' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-[11px] text-white/40">Por pagar</p>
              <p className="text-base font-semibold text-white">{fmt(cxp.totalPorPagar)}</p>
            </div>
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-[11px] text-red-400/70">Vencido</p>
              <p className="text-base font-semibold text-red-400">{fmt(cxp.totalVencido)}</p>
            </div>
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-[11px] text-amber-400/70">Por vencer (7 días)</p>
              <p className="text-base font-semibold text-amber-400">{fmt(cxp.totalPorVencer)}</p>
            </div>
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-[11px] text-emerald-400/70">Pagado este mes</p>
              <p className="text-base font-semibold text-emerald-400">{fmt(cxp.totalPagadoMes)}</p>
            </div>
          </div>

          {cxp.filas.length === 0 ? (
            <EstadoVacio icono="💳" titulo="Sin facturas de compra registradas" descripcion="Cuando registres compras, aparecerán aquí para su seguimiento de pago." />
          ) : (
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">Proveedor</th>
                    <th className="px-4 py-2 font-medium">Factura</th>
                    <th className="px-4 py-2 font-medium">Vencimiento</th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                    <th className="px-4 py-2 font-medium text-right">Retención</th>
                    <th className="px-4 py-2 font-medium text-right">Neto a pagar</th>
                    <th className="px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {cxp.filas.map((c) => (
                    <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5 text-white">{nombreProveedor(c.proveedor_id)}</td>
                      <td className="px-4 py-2.5 text-white/60 text-xs font-mono">{c.numero}</td>
                      <td className="px-4 py-2.5 text-xs">
                        {c.fecha_vencimiento ? (
                          <span className={c.vencida ? 'text-red-400 font-semibold' : c.porVencer ? 'text-amber-400 font-semibold' : 'text-white/60'}>{c.vencida ? '⚠ ' : ''}{c.fecha_vencimiento}</span>
                        ) : ('—')}
                      </td>
                      <td className="px-4 py-2.5 text-right text-white/70">{fmt(c.total)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-400/80 text-xs">{c.monto_retenido ? `−${fmt(c.monto_retenido)}` : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-white font-medium">{fmt(c.neto)}</td>
                      <td className="px-4 py-2.5">
                        {c.estado === 'Pagado' ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">Pagado</span>
                        ) : c.vencida ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Vencida</span>
                        ) : (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">Pendiente</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {c.estado === 'Pagado' ? (
                          <span className="text-[11px] text-white/40">{c.fecha_pago}</span>
                        ) : (
                          <button onClick={() => abrirPago(c)} className="text-[11px] text-[var(--color-blue-4)] hover:underline">💳 Pagar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {mostrarFormProv && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setMostrarFormProv(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">{editandoProv ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
            <form onSubmit={handleSubmitProv} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Nombre *</label>
                <input autoFocus value={formProv.nombre} onChange={(e) => setFormProv({ ...formProv, nombre: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">RUC</label>
                  <input value={formProv.ruc} onChange={(e) => setFormProv({ ...formProv, ruc: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Tipo</label>
                  <select value={formProv.tipo} onChange={(e) => setFormProv({ ...formProv, tipo: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                    <option value="01-Sociedad">Sociedad</option>
                    <option value="02-Persona Natural">Persona Natural</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Email</label>
                <input type="email" value={formProv.email} onChange={(e) => setFormProv({ ...formProv, email: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Teléfono</label>
                <input value={formProv.telefono} onChange={(e) => setFormProv({ ...formProv, telefono: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              {errorProv && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorProv}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setMostrarFormProv(false)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">Cancelar</button>
                <button type="submit" disabled={guardandoProv} className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">{guardandoProv ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mostrarFormCompra && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setMostrarFormCompra(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-md my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">{editandoCompra ? 'Editar Compra' : 'Nueva Compra'}</h3>
            <form onSubmit={handleSubmitCompra} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Proveedor *</label>
                <select value={formCompra.proveedor_id} onChange={(e) => setFormCompra({ ...formCompra, proveedor_id: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                  <option value="">Seleccionar proveedor…</option>
                  {proveedores.map((p) => (<option key={p.id} value={p.id}>{p.nombre} ({p.ruc})</option>))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Número *</label>
                  <input value={formCompra.numero} onChange={(e) => setFormCompra({ ...formCompra, numero: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Fecha</label>
                  <input type="date" value={formCompra.fecha} onChange={(e) => setFormCompra({ ...formCompra, fecha: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Fecha de vencimiento</label>
                <input type="date" value={formCompra.fecha_vencimiento} onChange={(e) => setFormCompra({ ...formCompra, fecha_vencimiento: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Sustento tributario</label>
                <select value={formCompra.sustento} onChange={(e) => setFormCompra({ ...formCompra, sustento: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-[var(--color-blue-5)]">
                  {SUSTENTO_TRIBUTARIO.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Cuenta contable (Activo o Gasto) *</label>
                <select value={formCompra.cuenta_id} onChange={(e) => setFormCompra({ ...formCompra, cuenta_id: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                  <option value="">Seleccionar cuenta…</option>
                  {cuentas.map((c) => (<option key={c.id} value={c.id}>{c.codigo} — {c.nombre}{c.clase === 1 ? ' (Activo)' : ' (Gasto)'}</option>))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Base 0%</label>
                  <input type="number" step="0.01" value={formCompra.base0} onChange={(e) => setFormCompra({ ...formCompra, base0: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Base IVA</label>
                  <input type="number" step="0.01" value={formCompra.baseiva} onChange={(e) => setFormCompra({ ...formCompra, baseiva: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">IVA</label>
                  <input type="number" step="0.01" value={formCompra.iva} onChange={(e) => setFormCompra({ ...formCompra, iva: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Concepto</label>
                <input value={formCompra.concepto} onChange={(e) => setFormCompra({ ...formCompra, concepto: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              {editandoCompra && <p className="text-[11px] text-white/40">Editar no vuelve a contabilizar (evita duplicar el asiento original).</p>}
              {errorCompra && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorCompra}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setMostrarFormCompra(false)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">Cancelar</button>
                <button type="submit" disabled={guardandoCompra} className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">{guardandoCompra ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pagando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setPagando(null)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Registrar pago</h3>
            <p className="text-xs text-white/40 mb-4">{nombreProveedor(pagando.proveedor_id)} — Factura {pagando.numero}{pagando.monto_retenido ? ` (Total ${fmt(pagando.total)} − Retención ${fmt(pagando.monto_retenido)})` : ''}</p>
            <form onSubmit={confirmarPago} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Monto</label>
                <input type="number" step="0.01" value={formPago.monto} onChange={(e) => setFormPago({ ...formPago, monto: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Fecha</label>
                  <input type="date" value={formPago.fecha} onChange={(e) => setFormPago({ ...formPago, fecha: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Forma de pago</label>
                  <select value={formPago.forma} onChange={(e) => setFormPago({ ...formPago, forma: e.target.value as 'Efectivo' | 'Bancos' })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                    <option value="Efectivo">Efectivo</option>
                    <option value="Bancos">Bancos</option>
                  </select>
                </div>
              </div>
              {errorPago && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorPago}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setPagando(null)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">Cancelar</button>
                <button type="submit" disabled={guardandoPago} className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">{guardandoPago ? 'Procesando…' : '💳 Confirmar pago'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
