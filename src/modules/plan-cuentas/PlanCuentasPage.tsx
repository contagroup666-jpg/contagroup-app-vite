import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database'
import TablaSkeleton from '../../components/TablaSkeleton'
import EstadoVacio from '../../components/EstadoVacio'

type Cuenta = Database['public']['Tables']['plan_cuentas']['Row']

export default function PlanCuentasPage() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    let activo = true
    setLoading(true)
    // No filtramos por empresa_id a mano: RLS ya solo devuelve las cuentas
    // de las empresas a las que este usuario tiene acceso.
    supabase
      .from('plan_cuentas')
      .select('*')
      .order('codigo', { ascending: true })
      .then(({ data, error: err }) => {
        if (!activo) return
        if (err) {
          setError(err.message)
        } else {
          setCuentas((data ?? []) as unknown as Cuenta[])
        }
        setLoading(false)
      })
    return () => {
      activo = false
    }
  }, [])

  const filtradas = cuentas.filter(
    (c) =>
      c.codigo.toLowerCase().includes(filtro.toLowerCase()) ||
      c.nombre.toLowerCase().includes(filtro.toLowerCase())
  )

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-white">Plan de cuentas</h2>
          <p className="text-xs text-white/40 mt-0.5">
            {cuentas.length} cuenta{cuentas.length === 1 ? '' : 's'} en la empresa activa
          </p>
        </div>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar código o nombre…"
          className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-white outline-none focus:border-[var(--color-blue-5)] w-56"
        />
      </div>

      {loading && <TablaSkeleton columnas={4} />}

      {error && (
        <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          No se pudo cargar el plan de cuentas: {error}
        </p>
      )}

      {!loading && !error && filtradas.length === 0 && (
        <EstadoVacio
          icono="📒"
          titulo={cuentas.length === 0 ? 'Sin cuentas registradas' : 'Sin resultados'}
          descripcion={cuentas.length === 0 ? 'Esta empresa aún no tiene un plan de cuentas cargado.' : 'Nada coincide con esa búsqueda.'}
        />
      )}

      {!loading && !error && filtradas.length > 0 && (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => (
                <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-2 text-white/70 font-mono text-xs">{c.codigo}</td>
                  <td className={`px-3 py-2 text-white ${c.es_detalle ? '' : 'font-semibold'}`}>
                    {c.nombre}
                  </td>
                  <td className="px-3 py-2 text-white/50 text-xs">{c.tipo}</td>
                  <td className="px-3 py-2 text-right text-white/80 font-mono text-xs">
                    {c.saldo.toLocaleString('es-EC', { style: 'currency', currency: 'USD' })}
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
