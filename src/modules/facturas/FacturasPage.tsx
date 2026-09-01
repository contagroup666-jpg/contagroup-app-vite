import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database'
import TablaSkeleton from '../../components/TablaSkeleton'
import EstadoVacio from '../../components/EstadoVacio'

type Factura = Database['public']['Tables']['facturas']['Row']

const ESTADO_ESTILO: Record<string, string> = {
  Autorizada: 'bg-emerald-500/15 text-emerald-400',
  Anulada: 'bg-red-500/15 text-red-400',
  Pendiente: 'bg-amber-500/15 text-amber-400',
}

export default function FacturasPage() {
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<string>('Todas')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    let activo = true
    setLoading(true)
    // RLS filtra automáticamente por empresa(s) del usuario — no hace falta .eq('empresa_id', ...) aquí.
    supabase
      .from('facturas')
      .select('*')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (!activo) return
        if (err) setError(err.message)
        else setFacturas((data ?? []) as unknown as Factura[])
        setLoading(false)
      })
    return () => {
      activo = false
    }
  }, [])

  const estados = ['Todas', ...Array.from(new Set(facturas.map((f) => f.estado)))]

  const filtradas = facturas.filter((f) => {
    if (filtroEstado !== 'Todas' && f.estado !== filtroEstado) return false
    const q = busqueda.toLowerCase()
    if (!q) return true
    return f.numero.toLowerCase().includes(q) || (f.cliente_nombre ?? '').toLowerCase().includes(q)
  })

  const totalFiltrado = filtradas.reduce((acc, f) => acc + Number(f.total), 0)

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Facturas</h2>
          <p className="text-xs text-white/40 mt-0.5">
            {filtradas.length} factura{filtradas.length === 1 ? '' : 's'} · total{' '}
            {totalFiltrado.toLocaleString('es-EC', { style: 'currency', currency: 'USD' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-xs text-white outline-none focus:border-[var(--color-blue-5)]"
          >
            {estados.map((e) => (
              <option key={e} value={e} className="bg-[var(--color-bg-1)]">
                {e}
              </option>
            ))}
          </select>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar número o cliente…"
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-white outline-none focus:border-[var(--color-blue-5)] w-56"
          />
        </div>
      </div>

      {loading && <TablaSkeleton columnas={5} />}

      {error && (
        <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          No se pudieron cargar las facturas: {error}
        </p>
      )}

      {!loading && !error && filtradas.length === 0 && (
        <EstadoVacio
          icono="🧾"
          titulo={facturas.length === 0 ? 'Sin facturas todavía' : 'Sin resultados'}
          descripcion={facturas.length === 0 ? 'Cuando factures desde el sistema, aparecerán aquí.' : 'Nada coincide con ese filtro o búsqueda.'}
        />
      )}

      {!loading && !error && filtradas.length > 0 && (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                <th className="px-3 py-2 font-medium">Número</th>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((f) => (
                <tr key={f.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-2">
                    <Link to={`/facturas/${f.id}`} className="text-[var(--color-blue-5)] hover:underline font-mono text-xs">
                      {f.numero}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-white/60 text-xs">{f.fecha}</td>
                  <td className="px-3 py-2 text-white/80">{f.cliente_nombre || 'Consumidor final'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${ESTADO_ESTILO[f.estado] ?? 'bg-white/10 text-white/60'}`}>
                      {f.estado}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-white/80 font-mono text-xs">
                    {Number(f.total).toLocaleString('es-EC', { style: 'currency', currency: 'USD' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
