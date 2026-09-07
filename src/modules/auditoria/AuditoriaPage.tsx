import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'
import EstadoVacio from '../../components/EstadoVacio'
import TablaSkeleton from '../../components/TablaSkeleton'

type Registro = Database['public']['Tables']['auditoria']['Row']

type Tab = 'historial' | 'seguridad'

const NOMBRES_TABLA: Record<string, string> = {
  usuarios: 'Usuarios',
  facturas: 'Facturas',
  asientos: 'Asientos contables',
  compras: 'Compras',
  proveedores: 'Proveedores',
  sesion: 'Sesión',
  caja_chica: 'Caja Chica',
  caja_chica_movimientos: 'Movimientos Caja Chica',
  movimientos_caja: 'Movimientos de Tesorería',
  cuentas_bancarias: 'Cuentas Bancarias',
  conciliacion_movimientos: 'Conciliación Bancaria',
  cxc_cargos: 'Cargos CxC',
  cxc_abonos: 'Abonos CxC',
  retenciones: 'Retenciones',
  pos_devoluciones: 'Devoluciones POS',
  pos_turnos: 'Turnos POS',
  devoluciones: 'Devoluciones (legacy)',
  solicitudes: 'Solicitudes',
  cierres_fiscales: 'Cierres Fiscales',
  diagnosticos_contables: 'Diagnósticos Contables',
}
const NOMBRES_ACCION: Record<string, string> = { crear: '🟢 Creó', editar: '🟡 Editó', eliminar: '🔴 Eliminó', login: '🔵 Inició sesión' }
const CAMPOS_SENSIBLES = ['id', 'created_at', 'password', 'permisos_raw']

