import { useState, type FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'

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
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-0)] px-4">
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
    </div>
  )
}
