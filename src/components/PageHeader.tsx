import type { ReactNode } from 'react'

interface PageHeaderProps {
  titulo: string
  meta?: string
  acciones?: ReactNode
}

/** Encabezado de módulo consistente: título en Fraunces (como el dashboard), meta debajo, acciones a la derecha. */
export default function PageHeader({ titulo, meta, acciones }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
      <div>
        <h2 className="text-xl font-semibold text-white font-display-serif">{titulo}</h2>
        {meta && <p className="text-xs text-white/40 mt-0.5">{meta}</p>}
      </div>
      {acciones && <div className="flex items-center gap-2">{acciones}</div>}
    </div>
  )
}
