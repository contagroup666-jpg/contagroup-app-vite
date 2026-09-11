import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'
import EstadoVacio from '../../components/EstadoVacio'
import TablaSkeleton from '../../components/TablaSkeleton'

type Factura = Database['public']['Tables']['facturas']['Row']
type Producto = Database['public']['Tables']['productos']['Row']
type Cliente = Database['public']['Tables']['clientes']['Row']
type Empresa = Database['public']['Tables']['empresas']['Row']

function fmt(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n || 0)
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// Catálogo de ejemplo — SOLO ilustrativo. El código real de cada producto
// gravado con ICE lo asigna el SRI por marca/producto, a solicitud del
// contribuyente (correo simar@sri.gob.ec) — no se elige libremente de una
// lista genérica. Este catálogo ayuda a identificar la CATEGORÍA, pero el
// código de 33 caracteres que va en el anexo siempre debe ser el que el SRI
// asignó a esa marca específica.
const ICE_CATEGORIAS = [
  { cod: '3610-38-006287-076-000005-66-116-000000', desc: 'Bebidas azucaradas < 25g/lt', gramosAzucar: true },
  { cod: '3610-38-006287-076-000050-66-116-000000', desc: 'Bebidas azucaradas >= 25g/lt', gramosAzucar: true },
  { cod: '2208-00-000000-000-000000-66-000-000000', desc: 'Alcohol etílico / bebidas alcohólicas', gramosAzucar: false },
  { cod: '2402-20-000000-000-000000-66-000-000000', desc: 'Cigarrillos / tabaco', gramosAzucar: false },
  { cod: '8703-10-000000-000-000000-66-000-000000', desc: 'Vehículos automóviles gasolina <=2000cc', gramosAzucar: false },
  { cod: '8703-10-000000-000-000000-66-000-000001', desc: 'Vehículos automóviles gasolina >2000cc', gramosAzucar: false },
  { cod: '8703-10-000000-000-000000-66-000-000002', desc: 'Vehículos híbridos / eléctricos', gramosAzucar: false },
  { cod: '8711-00-000000-000-000000-66-000-000000', desc: 'Motocicletas <= 250cc', gramosAzucar: false },
  { cod: '2106-90-000000-000-000000-66-000-000000', desc: 'Bebidas energizantes', gramosAzucar: true },
  { cod: '3303-00-000000-000-000000-66-000-000000', desc: 'Perfumes / aguas de colonia', gramosAzucar: false },
  { cod: '9504-00-000000-000-000000-66-000-000000', desc: 'Juegos de azar / videojuegos', gramosAzucar: false },
]

// El campo "Gramos de azúcar" solo tiene sentido para la categoría de
// bebidas azucaradas/energizantes del ICE (define la tarifa < 25g/lt vs
// >= 25g/lt). Para cualquier otro producto (o ninguno) no aplica — mostrarlo
// siempre, para materiales como cables o cámaras, no tenía sentido.
function requiereGramosAzucar(codigoIce: string) {
  return ICE_CATEGORIAS.find((c) => c.cod === codigoIce)?.gramosAzucar ?? false
}

type FilaIce = { codigoIce: string; clienteRuc: string; clienteNombre: string; tipoVenta: string; gramosAzucar: number; ventas: number; devoluciones: number }

