import type { ThHTMLAttributes } from 'react'

/**
 * Encabezado de tabla con el tratamiento "libro mayor": peso medio en vez de
 * mayúsculas trackeadas (el tell típico de una tabla SaaS genérica), con una
 * línea dorada fina debajo, como el renglón de un libro contable real.
 */
export default function Th({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={`px-3 py-2.5 text-left text-[13px] font-medium text-white/70 border-b border-[var(--color-gold)]/25 ${className ?? ''}`}
    >
      {children}
    </th>
  )
}
