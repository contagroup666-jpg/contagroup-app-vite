import { useState } from 'react'

const POR_PAGINA_DEFAULT = 25

/**
 * Paginación real (server-side, vía .range() de Supabase) — no un simple
 * "traer todo y cortar en el cliente". El total viene de un `count: 'exact'`
 * en la misma consulta paginada (Supabase lo calcula en un solo viaje).
 *
 * Uso típico:
 *   const pag = usePaginacion()
 *   const { data, count } = await supabase.from('facturas').select('*', { count: 'exact' })
 *     .range(...pag.rango)
 *   pag.setTotalFilas(count ?? 0)
 */
export function usePaginacion(porPagina = POR_PAGINA_DEFAULT) {
  const [pagina, setPagina] = useState(1) // 1-indexado, más natural para mostrar en UI
  const [totalFilas, setTotalFilas] = useState(0)

  const totalPaginas = Math.max(1, Math.ceil(totalFilas / porPagina))
  const desde = (pagina - 1) * porPagina
  const hasta = desde + porPagina - 1

  function irAPagina(n: number) {
    setPagina(Math.min(Math.max(1, n), totalPaginas))
  }

  /** Llamar tras cambiar cualquier filtro/búsqueda, para no quedar en una página vacía. */
  function reiniciar() {
    setPagina(1)
  }

  return {
    pagina,
    porPagina,
    totalFilas,
    totalPaginas,
    rango: [desde, hasta] as [number, number],
    setTotalFilas,
    irAPagina,
    siguiente: () => irAPagina(pagina + 1),
    anterior: () => irAPagina(pagina - 1),
    reiniciar,
    hayAnterior: pagina > 1,
    haySiguiente: pagina < totalPaginas,
  }
}