// Generador ICE (Impuesto a los Consumos Especiales — SRI Ecuador).
//
// Corrección de fondo respecto al legacy: el exportador anterior, por cada
// factura del periodo, repetía TODOS los productos con código ICE de la
// empresa — sin revisar si esa venta en concreto incluía ese producto.
// Una venta de $50 sin ningún producto gravado con ICE terminaba generando
// filas ICE por el valor completo de esa venta, para cada producto ICE que
// la empresa tuviera registrado en cualquier parte. Eso sobreestima el
// valor declarado, potencialmente varias veces. Además, la ficha técnica
// del SRI exige "un solo registro por cada producto/servicio y por cada
// cliente" en el periodo — el legacy generaba un registro por factura,
// duplicando filas para el mismo cliente y producto.
//
// Aquí: se revisan los ítems reales de cada factura (`items` jsonb) y de
// cada devolución, se cruzan contra los productos con `codigo_ice`
// asignado, y se agrega por (código ICE + cliente) — un solo registro por
// combinación, como pide el SRI.
export default function ICEPage() {
  const { perfil } = useAuth()
  const empresaId = perfil?.empresa_id ?? null

  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [anio, setAnio] = useState(now.getFullYear())
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [devolucionesItems, setDevolucionesItems] = useState<{ items: { producto_id: string; cantidad: number; precio: number }[]; venta_id: string | null; fecha: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const [editorAbierto, setEditorAbierto] = useState(false)
  const [asignaciones, setAsignaciones] = useState<Record<string, { codigo_ice: string; tipo_venta_ice: string; gramos_azucar: string }>>({})
  const [guardandoProd, setGuardandoProd] = useState<string | null>(null)

  async function cargar() {
    if (!empresaId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [empRes, facRes, prodRes, cliRes, devRes] = await Promise.all([
      supabase.from('empresas').select('*').eq('id', empresaId).maybeSingle(),
      supabase.from('facturas').select('*').eq('empresa_id', empresaId).neq('estado', 'Anulada'),
      supabase.from('productos').select('*').eq('empresa_id', empresaId),
      supabase.from('clientes').select('*').eq('empresa_id', empresaId),
      supabase.from('pos_devoluciones').select('items,venta_id,fecha').eq('empresa_id', empresaId),
    ])
    if (facRes.error) setError(facRes.error.message)
    else setError(null)
    setEmpresa((empRes.data ?? null) as unknown as Empresa | null)
    setFacturas((facRes.data ?? []) as unknown as Factura[])
    setProductos((prodRes.data ?? []) as unknown as Producto[])
    setClientes((cliRes.data ?? []) as unknown as Cliente[])
    setDevolucionesItems((devRes.data ?? []) as unknown as typeof devolucionesItems)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const productosIce = useMemo(() => productos.filter((p) => p.codigo_ice), [productos])
  const productoPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos])
  const clienteMap = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes])

  const enPeriodo = (fecha: string | null) => {
    if (!fecha) return false
    const d = new Date(fecha)
    return d.getMonth() + 1 === mes && d.getFullYear() === anio
  }

  const facturasPeriodo = useMemo(() => facturas.filter((f) => enPeriodo(f.fecha)), [facturas, mes, anio])
  const devolucionesPeriodo = useMemo(() => devolucionesItems.filter((d) => enPeriodo(d.fecha)), [devolucionesItems, mes, anio])

  // Agregación real: un registro por (código ICE, cliente), sumando ventas
  // y devoluciones de items que efectivamente son productos ICE.
  const filasIce = useMemo(() => {
    if (productosIce.length === 0) return [] as FilaIce[]
    const mapa = new Map<string, FilaIce>()
    const clave = (codigoIce: string, ruc: string) => `${codigoIce}::${ruc}`

    for (const f of facturasPeriodo) {
      const cl = f.cliente_id ? clienteMap.get(f.cliente_id) : null
      const ruc = cl?.ruc || '9999999999999'
      for (const item of f.items || []) {
        if (!item.producto_id) continue
        const prod = productoPorId.get(item.producto_id)
        if (!prod?.codigo_ice) continue
        const k = clave(prod.codigo_ice, ruc)
        const existente = mapa.get(k) ?? {
          codigoIce: prod.codigo_ice,
          clienteRuc: ruc,
          clienteNombre: cl?.nombre || 'Consumidor Final',
          tipoVenta: prod.tipo_venta_ice || '1-LOCAL',
          gramosAzucar: prod.gramos_azucar || 0,
          ventas: 0,
          devoluciones: 0,
        }
        existente.ventas += item.precio * item.cantidad
        mapa.set(k, existente)
      }
    }

    for (const d of devolucionesPeriodo) {
      for (const item of d.items || []) {
        const prod = productoPorId.get(item.producto_id)
        if (!prod?.codigo_ice) continue
        // La devolución no guarda cliente directamente; se agrega bajo "Consumidor Final"
        // salvo que se quiera enlazar a la venta original — mantenido simple y honesto.
        const k = clave(prod.codigo_ice, '9999999999999')
        const existente = mapa.get(k) ?? {
          codigoIce: prod.codigo_ice,
          clienteRuc: '9999999999999',
          clienteNombre: 'Consumidor Final',
          tipoVenta: prod.tipo_venta_ice || '1-LOCAL',
          gramosAzucar: prod.gramos_azucar || 0,
          ventas: 0,
          devoluciones: 0,
        }
        existente.devoluciones += item.precio * item.cantidad
        mapa.set(k, existente)
      }
    }

    return Array.from(mapa.values()).sort((a, b) => a.codigoIce.localeCompare(b.codigoIce))
  }, [facturasPeriodo, devolucionesPeriodo, productoPorId, clienteMap, productosIce])

  function iniciarAsignaciones() {
    const inicial: Record<string, { codigo_ice: string; tipo_venta_ice: string; gramos_azucar: string }> = {}
    productos.forEach((p) => {
      inicial[p.id] = { codigo_ice: p.codigo_ice || '', tipo_venta_ice: p.tipo_venta_ice || '1-LOCAL', gramos_azucar: String(p.gramos_azucar ?? 0) }
    })
    setAsignaciones(inicial)
    setEditorAbierto(true)
  }

  async function guardarAsignacion(productoId: string) {
    const a = asignaciones[productoId]
    if (!a) return
    setGuardandoProd(productoId)
    const { error: err } = await supabase
      .from('productos')
      .update({ codigo_ice: a.codigo_ice.trim() || null, tipo_venta_ice: a.tipo_venta_ice, gramos_azucar: parseFloat(a.gramos_azucar) || 0 })
      .eq('id', productoId)
    setGuardandoProd(null)
    if (err) return setError(err.message)
    await cargar()
  }

  function exportarICE() {
    setExportando(true)
    try {
      const wb = XLSX.utils.book_new()
      const wsP = XLSX.utils.aoa_to_sheet([
        ['ICE_V01'],
        ['', 'Datos de la Empresa'],
        ['', 'Descripcion'],
        ['', 'No. de RUC', empresa?.ruc || '', '<== escriba su # RUC'],
        ['', 'Razon Social', empresa?.nombre || '', '<== escriba su Razon Social'],
        ['', 'Dirección', empresa?.direccion || '', '<== su dirección (opcional)'],
      ])
      XLSX.utils.book_append_sheet(wb, wsP, 'Parametros')

      const hdrV = ['Codigo del Producto', 'No. de Identificacion', 'Tipo Identificacion', 'Razon Social Contribuyente (OPCIONAL)', 'Tipo de Venta', 'Ventas', 'Devoluciones', 'Dados de Baja', 'Gramos de Azucar']
      const rowsV = filasIce.map((r) => [r.codigoIce, r.clienteRuc, 'C-Cédula', r.clienteNombre, r.tipoVenta, r.ventas, r.devoluciones, 0, r.gramosAzucar])
      const wsV = XLSX.utils.aoa_to_sheet([hdrV, ...rowsV])
      wsV['!cols'] = hdrV.map(() => ({ wch: 20 }))
      XLSX.utils.book_append_sheet(wb, wsV, 'VENTAS')

      const hdrI = ['Refrendo (Distrito Aduanero)', 'Refrendo (Año)', 'Refrendo (Régimen)', 'Refrendo (Secuencial)', 'Codigo del Producto', 'Fecha de Desaduanización', 'País de Procedencia', 'Cantidad Importada']
      const wsI = XLSX.utils.aoa_to_sheet([hdrI])
      XLSX.utils.book_append_sheet(wb, wsI, 'IMPORTACIONES')

      XLSX.writeFile(wb, `ICE_${empresa?.nombre?.split(' ')[0] || 'empresa'}_${MESES[mes - 1]}_${anio}.xlsx`)
    } catch (e) {
      setError(`No se pudo exportar: ${(e as Error).message}`)
    } finally {
      setExportando(false)
    }
  }

  if (!empresaId) return <EstadoVacio icono="🧊" titulo="Sin empresa asignada" descripcion="Tu usuario no tiene una empresa asignada todavía." />

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-white mb-1">Generador ICE</h1>
      <p className="text-xs text-white/40 mb-4">Anexo del Impuesto a los Consumos Especiales — ventas y devoluciones de productos gravados, agregado por producto y cliente.</p>

      <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
        ⚠️ El código ICE de 33 caracteres lo asigna el SRI por marca/producto (se solicita a{' '}
        <a href="mailto:simar@sri.gob.ec" className="underline">
          simar@sri.gob.ec
        </a>
        ) — el catálogo de abajo es solo una referencia de categorías, no un código listo para usar sin verificar.
      </p>

      {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}
      {loading && <TablaSkeleton />}

      {!loading && (
        <>
          <div className="rounded-2xl border border-white/10 p-4 mb-4 flex items-center gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-white/50 mb-1">Mes</label>
              <select value={mes} onChange={(e) => setMes(parseInt(e.target.value))} style={{ colorScheme: 'dark' }} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                {MESES.map((m, i) => (
                  <option key={i} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Año</label>
              <input type="number" value={anio} onChange={(e) => setAnio(parseInt(e.target.value) || now.getFullYear())} className="w-24 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
            </div>
            <button onClick={exportarICE} disabled={exportando} className="ml-auto rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-4 py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60 self-end">
              {exportando ? 'Exportando…' : '📥 Exportar ICE (.xlsx)'}
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-medium text-white/60">🧊 Productos con código ICE registrados</span>
              <button onClick={() => (editorAbierto ? setEditorAbierto(false) : iniciarAsignaciones())} className="text-[11px] text-blue-300 hover:underline">
                {editorAbierto ? 'Cerrar editor' : '✏️ Asignar códigos ICE a productos'}
              </button>
            </div>
            {editorAbierto ? (
              productos.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-white/30">No hay productos registrados en esta empresa.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                      <th className="px-4 py-2 font-medium">Producto</th>
                      <th className="px-4 py-2 font-medium">Código ICE</th>
                      <th className="px-4 py-2 font-medium">Tipo Venta</th>
                      <th className="px-4 py-2 font-medium">Gramos azúcar</th>
                      <th className="px-4 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {productos.map((p) => {
                      const a = asignaciones[p.id] ?? { codigo_ice: '', tipo_venta_ice: '1-LOCAL', gramos_azucar: '0' }
                      return (
                        <tr key={p.id} className="border-t border-white/5 align-top">
                          <td className="px-4 py-2.5 text-white text-xs">{p.nombre}</td>
                          <td className="px-4 py-2.5">
                            <select
                              value={a.codigo_ice}
                              onChange={(e) => {
                                const nuevoCodigo = e.target.value
                                // Si el nuevo código no es de bebidas, limpiar gramos de azúcar
                                // para no dejar un valor viejo guardado sin sentido.
                                const gramos = requiereGramosAzucar(nuevoCodigo) ? a.gramos_azucar : '0'
                                setAsignaciones({ ...asignaciones, [p.id]: { ...a, codigo_ice: nuevoCodigo, gramos_azucar: gramos } })
                              }}
                              style={{ colorScheme: 'dark' }}
                              className="w-full max-w-[260px] rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white outline-none focus:border-[var(--color-blue-5)]"
                            >
                              <option value="">Sin código ICE</option>
                              {ICE_CATEGORIAS.map((ic) => (
                                <option key={ic.cod} value={ic.cod}>
                                  {ic.desc}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              value={a.tipo_venta_ice}
                              onChange={(e) => setAsignaciones({ ...asignaciones, [p.id]: { ...a, tipo_venta_ice: e.target.value } })}
                              style={{ colorScheme: 'dark' }}
                              className="rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white outline-none focus:border-[var(--color-blue-5)]"
                            >
                              <option value="1-LOCAL">1-LOCAL</option>
                              <option value="2-EXPORTACION">2-EXPORTACION</option>
                            </select>
                          </td>
                          <td className="px-4 py-2.5">
                            {requiereGramosAzucar(a.codigo_ice) ? (
                              <input
                                type="number"
                                step="0.01"
                                value={a.gramos_azucar}
                                onChange={(e) => setAsignaciones({ ...asignaciones, [p.id]: { ...a, gramos_azucar: e.target.value } })}
                                className="w-20 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white outline-none focus:border-[var(--color-blue-5)]"
                              />
                            ) : (
                              <span className="text-[11px] text-white/25">No aplica</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <button onClick={() => guardarAsignacion(p.id)} disabled={guardandoProd === p.id} className="text-[11px] text-emerald-400 hover:underline disabled:opacity-40">
                              {guardandoProd === p.id ? 'Guardando…' : 'Guardar'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            ) : productosIce.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-white/30">Ningún producto tiene código ICE. Usa "Asignar códigos ICE a productos" arriba.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">Código Producto</th>
                    <th className="px-4 py-2 font-medium">Nombre</th>
                    <th className="px-4 py-2 font-medium">Código ICE</th>
                  </tr>
                </thead>
                <tbody>
                  {productosIce.map((p) => (
                    <tr key={p.id} className="border-t border-white/5">
                      <td className="px-4 py-2.5 text-white/70 font-mono text-xs">{p.codigo}</td>
                      <td className="px-4 py-2.5 text-white text-xs">{p.nombre}</td>
                      <td className="px-4 py-2.5 text-blue-300 font-mono text-[11px] break-all">{p.codigo_ice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-white/10 text-xs font-medium text-white/60">
              📊 Ventas ICE — {MESES[mes - 1]} {anio} (un registro por producto y cliente)
            </div>
            {filasIce.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-white/30">
                {productosIce.length === 0 ? 'Asigna códigos ICE a los productos para ver datos aquí.' : 'Sin ventas de productos ICE en este período.'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">Código ICE</th>
                    <th className="px-4 py-2 font-medium">Cliente</th>
                    <th className="px-4 py-2 font-medium">Tipo Venta</th>
                    <th className="px-4 py-2 font-medium text-right">Ventas</th>
                    <th className="px-4 py-2 font-medium text-right">Devoluciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filasIce.map((r, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="px-4 py-2.5 text-blue-300 font-mono text-[11px] break-all">{r.codigoIce}</td>
                      <td className="px-4 py-2.5 text-white text-xs">
                        {r.clienteNombre} <span className="text-white/30 font-mono">({r.clienteRuc})</span>
                      </td>
                      <td className="px-4 py-2.5 text-white/50 text-xs">{r.tipoVenta}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-emerald-400">{fmt(r.ventas)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-red-400">{fmt(r.devoluciones)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 text-xs font-medium text-white/60">📖 Catálogo de referencia (categorías, no códigos oficiales)</div>
            <table className="w-full text-sm">
              <tbody>
                {ICE_CATEGORIAS.map((ic, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="px-4 py-2 text-white/30 font-mono text-xs w-8">{i + 1}</td>
                    <td className="px-4 py-2 text-white/50 font-mono text-[11px] break-all">{ic.cod}</td>
                    <td className="px-4 py-2 text-white text-xs">{ic.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
