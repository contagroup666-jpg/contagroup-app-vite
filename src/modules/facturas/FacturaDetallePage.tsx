import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database'

type Factura = Database['public']['Tables']['facturas']['Row']

export default function FacturaDetallePage() {
  const { id } = useParams<{ id: string }>()
  const [factura, setFactura] = useState<Factura | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let activo = true
    setLoading(true)
    supabase
      .from('facturas')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error: err }) => {
        if (!activo) return
        if (err) {
          // Si RLS bloquea el acceso (factura de otra empresa) o no existe, PostgREST devuelve
          // "no rows" — mostramos un mensaje genérico en vez de filtrar si es permiso o no-existe.
          setError('No se encontró la factura, o no tienes acceso a ella.')
        } else {
          setFactura(data as unknown as Factura)
        }
        setLoading(false)
      })
    return () => {
      activo = false
    }
  }, [id])

  if (loading) return <div className="p-6 text-sm text-white/40">Cargando…</div>

  if (error || !factura) {
    return (
      <div className="p-6">
        <Link to="/facturas" className="text-xs text-[var(--color-blue-5)] hover:underline">← Volver a facturas</Link>
        <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-3">
          {error}
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <Link to="/facturas" className="text-xs text-[var(--color-blue-5)] hover:underline">← Volver a facturas</Link>

      <div className="mt-3 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white font-mono">{factura.numero}</h2>
          <p className="text-sm text-white/50 mt-0.5">{factura.cliente_nombre || 'Consumidor final'}</p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white/70">{factura.estado}</span>
      </div>

      <dl className="grid grid-cols-3 gap-4 mt-5 text-sm">
        <div>
          <dt className="text-white/40 text-xs">Fecha</dt>
          <dd className="text-white/80">{factura.fecha}</dd>
        </div>
        <div>
          <dt className="text-white/40 text-xs">Forma de pago</dt>
          <dd className="text-white/80">{factura.forma_pago ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-white/40 text-xs">Origen</dt>
          <dd className="text-white/80">{factura.origen}</dd>
        </div>
      </dl>

      {factura.motivo_anulacion && (
        <p className="mt-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          Anulada: {factura.motivo_anulacion}
        </p>
      )}

      <div className="mt-6 rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 font-medium text-right">Cant.</th>
              <th className="px-3 py-2 font-medium text-right">Precio</th>
              <th className="px-3 py-2 font-medium text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {(factura.items ?? []).map((item, i) => (
              <tr key={item.producto_id ?? i} className="border-t border-white/5">
                <td className="px-3 py-2 text-white/80">{item.nombre}</td>
                <td className="px-3 py-2 text-right text-white/60 font-mono text-xs">{item.cantidad}</td>
                <td className="px-3 py-2 text-right text-white/60 font-mono text-xs">
                  {Number(item.precio).toLocaleString('es-EC', { style: 'currency', currency: 'USD' })}
                </td>
                <td className="px-3 py-2 text-right text-white/80 font-mono text-xs">
                  {(Number(item.precio) * Number(item.cantidad)).toLocaleString('es-EC', { style: 'currency', currency: 'USD' })}
                </td>
              </tr>
            ))}
            {(factura.items ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-white/40 text-xs">
                  Esta factura no tiene líneas de detalle registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between text-white/50">
          <span>Subtotal</span>
          <span className="font-mono">{Number(factura.subtotal).toLocaleString('es-EC', { style: 'currency', currency: 'USD' })}</span>
        </div>
        <div className="flex justify-between text-white/50">
          <span>IVA</span>
          <span className="font-mono">{Number(factura.iva).toLocaleString('es-EC', { style: 'currency', currency: 'USD' })}</span>
        </div>
        <div className="flex justify-between text-white font-semibold border-t border-white/10 pt-1">
          <span>Total</span>
          <span className="font-mono">{Number(factura.total).toLocaleString('es-EC', { style: 'currency', currency: 'USD' })}</span>
        </div>
      </div>
    </div>
  )
}
