import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'
import EstadoVacio from '../../components/EstadoVacio'
import TablaSkeleton from '../../components/TablaSkeleton'

type Factura = Database['public']['Tables']['facturas']['Row']
type Compra = Database['public']['Tables']['compras']['Row']
type Retencion = Database['public']['Tables']['retenciones']['Row']
type Cliente = Database['public']['Tables']['clientes']['Row']
type Proveedor = Database['public']['Tables']['proveedores']['Row']
type Empresa = Database['public']['Tables']['empresas']['Row']

function fmt(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n || 0)
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// Generador ATS (Anexo Transaccional Simplificado — SRI Ecuador): agrega
// ventas, compras y retenciones emitidas de un periodo y exporta un XLSX
// compatible con la plantilla del SRI.
//
// Dos correcciones de fondo respecto al legacy:
// 1) El legacy asumía que TODAS las ventas llevan IVA 12% y reportaba
//    "Base Imp. 1 Gravable IVA" = subtotal completo con tarifa fija 12,
//    sin distinguir ventas con tarifa 0%. La tarifa general vigente en
//    Ecuador es 15% desde abril de 2024 (corregido de raíz en el POS —
//    ver Configuración → empresas.iva_porcentaje). Aquí el reporte usa
//    las columnas reales por tarifa de cada factura (subtotal_0/12/15,
//    iva_12/iva_15) en vez de asumir una tarifa fija.
// 2) El legacy nunca advertía si una compra no tenía "Código de Sustento
//    Tributario" — un campo obligatorio del formato SRI. Aquí se valida
//    antes de exportar y se avisa cuáles comprobantes están incompletos.
//
// Limitación conocida y deliberada: el sistema factura a una sola tarifa
// por venta (la configurada en la empresa), no por producto — si una
// empresa vende productos con tarifas mixtas (0% y 15% en la misma
// factura), este anexo no lo desglosará correctamente. Eso requeriría
// agregar una tarifa de IVA por producto, una funcionalidad más grande
// que queda fuera de este alcance.
export default function ATSPage() {
  const { perfil } = useAuth()
  const empresaId = perfil?.empresa_id ?? null

  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [anio, setAnio] = useState(now.getFullYear())
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [compras, setCompras] = useState<Compra[]>([])
  const [retenciones, setRetenciones] = useState<Retencion[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)

  async function cargar() {
    if (!empresaId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [empRes, facRes, compRes, retRes, cliRes, provRes] = await Promise.all([
      supabase.from('empresas').select('*').eq('id', empresaId).maybeSingle(),
      supabase.from('facturas').select('*').eq('empresa_id', empresaId).neq('estado', 'Anulada'),
      supabase.from('compras').select('*').eq('empresa_id', empresaId),
      supabase.from('retenciones').select('*').eq('empresa_id', empresaId),
      supabase.from('clientes').select('*').eq('empresa_id', empresaId),
      supabase.from('proveedores').select('*').eq('empresa_id', empresaId),
    ])
    if (facRes.error) setError(facRes.error.message)
    else setError(null)
    setEmpresa((empRes.data ?? null) as unknown as Empresa | null)
    setFacturas((facRes.data ?? []) as unknown as Factura[])
    setCompras((compRes.data ?? []) as unknown as Compra[])
    setRetenciones((retRes.data ?? []) as unknown as Retencion[])
    setClientes((cliRes.data ?? []) as unknown as Cliente[])
    setProveedores((provRes.data ?? []) as unknown as Proveedor[])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const clienteMap = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes])
  const proveedorMap = useMemo(() => new Map(proveedores.map((p) => [p.id, p])), [proveedores])

  const enPeriodo = (fecha: string | null) => {
    if (!fecha) return false
    const d = new Date(fecha)
    return d.getMonth() + 1 === mes && d.getFullYear() === anio
  }

  const facturasPeriodo = useMemo(() => facturas.filter((f) => enPeriodo(f.fecha)), [facturas, mes, anio])
  const comprasPeriodo = useMemo(() => compras.filter((c) => enPeriodo(c.fecha)), [compras, mes, anio])
  const retencionesPeriodo = useMemo(() => retenciones.filter((r) => enPeriodo(r.fecha)), [retenciones, mes, anio])

  const totales = useMemo(
    () => ({
      ventas: facturasPeriodo.reduce((s, f) => s + f.total, 0),
      compras: comprasPeriodo.reduce((s, c) => s + c.total, 0),
      retenciones: retencionesPeriodo.reduce((s, r) => s + r.total_retenido, 0),
      ivaVentas: facturasPeriodo.reduce((s, f) => s + f.iva, 0),
      ivaCompras: comprasPeriodo.reduce((s, c) => s + (c.iva || 0), 0),
    }),
    [facturasPeriodo, comprasPeriodo, retencionesPeriodo]
  )

  const comprasSinSustento = useMemo(() => comprasPeriodo.filter((c) => !c.sustento), [comprasPeriodo])

  function exportarATS() {
    if (comprasSinSustento.length > 0) {
      setError(`${comprasSinSustento.length} compra(s) del periodo no tienen "Código de Sustento Tributario" — es obligatorio para el SRI. Complétalos en Compras antes de exportar.`)
      return
    }
    setError(null)
    setExportando(true)
    try {
      const wb = XLSX.utils.book_new()

      const wsParams = XLSX.utils.aoa_to_sheet([
        ['ATS_V01'],
        ['', 'Datos de la Empresa'],
        ['', 'Descripcion', ''],
        ['', 'No. de RUC', empresa?.ruc || '', '<== RUC de la empresa'],
        ['', 'Razon Social', empresa?.nombre || '', '<== Razón Social'],
        ['', 'Periodo', `${MESES[mes - 1]}-${anio}`, ''],
      ])
      XLSX.utils.book_append_sheet(wb, wsParams, 'Parametros')

      const hdrV = [
        'No. de Identificacion', 'Codig Identif.', 'Razon Social Contribuyente', 'Tipo Cliente', 'Parte Relacionada',
        'Cantidad de Comprobantes', 'Tipo de Emision del Comprobante', 'Tipo de Comprobante', 'Fecha de Emisión',
        'Codigo Establecimiento', 'No. Documento (Opcional)', 'Concepto de la Venta (Opcional)',
        'Base Imponible NO Objeto de IVA', 'Base Imponible EXENTA', 'Base Imponible Tarifa 0%',
        'Base Imp. Gravable IVA 12%', 'Monto IVA 12%', 'Base Imp. Gravable IVA 15%', 'Monto IVA 15%', 'Total del Documento',
      ]
      const rowsV = facturasPeriodo.map((f) => {
        const cl = f.cliente_id ? clienteMap.get(f.cliente_id) : null
        const partes = f.numero.split('-')
        return [
          cl?.ruc || '9999999999999', 'R-Ruc', cl?.nombre || 'Consumidor Final', '01-Persona Natural', 'NO', 1, 'E-Electronico',
          '18-Documentos autorizados utilizados en ventas excepto N/C N/D', f.fecha, partes[0] || '001', f.numero,
          'Venta de bienes y servicios', 0, 0, f.subtotal_0 || 0, f.subtotal_12 || 0, f.iva_12 || 0, f.subtotal_15 ?? f.subtotal, f.iva_15 ?? f.iva, f.total,
        ]
      })
      const wsV = XLSX.utils.aoa_to_sheet([hdrV, ...rowsV])
      wsV['!cols'] = hdrV.map(() => ({ wch: 20 }))
      XLSX.utils.book_append_sheet(wb, wsV, 'VENTAS')

      const hdrC = [
        'No. de Identificacion', 'Tipo Identif.', 'Razon Social Contribuyente', 'Tipo Proveedor', 'Parte Relacionada',
        'Comprobante', 'Establecimiento', 'Punto Emision', 'Numero Secuencial', 'Numero Autorizacion S.R.I.',
        'Fecha de Emision', 'Fecha de Registro', 'Codigo Sustento', 'Base Imponible NO Objeto de IVA',
        'Base Imponible EXENTA', 'Base Imponible Tarifa 0%', 'Base Imp. Gravable IVA', 'Tarifa de IVA aplicada',
        'Monto de I.V.A.', 'Total del Documento',
      ]
      const rowsC = comprasPeriodo.map((c) => {
        const pv = c.proveedor_id ? proveedorMap.get(c.proveedor_id) : null
        const partes = (c.numero || '001-001-000001').split('-')
        return [
          pv?.ruc || '', 'R-Ruc', pv?.nombre || '', pv?.tipo || '01-Sociedad', 'NO', c.tipo_comprobante || '01-Factura',
          partes[0] || '001', partes[1] || '001', partes[2] || '000001', c.autorizacion || '', c.fecha,
          c.fecha_registro || c.fecha, c.sustento || '', 0, 0, c.base0 || 0, c.baseiva || 0, empresa?.iva_porcentaje ?? 15, c.iva || 0, c.total || 0,
        ]
      })
      const wsC = XLSX.utils.aoa_to_sheet([hdrC, ...rowsC])
      wsC['!cols'] = hdrC.map(() => ({ wch: 20 }))
      XLSX.utils.book_append_sheet(wb, wsC, 'COMPRAS')

      const hdrR = [
        'No. Retencion', 'No. Identificacion Proveedor', 'Razon Social', 'Fecha Retencion', 'Base IVA', '% Ret. IVA',
        'Valor Ret. IVA', 'Base Renta', '% Ret. Fuente', 'Valor Ret. Fuente', 'Total Retenido', 'Factura Referencia', 'No. Autorizacion',
      ]
      const rowsR = retencionesPeriodo.map((r) => {
        const pv = r.proveedor_id ? proveedorMap.get(r.proveedor_id) : null
        return [
          r.numero, pv?.ruc || '', pv?.nombre || '', r.fecha, r.base_iva || 0, r.pct_iva || 0, r.ret_iva || 0,
          r.base_renta || 0, r.pct_renta || 0, r.ret_renta || 0, r.total_retenido || 0, r.factura_ref || '', r.autorizacion || '',
        ]
      })
      const wsR = XLSX.utils.aoa_to_sheet([hdrR, ...rowsR])
      wsR['!cols'] = hdrR.map(() => ({ wch: 18 }))
      XLSX.utils.book_append_sheet(wb, wsR, 'RETENCIONES')

      const wsLiq = XLSX.utils.aoa_to_sheet([
        [`${empresa?.ruc || ''} - ${empresa?.nombre || ''}`],
        ['', 'DETALLE DE VENTAS', '', '', '', '', 'DETALLE DE COMPRAS'],
        ['Período', `${MESES[mes - 1]} ${anio}`, '', '', '', '', ''],
        ['Total Ventas', totales.ventas, '', '', 'Total Compras', totales.compras, ''],
        ['IVA en Ventas', totales.ivaVentas, '', '', 'IVA en Compras', totales.ivaCompras, ''],
        ['IVA Causado', Math.max(0, totales.ivaVentas - totales.ivaCompras), '', '', 'Crédito Tributario', Math.max(0, totales.ivaCompras - totales.ivaVentas), ''],
        ['', '', '', '', '', '', ''],
        ['Total Retenciones Emitidas', totales.retenciones, '', '', '', '', ''],
        ['', '', '', '', '', '', ''],
        ['Tarifa de IVA vigente usada en este periodo', `${empresa?.iva_porcentaje ?? 15}%`, '', '', '', '', ''],
      ])
      XLSX.utils.book_append_sheet(wb, wsLiq, 'LIQ_IMPUESTOS')

      XLSX.writeFile(wb, `ATS_${empresa?.nombre?.split(' ')[0] || 'empresa'}_${MESES[mes - 1]}_${anio}.xlsx`)
    } catch (e) {
      setError(`No se pudo exportar: ${(e as Error).message}`)
    } finally {
      setExportando(false)
    }
  }

  if (!empresaId) return <EstadoVacio icono="📊" titulo="Sin empresa asignada" descripcion="Tu usuario no tiene una empresa asignada todavía." />

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-white mb-1">Generador ATS</h1>
      <p className="text-xs text-white/40 mb-4">Anexo Transaccional Simplificado — Ventas + Compras + Retenciones, compatible con la plantilla del SRI Ecuador.</p>

      <div className="rounded-2xl border border-white/10 p-4 mb-4 flex items-center gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-white/50 mb-1">Mes</label>
          <select value={mes} onChange={(e) => setMes(parseInt(e.target.value))} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
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
        <button onClick={exportarATS} disabled={exportando || loading} className="ml-auto rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-4 py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60 self-end">
          {exportando ? 'Exportando…' : '📥 Exportar ATS (.xlsx)'}
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}
      {comprasSinSustento.length > 0 && !error && (
        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
          ⚠️ {comprasSinSustento.length} compra(s) de este periodo no tienen "Código de Sustento Tributario" (obligatorio para el SRI) — complétalas en Compras antes de exportar.
        </p>
      )}
      {loading && <TablaSkeleton />}

      {!loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="rounded-2xl border border-white/10 p-4">
              <p className="text-[11px] text-white/40">Ventas del período</p>
              <p className="text-xl font-semibold text-white font-mono">{fmt(totales.ventas)}</p>
              <p className="text-[11px] text-white/30 mt-1">{facturasPeriodo.length} facturas</p>
            </div>
            <div className="rounded-2xl border border-white/10 p-4">
              <p className="text-[11px] text-white/40">Compras del período</p>
              <p className="text-xl font-semibold text-white font-mono">{fmt(totales.compras)}</p>
              <p className="text-[11px] text-white/30 mt-1">{comprasPeriodo.length} comprobantes</p>
            </div>
            <div className="rounded-2xl border border-white/10 p-4">
              <p className="text-[11px] text-white/40">Retenciones emitidas</p>
              <p className="text-xl font-semibold text-amber-400 font-mono">{fmt(totales.retenciones)}</p>
              <p className="text-[11px] text-white/30 mt-1">{retencionesPeriodo.length} comprobantes</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-white/10 text-xs font-medium text-white/60">
              📄 Ventas — {MESES[mes - 1]} {anio}
            </div>
            {facturasPeriodo.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-white/30">Sin ventas en este período.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">No. Identificación</th>
                    <th className="px-4 py-2 font-medium">Razón Social</th>
                    <th className="px-4 py-2 font-medium">Comprobante</th>
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium text-right">Base 0%</th>
                    <th className="px-4 py-2 font-medium text-right">Base gravada</th>
                    <th className="px-4 py-2 font-medium text-right">IVA</th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {facturasPeriodo.map((f) => {
                    const cl = f.cliente_id ? clienteMap.get(f.cliente_id) : null
                    return (
                      <tr key={f.id} className="border-t border-white/5">
                        <td className="px-4 py-2.5 text-white/50 font-mono text-xs">{cl?.ruc || '9999999999999'}</td>
                        <td className="px-4 py-2.5 text-white text-xs">{cl?.nombre || 'Consumidor Final'}</td>
                        <td className="px-4 py-2.5 text-blue-300 font-mono text-xs">{f.numero}</td>
                        <td className="px-4 py-2.5 text-white/50 text-xs">{f.fecha}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-white/50">{fmt(f.subtotal_0 || 0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-white/70">{fmt((f.subtotal_12 || 0) + (f.subtotal_15 ?? f.subtotal))}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-white/70">{fmt(f.iva)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-medium text-white">{fmt(f.total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-white/10 text-xs font-medium text-white/60">
              🛒 Compras — {MESES[mes - 1]} {anio}
            </div>
            {comprasPeriodo.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-white/30">Sin compras en este período.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">No. Identificación</th>
                    <th className="px-4 py-2 font-medium">Proveedor</th>
                    <th className="px-4 py-2 font-medium">Comprobante</th>
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium">Sustento</th>
                    <th className="px-4 py-2 font-medium text-right">Base IVA</th>
                    <th className="px-4 py-2 font-medium text-right">IVA</th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {comprasPeriodo.map((c) => {
                    const pv = c.proveedor_id ? proveedorMap.get(c.proveedor_id) : null
                    return (
                      <tr key={c.id} className="border-t border-white/5">
                        <td className="px-4 py-2.5 text-white/50 font-mono text-xs">{pv?.ruc || '—'}</td>
                        <td className="px-4 py-2.5 text-white text-xs">{pv?.nombre || '—'}</td>
                        <td className="px-4 py-2.5 text-blue-300 font-mono text-xs">{c.numero}</td>
                        <td className="px-4 py-2.5 text-white/50 text-xs">{c.fecha}</td>
                        <td className="px-4 py-2.5 text-xs">
                          {c.sustento ? <span className="text-white/50">{c.sustento}</span> : <span className="text-amber-400">⚠ falta</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-white/70">{fmt(c.baseiva || 0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-white/70">{fmt(c.iva || 0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-medium text-white">{fmt(c.total || 0)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 text-xs font-medium text-white/60">
              📑 Retenciones emitidas — {MESES[mes - 1]} {anio}
            </div>
            {retencionesPeriodo.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-white/30">Sin retenciones en este período.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">No. Retención</th>
                    <th className="px-4 py-2 font-medium">Proveedor</th>
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium text-right">Ret. IVA</th>
                    <th className="px-4 py-2 font-medium text-right">Ret. Fuente</th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                    <th className="px-4 py-2 font-medium">Factura Ref.</th>
                  </tr>
                </thead>
                <tbody>
                  {retencionesPeriodo.map((r) => {
                    const pv = r.proveedor_id ? proveedorMap.get(r.proveedor_id) : null
                    return (
                      <tr key={r.id} className="border-t border-white/5">
                        <td className="px-4 py-2.5 text-blue-300 font-mono text-xs">{r.numero}</td>
                        <td className="px-4 py-2.5 text-white text-xs">{pv?.nombre || '—'}</td>
                        <td className="px-4 py-2.5 text-white/50 text-xs">{r.fecha}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-amber-300">{fmt(r.ret_iva || 0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-amber-300">{fmt(r.ret_renta || 0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-medium text-white">{fmt(r.total_retenido || 0)}</td>
                        <td className="px-4 py-2.5 text-white/40 font-mono text-xs">{r.factura_ref || '—'}</td>
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
