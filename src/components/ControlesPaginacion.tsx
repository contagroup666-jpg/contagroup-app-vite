interface Props {
  pagina: number
  totalPaginas: number
  totalFilas: number
  porPagina: number
  hayAnterior: boolean
  haySiguiente: boolean
  onAnterior: () => void
  onSiguiente: () => void
}

/** Controles de paginación — "Mostrando X–Y de Z" + anterior/siguiente. */
export default function ControlesPaginacion({ pagina, totalPaginas, totalFilas, porPagina, hayAnterior, haySiguiente, onAnterior, onSiguiente }: Props) {
  if (totalFilas === 0) return null
  const desde = (pagina - 1) * porPagina + 1
  const hasta = Math.min(pagina * porPagina, totalFilas)

  return (
    <div className="flex items-center justify-between px-1 py-3 text-xs">
      <p className="text-white/40">
        Mostrando <span className="text-white/70">{desde}–{hasta}</span> de <span className="text-white/70">{totalFilas}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={onAnterior}
          disabled={!hayAnterior}
          className="rounded-lg border border-white/10 text-white/60 px-2.5 py-1.5 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Anterior
        </button>
        <span className="text-white/30 px-1">
          Página {pagina} de {totalPaginas}
        </span>
        <button
          onClick={onSiguiente}
          disabled={!haySiguiente}
          className="rounded-lg border border-white/10 text-white/60 px-2.5 py-1.5 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Siguiente →
        </button>
      </div>
    </div>
  )
}
