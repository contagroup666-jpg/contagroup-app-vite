import { supabase } from '../../lib/supabaseClient'
import type {
  ActividadEmpresa,
  LoginStats,
  PuntoTendencia,
  ResumenGlobal,
  RolConteo,
  UsuarioActivo,
} from './types'

function haceDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString()
}

/**
 * Resumen global de la plataforma: total de empresas, personal por rol, y volumen
 * de actividad reciente. Cada número viene de una consulta real — nada se estima.
 */
export async function obtenerResumenGlobal(): Promise<{ data: ResumenGlobal | null; error: string | null }> {
  const [empresasRes, usuariosRes, accionesRes, loginsRes] = await Promise.all([
    supabase.from('empresas').select('id', { count: 'exact', head: true }),
    supabase.from('usuarios').select('rol'),
    supabase
      .from('auditoria')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', haceDias(30)),
    supabase
      .from('intentos_login')
      .select('exitoso')
      .gte('created_at', haceDias(7)),
  ])

  const err =
    empresasRes.error?.message ||
    usuariosRes.error?.message ||
    accionesRes.error?.message ||
    loginsRes.error?.message
  if (err) return { data: null, error: err }

  const personalPorRolMap = new Map<string, number>()
  for (const u of usuariosRes.data ?? []) {
    personalPorRolMap.set(u.rol, (personalPorRolMap.get(u.rol) ?? 0) + 1)
  }
  const personalPorRol: RolConteo[] = Array.from(personalPorRolMap, ([rol, total]) => ({ rol, total })).sort(
    (a, b) => b.total - a.total
  )

  const loginsFallidos = (loginsRes.data ?? []).filter((l) => l.exitoso === false).length

  return {
    data: {
      totalEmpresas: empresasRes.count ?? 0,
      totalPersonal: usuariosRes.data?.length ?? 0,
      personalPorRol,
      accionesUltimos30Dias: accionesRes.count ?? 0,
      loginsFallidosUltimos7Dias: loginsFallidos,
    },
    error: null,
  }
}

/**
 * Actividad agregada por empresa en los últimos N días: total de acciones registradas
 * en `auditoria` y la marca de tiempo de la acción más reciente (proxy de "última vez
 * que se usó el sistema"). No es tiempo de sesión real — esa medición no existe hoy.
 */
export async function obtenerActividadPorEmpresa(
  dias = 30
): Promise<{ data: ActividadEmpresa[]; error: string | null }> {
  const [empresasRes, auditoriaRes] = await Promise.all([
    supabase.from('empresas').select('id, nombre'),
    supabase.from('auditoria').select('empresa_id, created_at').gte('created_at', haceDias(dias)),
  ])

  if (empresasRes.error) return { data: [], error: empresasRes.error.message }
  if (auditoriaRes.error) return { data: [], error: auditoriaRes.error.message }

  const acumulado = new Map<string, { total: number; ultima: string }>()

  for (const fila of auditoriaRes.data ?? []) {
    if (!fila.empresa_id) continue
    const actual = acumulado.get(fila.empresa_id)
    if (!actual) {
      acumulado.set(fila.empresa_id, { total: 1, ultima: fila.created_at })
    } else {
      actual.total += 1
      if (fila.created_at > actual.ultima) actual.ultima = fila.created_at
    }
  }

  // Se listan TODAS las empresas, incluidas las que no han tenido actividad — eso también es información.
  const resultado: ActividadEmpresa[] = (empresasRes.data ?? []).map((e) => {
    const agg = acumulado.get(e.id)
    return {
      empresa_id: e.id,
      empresa_nombre: e.nombre,
      total_acciones: agg?.total ?? 0,
      ultima_actividad: agg?.ultima ?? null,
    }
  })

  resultado.sort((a, b) => b.total_acciones - a.total_acciones)
  return { data: resultado, error: null }
}

/**
 * Serie diaria de acciones totales en la plataforma (todas las empresas), para la
 * gráfica de tendencia. Rellena con 0 los días sin ninguna acción registrada.
 */
export async function obtenerTendenciaDiaria(dias = 30): Promise<{ data: PuntoTendencia[]; error: string | null }> {
  const { data, error } = await supabase.from('auditoria').select('created_at').gte('created_at', haceDias(dias))
  if (error) return { data: [], error: error.message }

  const porDia = new Map<string, number>()
  for (const fila of data ?? []) {
    const dia = fila.created_at.slice(0, 10)
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1)
  }

  const serie: PuntoTendencia[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const fecha = d.toISOString().slice(0, 10)
    serie.push({ fecha, total: porDia.get(fecha) ?? 0 })
  }
  return { data: serie, error: null }
}

/**
 * Ranking de las personas (contadores, admins de empresa, etc.) con más acciones
 * registradas en el período — quién está usando más activamente el sistema.
 */
export async function obtenerUsuariosMasActivos(
  dias = 30,
  limite = 8
): Promise<{ data: UsuarioActivo[]; error: string | null }> {
  const [empresasRes, auditoriaRes] = await Promise.all([
    supabase.from('empresas').select('id, nombre'),
    supabase
      .from('auditoria')
      .select('usuario_id, usuario_nombre, empresa_id')
      .gte('created_at', haceDias(dias)),
  ])

  if (empresasRes.error) return { data: [], error: empresasRes.error.message }
  if (auditoriaRes.error) return { data: [], error: auditoriaRes.error.message }

  const nombrePorEmpresa = new Map((empresasRes.data ?? []).map((e) => [e.id, e.nombre as string]))
  const acumulado = new Map<string, UsuarioActivo>()

  for (const fila of auditoriaRes.data ?? []) {
    const clave = fila.usuario_id ?? fila.usuario_nombre
    const existente = acumulado.get(clave)
    if (existente) {
      existente.total_acciones += 1
    } else {
      acumulado.set(clave, {
        usuario_id: fila.usuario_id,
        usuario_nombre: fila.usuario_nombre ?? 'Usuario eliminado',
        empresa_nombre: fila.empresa_id ? nombrePorEmpresa.get(fila.empresa_id) ?? '—' : '—',
        total_acciones: 1,
      })
    }
  }

  return {
    data: Array.from(acumulado.values())
      .sort((a, b) => b.total_acciones - a.total_acciones)
      .slice(0, limite),
    error: null,
  }
}

/** Éxito/fallo de intentos de inicio de sesión en los últimos N días (señal de riesgo). */
export async function obtenerStatsLogins(dias = 7): Promise<{ data: LoginStats; error: string | null }> {
  const { data, error } = await supabase.from('intentos_login').select('exitoso').gte('created_at', haceDias(dias))
  if (error) return { data: { exitosos: 0, fallidos: 0 }, error: error.message }
  const exitosos = (data ?? []).filter((l) => l.exitoso === true).length
  const fallidos = (data ?? []).filter((l) => l.exitoso === false).length
  return { data: { exitosos, fallidos }, error: null }
}
