interface Props {
  filas?: number
  columnas?: number
}

/** Skeleton de tabla — reemplaza el "Cargando…" de texto plano en todos los módulos. */
export default function TablaSkeleton({ filas = 5, columnas = 4 }: Props) {
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden animate-pulse">
      <div className="bg-white/5 px-3 py-2.5 flex gap-4">
        {Array.from({ length: columnas }).map((_, i) => (
          <div key={i} className="h-2.5 rounded bg-white/10" style={{ width: `${60 + (i % 3) * 20}px` }} />
        ))}
      </div>
      {Array.from({ length: filas }).map((_, f) => (
        <div key={f} className="px-3 py-3 flex gap-4 border-t border-white/5">
          {Array.from({ length: columnas }).map((_, c) => (
            <div
              key={c}
              className="h-2.5 rounded bg-white/[0.06]"
              style={{ width: `${40 + ((f + c) % 4) * 30}px` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
