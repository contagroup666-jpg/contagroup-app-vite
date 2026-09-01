import type { ReactNode } from 'react'

interface Props {
  titulo: string
  valor: string
  subtitulo?: string
  icono: ReactNode
  iconoColor?: 'blue' | 'gold' | 'green' | 'red'
  tendencia?: { texto: string; tipo: 'up' | 'down' | 'neutral' }
}

const colorIcono: Record<NonNullable<Props['iconoColor']>, string> = {
  blue: 'bg-[var(--color-blue-5)]/15 text-[var(--color-blue-4)]',
  gold: 'bg-[var(--color-gold)]/15 text-[var(--color-gold)]',
  green: 'bg-emerald-500/15 text-emerald-400',
  red: 'bg-red-500/15 text-red-400',
}

const colorTendencia: Record<'up' | 'down' | 'neutral', string> = {
  up: 'text-emerald-400 bg-emerald-500/10',
  down: 'text-red-400 bg-red-500/10',
  neutral: 'text-white/50 bg-white/5',
}

/** Tarjeta de indicador — mismo lenguaje visual en todo el panel de Super Administrador. */
export default function KpiCard({ titulo, valor, subtitulo, icono, iconoColor = 'blue', tendencia }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--color-bg-1)] p-5 relative overflow-hidden">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-white/50 uppercase tracking-wide">{titulo}</p>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${colorIcono[iconoColor]}`}>
          {icono}
        </span>
      </div>
      <p className="text-3xl font-bold text-white mt-3 font-mono tabular-nums">{valor}</p>
      {subtitulo && <p className="text-xs text-white/40 mt-1.5">{subtitulo}</p>}
      {tendencia && (
        <span
          className={`inline-block mt-2.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${colorTendencia[tendencia.tipo]}`}
        >
          {tendencia.texto}
        </span>
      )}
    </div>
  )
}
