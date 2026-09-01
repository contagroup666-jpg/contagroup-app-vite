interface Props {
  icono: string
  titulo: string
  descripcion?: string
  accion?: { label: string; onClick: () => void }
}

/** Estado vacío como invitación a actuar, no como callejón sin salida. */
export default function EstadoVacio({ icono, titulo, descripcion, accion }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 py-12 px-6 flex flex-col items-center text-center">
      <span className="text-2xl mb-2 opacity-70" aria-hidden>{icono}</span>
      <p className="text-sm text-white/70 font-medium">{titulo}</p>
      {descripcion && <p className="text-xs text-white/40 mt-1 max-w-xs">{descripcion}</p>}
      {accion && (
        <button
          onClick={accion.onClick}
          className="mt-4 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-3.5 py-2 hover:bg-[var(--color-blue-6)] transition-colors"
        >
          {accion.label}
        </button>
      )}
    </div>
  )
}
