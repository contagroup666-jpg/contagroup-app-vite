import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database'
import TablaSkeleton from '../../components/TablaSkeleton'
import EstadoVacio from '../../components/EstadoVacio'
import ControlesPaginacion from '../../components/ControlesPaginacion'
import { usePaginacion } from '../../hooks/usePaginacion'

type Factura = Database['public']['Tables']['facturas']['Row']

const ESTADOS_CONOCIDOS = ['Autorizada', 'Anulada', 'Pendiente']

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
  const [busquedaDebounced, setBusquedaDebounced] = useState('')
  const [totalFiltrado, setTotalFiltrado] = useState(0)
  const pag = usePaginacion(25)

  // Debounce de búsqueda: evita disparar una consulta por cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 350)
    return () => clearTimeout(t)
  }, [busqueda])

  useEffect(() => {
    pag.reiniciar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, busquedaDebounced])

  useEffect(() => {
    let activo = true
    setLoading(true)

    function aplicarFiltros(q: any) {
      let query = q
      if (filtroEstado !== 'Todas') query = query.eq('estado', filtroEstado)
      if (busquedaDebounced.trim()) {
        const term = busquedaDebounced.trim().replace(/[%,]/g, '')
        query = query.or(`numero.ilike.%${term}%,cliente_nombre.ilike.%${term}%`)
      }
      return query
    }

    // RLS filtra automáticamente por empresa(s) del usuario — no hace falta .eq('empresa_id', ...) aquí.
    const consultaPagina = aplicarFiltros(
      supabase.from('facturas').select('*', { count: 'exact' }).order('fecha', { ascending: false }).order('created_at', { ascending: false })
    ).range(...pag.rango)

    // Consulta liviana aparte (solo la columna `total`) para el total agregado del filtro completo,
    // no solo de la página visible — traer todas las columnas de todas las filas sería justo lo que
    // la paginación busca evitar.
    const consultaTotal = aplicarFiltros(supabase.from('facturas').select('total'))

    Promise.all([consultaPagina, consultaTotal]).then(([pagRes, totalRes]) => {
      if (!activo) return
      if (pagRes.error) setError(pagRes.error.message)
      else {
        setError(null)
        setFacturas((pagRes.data ?? []) as unknown as Factura[])
        pag.setTotalFilas(pagRes.count ?? 0)
      }
      if (!totalRes.error) {
        setTotalFiltrado(((totalRes.data ?? []) as unknown as { total: number }[]).reduce((s, f) => s + Number(f.total), 0))
      }
      setLoading(false)
    })
    return () => {
      activo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, busquedaDebounced, pag.pagina])

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Facturas</h2>
          <p className="text-xs text-white/40 mt-0.5">
            {pag.totalFilas} factura{pag.totalFilas === 1 ? '' : 's'} · total{' '}
            {totalFiltrado.toLocaleString('es-EC', { style: 'currency', currency: 'USD' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-xs text-white outline-none focus:border-[var(--color-blue-5)]"
          >
            <option value="Todas" className="bg-[var(--color-bg-1)]">Todas</option>
            {ESTADOS_CONOCIDOS.map((e) => (
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

      {!loading && !error && facturas.length === 0 && (
        <EstadoVacio
          icono="🧾"
          titulo={pag.totalFilas === 0 && filtroEstado === 'Todas' && !busquedaDebounced ? 'Sin facturas todavía' : 'Sin resultados'}
          descripcion={pag.totalFilas === 0 && filtroEstado === 'Todas' && !busquedaDebounced ? 'Cuando factures desde el sistema, aparecerán aquí.' : 'Nada coincide con ese filtro o búsqueda.'}
        />
      )}

      {!loading && !error && facturas.length > 0 && (
        <>
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
                {facturas.map((f) => (
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
          <ControlesPaginacion
            pagina={pag.pagina}
            totalPaginas={pag.totalPaginas}
            totalFilas={pag.totalFilas}
            porPagina={pag.porPagina}
            hayAnterior={pag.hayAnterior}
            haySiguiente={pag.haySiguiente}
            onAnterior={pag.anterior}
            onSiguiente={pag.siguiente}
          />
        </>
      )}
    </div>
  )
}
