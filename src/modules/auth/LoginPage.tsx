import { useState, type FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { PLANES } from '../../lib/planes'

const CARACTERISTICAS_COMUNES = [
  'Contabilidad completa con libro diario y plan de cuentas',
  'Facturación, POS y control de inventario',
  'Nómina, décimos y depreciación de activos fijos',
]

const CARACTERISTICA_AUXILIAR = 'Un Contador Auxiliar incluido para repartir el trabajo'

const WHATSAPP_CONTACTO = '593960210788'

export default function LoginPage() {
  const { signIn, signInDemo, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviandoDemo, setEnviandoDemo] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    await signIn(email, password)
    setEnviando(false)
  }

  async function handleDemo() {
    setEnviandoDemo(true)
    await signInDemo()
    setEnviandoDemo(false)
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-0)] px-4 py-10 flex flex-col items-center">
      <div className="w-full max-w-sm">
        <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="text-lg font-semibold tracking-wide text-white">ContaGroup</h1>
            <p className="text-xs text-white/40 mt-1">Sistema contable multiempresa</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="email" className="block text-xs text-white/50 mb-1">Correo</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--color-blue-5)] transition-colors"
                placeholder="tu@empresa.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs text-white/50 mb-1">Contraseña</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--color-blue-5)] transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="w-full rounded-lg bg-gradient-to-r from-[var(--color-blue-6)] to-[var(--color-blue-5)] text-white text-sm font-semibold py-2.5 shadow-lg shadow-blue-900/40 transition-transform hover:-translate-y-px disabled:opacity-60 disabled:translate-y-0"
            >
              {enviando ? 'Ingresando…' : 'Ingresar al sistema'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] uppercase tracking-wider text-white/30">o</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <button
            type="button"
            onClick={handleDemo}
            disabled={enviandoDemo}
            className="w-full rounded-lg bg-white/5 border border-[var(--color-gold-soft)] text-white text-[13px] font-semibold py-3 flex items-center justify-center gap-2 transition-colors hover:bg-[var(--color-gold)]/10 disabled:opacity-60"
          >
            {enviandoDemo ? 'Entrando al demo…' : '🚀 Ingresar como Demo (Admin Empresa)'}
          </button>
          <p className="text-[10.5px] text-white/30 text-center mt-2">
            Explora el sistema con una empresa de ejemplo, sin registrarte
          </p>
        </div>
      </div>

      {/* Vitrina de planes para Contador General — informativa, no hay auto-registro:
          las cuentas las crea el administrador del sistema. */}
      <div className="w-full max-w-3xl mt-10">
        <div className="text-center mb-5">
          <p className="text-[11px] font-medium tracking-wide text-[var(--color-gold)]">Para contadores independientes</p>
          <h2 className="text-xl font-semibold text-white mt-1" style={{ fontFamily: 'var(--font-serif, inherit)' }}>
            Un plan para cada volumen de clientes
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {(Object.keys(PLANES) as (keyof typeof PLANES)[]).map((clave) => {
            const p = PLANES[clave]
            const destacado = clave === 'basico'
            return (
              <div
                key={clave}
                className={`rounded-2xl border p-6 flex flex-col ${
                  destacado
                    ? 'border-[var(--color-gold)]/50 bg-gradient-to-b from-[var(--color-gold)]/[0.06] to-transparent'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <h3 className="text-base font-semibold text-white">{p.etiqueta}</h3>
                  {destacado && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--color-gold)]/15 text-[var(--color-gold)]">
                      Más cupo
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/50 mb-4">
                  Hasta <span className="text-white font-medium">{p.cupo} empresas</span> bajo tu gestión
                </p>
                <ul className="space-y-2 flex-1">
                  {CARACTERISTICAS_COMUNES.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-xs text-white/60">
                      <span className="text-[var(--color-emerald-400)] mt-0.5">✓</span>
                      {c}
                    </li>
                  ))}
                  {clave === 'basico' && (
                    <li className="flex items-start gap-2 text-xs text-white/60">
                      <span className="text-[var(--color-emerald-400)] mt-0.5">✓</span>
                      {CARACTERISTICA_AUXILIAR}
                    </li>
                  )}
                </ul>
              </div>
            )
          })}
        </div>
        <p className="text-[11px] text-white/30 text-center mt-5">
          Las cuentas se activan a través del administrador del sistema — inicia sesión arriba si ya tienes acceso.
        </p>
        <p className="text-[11px] text-white/40 text-center mt-2">
          ¿Dudas? Escríbenos por{' '}
          <a
            href={`https://wa.me/${WHATSAPP_CONTACTO}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-emerald-400)] font-medium hover:underline"
          >
            WhatsApp: +593 96 021 0788
          </a>
        </p>
      </div>
    </div>
  )
}
