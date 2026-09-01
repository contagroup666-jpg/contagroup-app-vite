// Tipos locales del panel de Super Administrador (visión global de la plataforma).
// Todos los datos que consume este módulo son reales: conteos de `empresas`/`usuarios`,
// y actividad derivada de `auditoria` (RLS ya permite al Super Administrador ver todo).
// Importante: el sistema no registra duración de sesión (no hay login/logout pareados),
// así que "uso" aquí se mide como volumen de acciones + recencia, no tiempo conectado.

export interface RolConteo {
  rol: string
  total: number
}

export interface ActividadEmpresa {
  empresa_id: string
  empresa_nombre: string
  total_acciones: number
  ultima_actividad: string | null // ISO timestamp de la acción más reciente, o null si no hay actividad
}

export interface PuntoTendencia {
  fecha: string // YYYY-MM-DD
  total: number
}

export interface UsuarioActivo {
  usuario_id: string | null
  usuario_nombre: string
  empresa_nombre: string
  total_acciones: number
}

export interface LoginStats {
  exitosos: number
  fallidos: number
}

export interface ResumenGlobal {
  totalEmpresas: number
  totalPersonal: number
  personalPorRol: RolConteo[]
  accionesUltimos30Dias: number
  loginsFallidosUltimos7Dias: number
}
