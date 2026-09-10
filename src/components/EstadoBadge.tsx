type Tono = 'exito' | 'alerta' | 'peligro' | 'neutral' | 'info'

const TONOS: Record<Tono, string> = {
  exito: 'var(--color-emerald-400)',
  alerta: 'var(--color-amber-400)',
  peligro: 'var(--color-red-400)',
  neutral: 'rgba(255,255,255,0.35)',
  info: 'var(--color-blue-300)',
}

interface EstadoBadgeProps {
  texto: string
  tono: Tono
}

/**
 * Indicador de estado como un punto de color + texto — más cerca de un sello
 * de auditoría que de la píldora de color sólido típica de un badge de SaaS.
 * Úsalo para Vencido/Pagado/Pendiente/etc. en vez de fondos de color planos.
 */
export default function EstadoBadge({ texto, tono }: EstadoBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-white/70">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TONOS[tono] }} />
      {texto}
    </span>
  )
}
