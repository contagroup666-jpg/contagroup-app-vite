import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../../context/AuthContext'
import TablaSkeleton from '../../components/TablaSkeleton'
import KpiCard from './KpiCard'
import EmpresasTab from './EmpresasTab'
import UsuariosTab from './UsuariosTab'
import {
  obtenerActividadPorEmpresa,
  obtenerResumenGlobal,
  obtenerTendenciaDiaria,
  obtenerUsuariosMasActivos,
} from './adminApi'
import type { ActividadEmpresa, PuntoTendencia, ResumenGlobal, UsuarioActivo } from './types'

function formatoRelativo(iso: string | null): string {
  if (!iso) return 'Sin actividad registrada'
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  if (dias < 30) return `Hace ${dias} días`
  return new Date(iso).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatoFechaCorta(fecha: string): string {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })
}

export default function AdminDashboardPage() {
  const { perfil } = useAuth()
  const [tab, setTab] = useState<'monitoreo' | 'empresas' | 'usuarios'>('monitoreo')
  const [resumen, setResumen] = useState<ResumenGlobal | null>(null)
  const [actividadEmpresas, setActividadEmpresas] = useState<ActividadEmpresa[]>([])
  const [tendencia, setTendencia] = useState<PuntoTendencia[]>([])
  const [usuariosActivos, setUsuariosActivos] = useState<UsuarioActivo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (perfil?.rol !== 'Super Administrador') return
    let activo = true
    ;(async () => {
      const [r, ae, t, ua] = await Promise.all([
        obtenerResumenGlobal(),
        obtenerActividadPorEmpresa(30),
        obtenerTendenciaDiaria(30),
        obtenerUsuariosMasActivos(30, 6),
      ])
      if (!activo) return
      const err = r.error || ae.error || t.error || ua.error
      if (err) setError(err)
      setResumen(r.data)
      setActividadEmpresas(ae.data)
      setTendencia(t.data)
      setUsuariosActivos(ua.data)
      setLoading(false)
    })()
    return () => {
      activo = false
    }
  }, [perfil?.rol])

  if (perfil?.rol !== 'Super Administrador') {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-white/10 bg-[var(--color-bg-1)] p-8 text-center max-w-md mx-auto">
          <p className="text-2xl mb-2">🔒</p>
          <p className="text-sm text-white/70 font-medium">Panel restringido</p>
          <p className="text-xs text-white/40 mt-1">Esta sección solo está disponible para el Super Administrador.</p>
        </div>
      </div>
    )
  }

  const empresasActivas = actividadEmpresas.filter((e) => e.total_acciones > 0).length
  const topEmpresas = actividadEmpresas.slice(0, 6).map((e) => ({
    nombre: e.empresa_nombre.length > 14 ? e.empresa_nombre.slice(0, 13) + '…' : e.empresa_nombre,
    acciones: e.total_acciones,
  }))

  return (
    <div className="p-6 max-w-7xl">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">Panel de Super Administrador</h2>
        <p className="text-xs text-white/40 mt-1">Visión global de la plataforma — todas las empresas</p>
      </div>

      <div className="flex gap-1 mb-5 border-b border-white/10">
        <button
          onClick={() => setTab('monitoreo')}
          className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
            tab === 'monitoreo' ? 'border-[var(--color-blue-5)] text-white' : 'border-transparent text-white/40 hover:text-white/70'
          }`}
        >
          📊 Monitoreo
        </button>
        <button
          onClick={() => setTab('empresas')}
          className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
            tab === 'empresas' ? 'border-[var(--color-blue-5)] text-white' : 'border-transparent text-white/40 hover:text-white/70'
          }`}
        >
          🏢 Empresas
        </button>
        <button
          onClick={() => setTab('usuarios')}
          className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
            tab === 'usuarios' ? 'border-[var(--color-blue-5)] text-white' : 'border-transparent text-white/40 hover:text-white/70'
          }`}
        >
          👥 Usuarios
        </button>
      </div>

      {tab === 'empresas' && <EmpresasTab />}
      {tab === 'usuarios' && <UsuariosTab />}

      {tab === 'monitoreo' && (
        <>
          {error && (
        <p role="alert" className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          No se pudieron cargar todos los datos: {error}
        </p>
      )}

      {loading ? (
        <TablaSkeleton filas={4} columnas={4} />
      ) : (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <KpiCard
              titulo="Total empresas"
              valor={String(resumen?.totalEmpresas ?? 0)}
              subtitulo={`${empresasActivas} con actividad en los últimos 30 días`}
              icono="🏢"
              iconoColor="blue"
            />
            <KpiCard
              titulo="Personal registrado"
              valor={String(resumen?.totalPersonal ?? 0)}
              subtitulo={resumen?.personalPorRol.map((r) => `${r.rol}: ${r.total}`).join(' · ')}
              icono="👥"
              iconoColor="gold"
            />
            <KpiCard
              titulo="Acciones (30 días)"
              valor={(resumen?.accionesUltimos30Dias ?? 0).toLocaleString('es-EC')}
              subtitulo="Volumen de uso registrado en toda la plataforma"
              icono="⚡"
              iconoColor="green"
            />
            <KpiCard
              titulo="Logins fallidos"
              valor={String(resumen?.loginsFallidosUltimos7Dias ?? 0)}
              subtitulo="Últimos 7 días — posible señal de riesgo"
              icono="⚠️"
              iconoColor={resumen && resumen.loginsFallidosUltimos7Dias > 5 ? 'red' : 'blue'}
              tendencia={
                resumen && resumen.loginsFallidosUltimos7Dias > 5
                  ? { texto: 'Revisar accesos', tipo: 'down' }
                  : { texto: 'Normal', tipo: 'neutral' }
              }
            />
          </div>

          {/* Tendencia + ranking */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-[var(--color-bg-1)] p-5">
              <p className="text-sm font-semibold text-white mb-0.5">Tendencia de actividad</p>
              <p className="text-xs text-white/40 mb-4">Acciones por día — últimos 30 días, todas las empresas</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={tendencia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="fecha"
                    tickFormatter={formatoFechaCorta}
                    tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.ceil(tendencia.length / 6)}
                  />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    labelFormatter={(v) => formatoFechaCorta(String(v))}
                    contentStyle={{
                      background: 'var(--color-bg-2)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="total" stroke="var(--color-blue-4, #2d72d2)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[var(--color-bg-1)] p-5">
              <p className="text-sm font-semibold text-white mb-0.5">Contadores más activos</p>
              <p className="text-xs text-white/40 mb-4">Por volumen de acciones (30 días)</p>
              {usuariosActivos.length === 0 ? (
                <p className="text-xs text-white/40">Sin actividad registrada en el período.</p>
              ) : (
                <ul className="space-y-2.5">
                  {usuariosActivos.map((u) => (
                    <li key={u.usuario_id ?? u.usuario_nombre} className="flex items-center justify-between text-xs">
                      <div className="min-w-0">
                        <p className="text-white/80 truncate">{u.usuario_nombre}</p>
                        <p className="text-white/35 truncate">{u.empresa_nombre}</p>
                      </div>
                      <span className="font-mono text-white/60 shrink-0 ml-2">{u.total_acciones}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Empresas más activas (gráfica) */}
          <div className="rounded-2xl border border-white/10 bg-[var(--color-bg-1)] p-5 mb-5">
            <p className="text-sm font-semibold text-white mb-0.5">Empresas más activas</p>
            <p className="text-xs text-white/40 mb-4">Acciones registradas en los últimos 30 días</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topEmpresas}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="nombre" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-bg-2)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="acciones" fill="var(--color-gold, #c9a227)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabla completa por empresa */}
          <div className="rounded-2xl border border-white/10 bg-[var(--color-bg-1)] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10">
              <p className="text-sm font-semibold text-white">Actividad por empresa</p>
              <p className="text-xs text-white/40 mt-0.5">Todas las {actividadEmpresas.length} empresas registradas</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                  <th className="px-5 py-2 font-medium">Empresa</th>
                  <th className="px-5 py-2 font-medium text-right">Acciones (30 días)</th>
                  <th className="px-5 py-2 font-medium text-right">Última actividad</th>
                </tr>
              </thead>
              <tbody>
                {actividadEmpresas.map((e) => (
                  <tr key={e.empresa_id} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-5 py-2.5 text-white/80">{e.empresa_nombre}</td>
                    <td className="px-5 py-2.5 text-right text-white/70 font-mono text-xs">{e.total_acciones}</td>
                    <td className="px-5 py-2.5 text-right text-white/50 text-xs">{formatoRelativo(e.ultima_actividad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
        </>
      )}
    </div>
  )
}