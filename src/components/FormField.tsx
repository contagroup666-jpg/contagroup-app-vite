import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'

interface CampoBaseProps {
  etiqueta: string
  obligatorio?: boolean
  error?: string
}

type InputProps = CampoBaseProps & InputHTMLAttributes<HTMLInputElement>

/** Input de texto/número/email/etc. con label y estado de error consistentes. */
export function CampoTexto({ etiqueta, obligatorio, error, className, ...props }: InputProps) {
  return (
    <label className="block">
      <span className="block text-[13px] text-white/55 mb-1">
        {etiqueta}
        {obligatorio && <span className="text-[var(--color-gold)] ml-0.5">*</span>}
      </span>
      <input
        {...props}
        className={`w-full rounded-lg bg-white/5 border px-3 py-2 text-sm text-white outline-none transition-colors ${
          error ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-[var(--color-blue-5)]'
        } ${className ?? ''}`}
      />
      {error && <span className="block text-[11px] text-red-400 mt-1">{error}</span>}
    </label>
  )
}

type SelectProps = CampoBaseProps & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }

/** Select con el mismo tratamiento visual que CampoTexto. */
export function CampoSelect({ etiqueta, obligatorio, error, className, children, ...props }: SelectProps) {
  return (
    <label className="block">
      <span className="block text-[13px] text-white/55 mb-1">
        {etiqueta}
        {obligatorio && <span className="text-[var(--color-gold)] ml-0.5">*</span>}
      </span>
      <select
        {...props}
        className={`w-full rounded-lg bg-white/5 border px-3 py-2 text-sm text-white outline-none transition-colors ${
          error ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-[var(--color-blue-5)]'
        } ${className ?? ''}`}
      >
        {children}
      </select>
      {error && <span className="block text-[11px] text-red-400 mt-1">{error}</span>}
    </label>
  )
}
