import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import EstadoVacio from '../../components/EstadoVacio'
import TablaSkeleton from '../../components/TablaSkeleton'
import { PLANES, type Plan } from '../../lib/planes'

// Autoservicio para el rol Contador General: puede crear sus propias
// empresas (cada una sembrada con plan de cuentas base) hasta el cupo que
// le asignó el Super Administrador — sin necesitar sus privilegios. Solo ve
// y opera las empresas que él mismo creó (vía accesos_multiempresa), nunca
// las de otros contadores ni el resto de la plataforma.
export default function MisEmpresasPage() {
  const { perfil, empresasAcceso, recargarEmpresasAcceso, cambiarEmpresaActiva } = useAuth()
  const navigate = useNavigate()
  const [cupo, setCupo] = useState<number | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)

  const [modalAbierto, setModalAbierto] = useState(false)
  const [form, setForm] = useState({ nombre: '', ruc: '', moneda: 'USD', regimen: 'General' })
  const [creando, setCreando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('usuarios').select('cupo_empresas, plan').eq('id', perfil?.id ?? '').maybeSingle()
    const fila = data as { cupo_empresas: number | null; plan: Plan | null } | null
    setCupo(fila?.cupo_empresas ?? null)
    setPlan(fila?.plan ?? null)
    await recargarEmpresasAcceso()
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function abrirModal() {
    setForm({ nombre: '', ruc: '', moneda: 'USD', regimen: 'General' })
    setErrorForm(null)
    setModalAbierto(true)
  }

  function irATrabajar(empresaId: string) {
    cambiarEmpresaActiva(empresaId)
    navigate('/')
  }

  async function confirmarCreacion(e: FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) return setErrorForm('Ingresa el nombre de la empresa.')
    setCreando(true)
    setErrorForm(null)
    const { data, error: err } = await supabase.rpc('crear_empresa_autoservicio', {
      p_nombre: form.nombre.trim(),
      p_ruc: form.ruc.trim() || null,
      p_moneda: form.moneda,
      p_regimen: form.regimen,
    })
    setCreando(false)
    if (err) return setErrorForm(err.message)
    setModalAbierto(false)
    await cargar()
    if (data) irATrabajar(data as string)
  }

  const usadas = empresasAcceso.length
  const disponibles = cupo !== null ? Math.max(0, cupo - usadas) : null

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-lg font-semibold text-white mb-1">Mis Empresas</h1>
      <p className="text-xs text-white/40 mb-4">Crea y atiende tus propias empresas dentro del cupo que te asignó el administrador — no ves las de otros contadores.</p>

      {loading ? (
        <TablaSkeleton />
      ) : (
        <>
          <div className="rounded-2xl border border-white/10 p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-6">
              <div>
                <p className="text-[11px] text-white/40">Cupo asignado{plan ? ` · Plan ${PLANES[plan].etiqueta}` : ''}</p>
                <p className="text-xl font-semibold text-white">{cupo ?? '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-white/40">Empresas creadas</p>
                <p className="text-xl font-semibold text-white">{usadas}</p>
              </div>
              <div>
                <p className="text-[11px] text-white/40">Disponibles</p>
                <p className="text-xl font-semibold" style={{ color: disponibles === 0 ? 'var(--color-red-400)' : 'var(--color-emerald-400)' }}>
                  {disponibles ?? '—'}
                </p>
              </div>
            </div>
            <button
              onClick={abrirModal}
              disabled={cupo === null || disponibles === 0}
              className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[var(--color-blue-6)] disabled:opacity-50"
            >
              + Crear empresa
            </button>
          </div>
          {cupo === null && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
              Todavía no tienes cupo de autoservicio asignado. Pide al administrador que te asigne uno desde el Panel Super Admin.
            </p>
          )}
          {disponibles === 0 && cupo !== null && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
              Alcanzaste tu límite de {cupo} empresa(s). Pide al administrador que te lo amplíe si necesitas más.
            </p>
          )}

          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 text-xs font-medium text-white/60">Tus empresas</div>
            {empresasAcceso.length === 0 ? (
              <EstadoVacio icono="🏢" titulo="Aún no has creado ninguna empresa" descripcion="Usa el botón «Crear empresa» para comenzar." />
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {empresasAcceso.map((e) => (
                    <tr key={e.empresa_id} className="border-t border-white/5">
                      <td className="px-4 py-2.5 text-white text-xs font-medium">{e.nombre}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => irATrabajar(e.empresa_id)}
                          className="rounded-lg bg-[var(--color-blue-5)] text-white text-[11px] font-semibold px-3 py-1.5 hover:bg-[var(--color-blue-6)]"
                        >
                          Trabajar en esta empresa →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {modalAbierto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setModalAbierto(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">🏢 Crear nueva empresa</h3>
            <form onSubmit={confirmarCreacion} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Nombre de la empresa *</label>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">RUC</label>
                <input
                  value={form.ruc}
                  onChange={(e) => setForm({ ...form, ruc: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Moneda</label>
                  <select
                    value={form.moneda}
                    onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  >
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Régimen</label>
                  <select
                    value={form.regimen}
                    onChange={(e) => setForm({ ...form, regimen: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  >
                    <option value="General">General</option>
                    <option value="RIMPE">RIMPE</option>
                  </select>
                </div>
              </div>
              {errorForm && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorForm}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModalAbierto(false)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">
                  Cancelar
                </button>
                <button type="submit" disabled={creando} className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">
                  {creando ? 'Creando…' : '💾 Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
