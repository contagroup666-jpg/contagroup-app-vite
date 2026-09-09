// Planes de suscripción para Contador General. El cupo real lo calcula y
// aplica el servidor (Edge Function admin-users) — esto es solo para mostrar
// etiquetas consistentes en el frontend, debe coincidir con PLANES_CUPO ahí.
export type Plan = 'free' | 'basico'

export const PLANES: Record<Plan, { etiqueta: string; cupo: number }> = {
  free: { etiqueta: 'Free', cupo: 2 },
  basico: { etiqueta: 'Básico', cupo: 6 },
}

export function etiquetaPlan(plan: Plan | null, cupoManual: number | null): string {
  if (plan && PLANES[plan]) return `${PLANES[plan].etiqueta} (${PLANES[plan].cupo})`
  if (cupoManual != null) return `Personalizado (${cupoManual})`
  return 'Sin cupo'
}
