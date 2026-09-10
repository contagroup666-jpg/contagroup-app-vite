import { useEffect, type ReactNode } from 'react'

interface DrawerProps {
  abierto: boolean
  onClose: () => void
  titulo: string
  children: ReactNode
}

/**
 * Cajón lateral para formularios. Se desliza desde el borde derecho —como
 * sacar una hoja del libro— en vez del modal centrado con backdrop que usa
 * el 90% de las apps SaaS. No tapa toda la pantalla, y el movimiento lateral
 * refuerza la metáfora de "hoja de libro mayor" del resto del sistema.
 */
export default function Drawer({ abierto, onClose, titulo, children }: DrawerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (abierto) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [abierto, onClose])

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative h-full w-full max-w-sm bg-[var(--color-bg-1)] border-l border-white/10 shadow-2xl flex flex-col"
        style={{ animation: 'drawer-in 0.18s ease-out' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h3 className="text-[15px] font-semibold text-white font-display-serif">{titulo}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-white/40 hover:text-white text-xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/5 transition-colors"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  )
}
