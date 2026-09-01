import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Database, EtapaLead } from '../../types/database'
import EstadoVacio from '../../components/EstadoVacio'

type Lead = Database['public']['Tables']['leads']['Row']
type Actividad = Database['public']['Tables']['actividades']['Row']

const ETAPAS: EtapaLead[] = ['Prospecto', 'Contactado', 'Propuesta', 'Negociación', 'Cerrado']
const TIPOS_ACTIVIDAD = ['Llamada', 'Reunión', 'Email', 'Demo', 'Propuesta', 'Seguimiento']

const LEAD_VACIO = { nombre: '', contacto: '', valor: '', etapa: 'Prospecto' as EtapaLead, email: '', fecha_cierre: '', notas: '' }
const ACT_VACIA = { tipo: TIPOS_ACTIVIDAD[0], fecha: new Date().toISOString().slice(0, 10), descripcion: '', lead_id: '' }

function fmt(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n || 0)
}

export default function CrmPage() {
  const { perfil } = useAuth()
  const [tab, setTab] = useState<'pipeline' | 'actividades'>('pipeline')

  const [leads, setLeads] = useState<Lead[]>([])
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editando, setEditando] = useState<Lead | null>(null)
  const [formLead, setFormLead] = useState(LEAD_VACIO)
  const [mostrarFormLead, setMostrarFormLead] = useState(false)
  const [guardandoLead, setGuardandoLead] = useState(false)
  const [errorLead, setErrorLead] = useState<string | null>(null)

  const [mostrarFormAct, setMostrarFormAct] = useState(false)
  const [formAct, setFormAct] = useState(ACT_VACIA)
  const [guardandoAct, setGuardandoAct] = useState(false)
  const [errorAct, setErrorAct] = useState<string | null>(null)

  async function cargar() {
    setLoading(true)
    const [leadsRes, actsRes] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('actividades').select('*').order('fecha', { ascending: false }),
    ])
    if (leadsRes.error) setError(leadsRes.error.message)
    else if (actsRes.error) setError(actsRes.error.message)
    else {
      setLeads((leadsRes.data ?? []) as unknown as Lead[])
      setActividades((actsRes.data ?? []) as unknown as Actividad[])
      setError(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const totalPipeline = leads.reduce((s, l) => s + (l.valor || 0), 0)
  const nombreLead = (id: string | null) => leads.find((l) => l.id === id)?.nombre ?? '—'

  function abrirNuevoLead(etapa?: EtapaLead) {
    setEditando(null)
    setFormLead({ ...LEAD_VACIO, etapa: etapa ?? 'Prospecto' })
    setErrorLead(null)
    setMostrarFormLead(true)
  }

  function abrirEditarLead(l: Lead) {
    setEditando(l)
    setFormLead({
      nombre: l.nombre,
      contacto: l.contacto ?? '',
      valor: String(l.valor ?? ''),
      etapa: l.etapa,
      email: l.email ?? '',
      fecha_cierre: l.fecha_cierre ?? '',
      notas: l.notas ?? '',
    })
    setErrorLead(null)
    setMostrarFormLead(true)
  }

  async function handleSubmitLead(e: FormEvent) {
    e.preventDefault()
    if (!formLead.nombre.trim()) {
      setErrorLead('El nombre es obligatorio.')
      return
    }
    if (!perfil?.empresa_id && !editando) {
      setErrorLead('Tu usuario no tiene una empresa activa asignada.')
      return
    }
    setGuardandoLead(true)
    setErrorLead(null)

    const payload = {
      nombre: formLead.nombre.trim(),
      contacto: formLead.contacto.trim() || null,
      valor: parseFloat(formLead.valor) || 0,
      etapa: formLead.etapa,
      email: formLead.email.trim() || null,
      fecha_cierre: formLead.fecha_cierre || null,
      notas: formLead.notas.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const resultado = editando
      ? await supabase.from('leads').update(payload).eq('id', editando.id)
      : await supabase.from('leads').insert({ ...payload, empresa_id: perfil?.empresa_id })

    if (resultado.error) {
      setErrorLead(resultado.error.message)
      setGuardandoLead(false)
      return
    }

    setGuardandoLead(false)
    setMostrarFormLead(false)
    await cargar()
  }

  async function handleSubmitActividad(e: FormEvent) {
    e.preventDefault()
    if (!formAct.descripcion.trim()) {
      setErrorAct('La descripción es obligatoria.')
      return
    }
    if (!perfil?.empresa_id) {
      setErrorAct('Tu usuario no tiene una empresa activa asignada.')
      return
    }
    setGuardandoAct(true)
    setErrorAct(null)

    const { error: err } = await supabase.from('actividades').insert({
      empresa_id: perfil.empresa_id,
      tipo: formAct.tipo,
      fecha: formAct.fecha,
      descripcion: formAct.descripcion.trim(),
      lead_id: formAct.lead_id || null,
      estado: 'Pendiente',
    })

    if (err) {
      setErrorAct(err.message)
      setGuardandoAct(false)
      return
    }

    setGuardandoAct(false)
    setMostrarFormAct(false)
    setFormAct(ACT_VACIA)
    await cargar()
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">CRM — Pipeline</h2>
          <p className="text-xs text-white/40 mt-0.5">Leads, oportunidades y actividades</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/clientes"
            className="rounded-lg border border-white/10 text-white/60 text-xs font-semibold px-3 py-1.5 hover:bg-white/5 transition-colors"
          >
            👥 Ver contactos (Clientes)
          </Link>
          <button
            onClick={() => setMostrarFormAct(true)}
            className="rounded-lg border border-white/10 text-white/60 text-xs font-semibold px-3 py-1.5 hover:bg-white/5 transition-colors"
          >
            + Actividad
          </button>
          <button
            onClick={() => abrirNuevoLead()}
            className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[var(--color-blue-6)] transition-colors"
          >
            + Lead
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-white/10">
        <button
          onClick={() => setTab('pipeline')}
          className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
            tab === 'pipeline' ? 'border-[var(--color-blue-5)] text-white' : 'border-transparent text-white/40 hover:text-white/70'
          }`}
        >
          🎯 Pipeline
        </button>
        <button
          onClick={() => setTab('actividades')}
          className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
            tab === 'actividades' ? 'border-[var(--color-blue-5)] text-white' : 'border-transparent text-white/40 hover:text-white/70'
          }`}
        >
          📅 Actividades
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
          No se pudo cargar la información: {error}
        </p>
      )}

      {!error && tab === 'pipeline' && (
        <>
          {loading && <p className="text-xs text-white/40">Cargando…</p>}
          {!loading && leads.length === 0 && (
            <EstadoVacio
              icono="🎯"
              titulo="Todavía no hay leads"
              descripcion="Registra el primero para empezar a llenar el pipeline."
              accion={{ label: '+ Lead', onClick: () => abrirNuevoLead() }}
            />
          )}
          {!loading && leads.length > 0 && (
            <>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {ETAPAS.map((etapa) => {
                  const cols = leads.filter((l) => l.etapa === etapa)
                  const total = cols.reduce((s, l) => s + (l.valor || 0), 0)
                  return (
                    <div key={etapa} className="min-w-[210px] max-w-[220px] flex-shrink-0 bg-white/5 rounded-xl p-2.5">
                      <div className="flex items-center justify-between mb-2 px-0.5">
                        <span className="text-[11px] font-semibold text-white/60 uppercase tracking-wide">{etapa}</span>
                        <span className="bg-white/10 text-white/60 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                          {cols.length}
                        </span>
                      </div>
                      {cols.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => abrirEditarLead(l)}
                          className="w-full text-left bg-[var(--color-bg-1)] border border-white/10 rounded-lg p-2.5 mb-1.5 hover:border-white/25 transition-colors"
                        >
                          <div className="text-xs font-medium text-white mb-0.5 truncate">{l.nombre}</div>
                          <div className="text-[11px] text-emerald-400 font-mono font-semibold">{fmt(l.valor)}</div>
                          <div className="text-[10px] text-white/40 mt-0.5 truncate">
                            {l.contacto || '—'} · {l.fecha_cierre || '—'}
                          </div>
                        </button>
                      ))}
                      <div className="text-[11px] text-white/40 border-t border-white/10 mt-1 pt-1.5 pb-1">
                        Total: <strong className="text-white/60">{fmt(total)}</strong>
                      </div>
                      <button
                        onClick={() => abrirNuevoLead(etapa)}
                        className="w-full border border-dashed border-white/15 rounded-lg py-1 text-[11px] text-white/40 hover:bg-white/5 hover:text-white/70 transition-colors"
                      >
                        + Agregar
                      </button>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-white/40 mt-4">
                Pipeline total: <strong className="text-white/70">{fmt(totalPipeline)}</strong>
              </p>
            </>
          )}
        </>
      )}

      {!error && tab === 'actividades' && (
        <>
          {loading && <p className="text-xs text-white/40">Cargando…</p>}
          {!loading && actividades.length === 0 && (
            <EstadoVacio
              icono="📅"
              titulo="Todavía no hay actividades"
              descripcion="Registra llamadas, reuniones o seguimientos con tus leads."
              accion={{ label: '+ Actividad', onClick: () => setMostrarFormAct(true) }}
            />
          )}
          {!loading && actividades.length > 0 && (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Descripción</th>
                    <th className="px-3 py-2 font-medium">Lead</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {actividades.map((a) => (
                    <tr key={a.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-3 py-2 text-white/70 text-xs">{a.fecha}</td>
                      <td className="px-3 py-2 text-white text-xs">{a.tipo}</td>
                      <td className="px-3 py-2 text-white/70 text-xs">{a.descripcion}</td>
                      <td className="px-3 py-2 text-white/50 text-xs">{nombreLead(a.lead_id)}</td>
                      <td className="px-3 py-2 text-white/50 text-xs">{a.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {mostrarFormLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setMostrarFormLead(false)}>
          <div
            className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-white mb-4">{editando ? 'Editar lead' : 'Nuevo lead'}</h3>
            <form onSubmit={handleSubmitLead} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Empresa / Nombre *</label>
                <input
                  autoFocus
                  value={formLead.nombre}
                  onChange={(e) => setFormLead({ ...formLead, nombre: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Contacto</label>
                  <input
                    value={formLead.contacto}
                    onChange={(e) => setFormLead({ ...formLead, contacto: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Valor estimado</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formLead.valor}
                    onChange={(e) => setFormLead({ ...formLead, valor: e.target.value })}
                    placeholder="0.00"
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Etapa</label>
                  <select
                    value={formLead.etapa}
                    onChange={(e) => setFormLead({ ...formLead, etapa: e.target.value as EtapaLead })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  >
                    {ETAPAS.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Fecha cierre</label>
                  <input
                    type="date"
                    value={formLead.fecha_cierre}
                    onChange={(e) => setFormLead({ ...formLead, fecha_cierre: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Email</label>
                <input
                  type="email"
                  value={formLead.email}
                  onChange={(e) => setFormLead({ ...formLead, email: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Notas</label>
                <textarea
                  value={formLead.notas}
                  onChange={(e) => setFormLead({ ...formLead, notas: e.target.value })}
                  placeholder="Observaciones…"
                  rows={2}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>

              {errorLead && (
                <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {errorLead}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setMostrarFormLead(false)}
                  className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoLead}
                  className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60"
                >
                  {guardandoLead ? 'Guardando…' : 'Guardar lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mostrarFormAct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setMostrarFormAct(false)}>
          <div
            className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-white mb-4">Nueva actividad</h3>
            <form onSubmit={handleSubmitActividad} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Tipo</label>
                  <select
                    value={formAct.tipo}
                    onChange={(e) => setFormAct({ ...formAct, tipo: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  >
                    {TIPOS_ACTIVIDAD.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={formAct.fecha}
                    onChange={(e) => setFormAct({ ...formAct, fecha: e.target.value })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Lead / Cliente</label>
                <select
                  value={formAct.lead_id}
                  onChange={(e) => setFormAct({ ...formAct, lead_id: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                >
                  <option value="">Seleccionar lead…</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Descripción *</label>
                <textarea
                  value={formAct.descripcion}
                  onChange={(e) => setFormAct({ ...formAct, descripcion: e.target.value })}
                  placeholder="Detalles…"
                  rows={2}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>

              {errorAct && (
                <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {errorAct}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setMostrarFormAct(false)}
                  className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoAct}
                  className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60"
                >
                  {guardandoAct ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