function resumen(a: Registro): string {
  if (a.tabla === 'sesion') return `${a.usuario_nombre} inició sesión`
  const datos = (a.valores_nuevos ?? a.valores_anteriores ?? {}) as Record<string, unknown>
  const etiqueta = (datos.nombre ?? datos.numero ?? datos.codigo ?? datos.email ?? (a.registro_id ? a.registro_id.slice(0, 8) : '—')) as string
  return `${NOMBRES_TABLA[a.tabla] || a.tabla}: ${etiqueta}`
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// Auditoría: historial de cambios (vía triggers reales de Postgres en cada
// tabla) + panel de seguridad (bloqueos por intentos fallidos, volumen de
// actividad reciente). Al migrar este módulo se encontró que varias tablas
// creadas en sesiones recientes de este mismo proyecto (movimientos_caja,
// cuentas_bancarias, conciliacion_movimientos, cxc_cargos, cxc_abonos,
// retenciones, pos_devoluciones, pos_turnos) NO tenían trigger de
// auditoría — quedaban fuera del historial pese a mover dinero real. Se
// agregaron los triggers faltantes (misma función genérica
// fn_registrar_auditoria ya usada en el resto del sistema) antes de
// construir esta pantalla, para que el historial sea completo de verdad.
export default function AuditoriaPage() {
  const { perfil } = useAuth()
  const empresaId = perfil?.empresa_id ?? null
  const esSuperAdmin = perfil?.rol === 'Super Administrador'

  const [tab, setTab] = useState<Tab>('historial')
  const [registros, setRegistros] = useState<Registro[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filtroTabla, setFiltroTabla] = useState('')
  const [filtroAccion, setFiltroAccion] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const [detalle, setDetalle] = useState<Registro | null>(null)

  const [bloqueos, setBloqueos] = useState<{ email: string; fallidos: number; ultimo_intento: string }[] | null>(null)
  const [volumen, setVolumen] = useState<{ usuario_nombre: string; total_acciones: number }[] | null>(null)
  const [errorSeguridad, setErrorSeguridad] = useState<string | null>(null)

  async function cargarHistorial() {
    if (!empresaId && !esSuperAdmin) {
      setLoading(false)
      return
    }
    setLoading(true)
    let q = supabase.from('auditoria').select('*').order('created_at', { ascending: false }).limit(300)
    if (!esSuperAdmin) q = q.eq('empresa_id', empresaId)
    if (filtroTabla) q = q.eq('tabla', filtroTabla)
    if (filtroAccion) q = q.eq('accion', filtroAccion)
    if (desde) q = q.gte('created_at', desde)
    if (hasta) q = q.lte('created_at', `${hasta}T23:59:59`)
    const { data, error: err } = await q
    if (err) setError('No se pudo cargar el historial.')
    else setError(null)
    setRegistros((data ?? []) as unknown as Registro[])
    setLoading(false)
  }

  async function cargarSeguridad() {
    setErrorSeguridad(null)
    if (esSuperAdmin) {
      const { data, error: err } = await supabase.rpc('listar_bloqueos_activos')
      setBloqueos(err ? [] : ((data ?? []) as unknown as typeof bloqueos))
    } else {
      setBloqueos(null)
    }
    const { data: vol, error: volErr } = await supabase.rpc('reporte_volumen_actividad', {
      p_empresa_id: esSuperAdmin ? null : empresaId,
      p_minutos: 30,
    })
    if (volErr) {
      // Rol sin permiso (Contador, Cajero, etc.) -> la RPC rechaza con excepción;
      // se muestra simplemente "sin actividad reciente", sin alarmar con un error.
      setVolumen([])
    } else {
      setVolumen((vol ?? []) as unknown as typeof volumen)
    }
  }

  useEffect(() => {
    cargarHistorial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, filtroTabla, filtroAccion, desde, hasta])

  useEffect(() => {
    if (tab === 'seguridad') cargarSeguridad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const camposDetalle = useMemo(() => {
    if (!detalle) return []
    const antes = (detalle.valores_anteriores ?? {}) as Record<string, unknown>
    const despues = (detalle.valores_nuevos ?? {}) as Record<string, unknown>
    const claves = Array.from(new Set([...Object.keys(antes), ...Object.keys(despues)])).filter((k) => !CAMPOS_SENSIBLES.includes(k))
    const cambiadas = claves.filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]))
    const mostrar = cambiadas.length ? cambiadas : claves
    return mostrar.map((k) => ({ campo: k, antes: antes[k], despues: despues[k], cambio: cambiadas.includes(k) }))
  }, [detalle])

  if (!empresaId && !esSuperAdmin) return <EstadoVacio icono="🕵️" titulo="Sin empresa asignada" descripcion="Tu usuario no tiene una empresa asignada todavía." />

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-white mb-1">Auditoría</h1>
      <p className="text-xs text-white/40 mb-4">Historial de cambios registrado por triggers reales de la base de datos — no depende de que cada módulo recuerde avisar.</p>

      <div className="flex gap-1 mb-4 border-b border-white/10">
        {(['historial', 'seguridad'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-[var(--color-blue-5)] text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}
          >
            {t === 'historial' ? '📜 Historial' : '🛡 Seguridad'}
          </button>
        ))}
      </div>

      {tab === 'historial' && (
        <>
          <div className="rounded-2xl border border-white/10 p-4 mb-4 flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-xs text-white/50 mb-1">Acción sobre</label>
              <select value={filtroTabla} onChange={(e) => setFiltroTabla(e.target.value)} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-[var(--color-blue-5)]">
                <option value="">Todas las acciones</option>
                {Object.entries(NOMBRES_TABLA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Tipo</label>
              <select value={filtroAccion} onChange={(e) => setFiltroAccion(e.target.value)} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-[var(--color-blue-5)]">
                <option value="">Toda acción</option>
                <option value="crear">Crear</option>
                <option value="editar">Editar</option>
                <option value="eliminar">Eliminar</option>
                <option value="login">Login</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Desde</label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-[var(--color-blue-5)]" />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Hasta</label>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-[var(--color-blue-5)]" />
            </div>
          </div>

          {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}
          {loading ? (
            <TablaSkeleton />
          ) : (
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              {registros.length === 0 ? (
                <EstadoVacio icono="📜" titulo="Sin registros" descripcion="No hay actividad para este filtro." />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                      <th className="px-4 py-2 font-medium">Fecha</th>
                      <th className="px-4 py-2 font-medium">Usuario</th>
                      <th className="px-4 py-2 font-medium">Acción</th>
                      <th className="px-4 py-2 font-medium">Tabla</th>
                      <th className="px-4 py-2 font-medium">Resumen</th>
                      <th className="px-4 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {registros.map((a) => (
                      <tr key={a.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                        <td className="px-4 py-2.5 text-white/50 text-[11px] whitespace-nowrap">{new Date(a.created_at).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="px-4 py-2.5 text-white text-xs font-medium">{a.usuario_nombre}</td>
                        <td className="px-4 py-2.5 text-xs">{NOMBRES_ACCION[a.accion] || a.accion}</td>
                        <td className="px-4 py-2.5 text-white/60 text-xs">{NOMBRES_TABLA[a.tabla] || a.tabla}</td>
                        <td className="px-4 py-2.5 text-white/50 text-xs">{resumen(a)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {(a.valores_anteriores || a.valores_nuevos) && a.tabla !== 'sesion' && (
                            <button onClick={() => setDetalle(a)} className="text-[11px] text-blue-300 hover:underline">
                              Ver cambios
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'seguridad' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 text-xs font-medium text-white/60">🔒 Bloqueos activos (5+ intentos fallidos en 15 min)</div>
            {!esSuperAdmin ? (
              <div className="px-4 py-6 text-center text-xs text-white/30">Solo visible para el Super Administrador.</div>
            ) : bloqueos === null ? (
              <div className="px-4 py-6 text-center text-xs text-white/30">Cargando…</div>
            ) : bloqueos.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-white/30">Sin bloqueos activos.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {bloqueos.map((b, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="px-4 py-2.5 text-white text-xs font-medium">{b.email}</td>
                      <td className="px-4 py-2.5 text-red-400 text-xs text-right font-mono">{b.fallidos}</td>
                      <td className="px-4 py-2.5 text-white/40 text-[11px]">{new Date(b.ultimo_intento).toLocaleString('es-EC')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 text-xs font-medium text-white/60">📈 Volumen de actividad (últimos 30 min)</div>
            {errorSeguridad ? (
              <div className="px-4 py-6 text-center text-xs text-white/30">{errorSeguridad}</div>
            ) : volumen === null ? (
              <div className="px-4 py-6 text-center text-xs text-white/30">Cargando…</div>
            ) : volumen.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-white/30">Sin actividad reciente.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {volumen.map((v, i) => {
                    const n = v.total_acciones
                    const nivel = n > 500 ? '🔴 Crítico' : n > 300 ? '🟠 Alerta' : n > 100 ? '🟡 Atención' : '🟢 Normal'
                    const color = n > 500 ? 'text-red-400' : n > 300 ? 'text-orange-400' : n > 100 ? 'text-amber-400' : 'text-emerald-400'
                    return (
                      <tr key={i} className="border-t border-white/5">
                        <td className="px-4 py-2.5 text-white text-xs font-medium">{v.usuario_nombre}</td>
                        <td className={`px-4 py-2.5 text-right font-mono text-xs font-medium ${color}`}>{n}</td>
                        <td className="px-4 py-2.5 text-xs">{nivel}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {detalle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setDetalle(null)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Detalle del cambio</h3>
            <p className="text-xs text-white/40 mb-4">
              {detalle.usuario_nombre} · {new Date(detalle.created_at).toLocaleString('es-EC')}
            </p>
            <div className="rounded-lg border border-white/10 overflow-hidden max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide sticky top-0">
                    <th className="px-3 py-2 font-medium">Campo</th>
                    <th className="px-3 py-2 font-medium">Antes</th>
                    <th className="px-3 py-2 font-medium">Después</th>
                  </tr>
                </thead>
                <tbody>
                  {camposDetalle.map((c) => (
                    <tr key={c.campo} className={`border-t border-white/5 ${c.cambio ? 'bg-blue-500/5' : ''}`}>
                      <td className="px-3 py-2 text-white text-xs font-medium">{c.campo}</td>
                      <td className="px-3 py-2 text-white/50 text-xs break-all">{fmtVal(c.antes)}</td>
                      <td className="px-3 py-2 text-emerald-400 text-xs break-all">{fmtVal(c.despues)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => setDetalle(null)} className="w-full rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5 mt-4">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
