import type { Rol } from '../../types/database'

export interface ModuloDef {
  id: string
  label: string
  path: string
  icono: string
  // Si se define, solo estos roles ven el módulo. Si se omite, lo ve cualquier rol autenticado.
  rolesPermitidos?: Rol[]
  // Si se define, además del rol hace falta este permiso en permisos jsonb del usuario.
  permisoRequerido?: string
}

// Este es el catálogo de módulos migrados a Vite/React hasta ahora.
// El resto de módulos del ERP (nómina, POS, CxC, etc.) sigue viviendo en el
// index.html monolítico mientras se migran uno a uno.
export const MODULOS: ModuloDef[] = [
  {
    id: 'admin',
    label: 'Panel Super Admin',
    path: '/admin',
    icono: '🛡️',
    rolesPermitidos: ['Super Administrador'],
  },
  {
    id: 'usuarios',
    label: 'Usuarios y Roles',
    path: '/usuarios',
    icono: '👤',
    rolesPermitidos: ['Admin Empresa', 'Contador General'],
  },
  {
    id: 'dashboard',
    label: 'Panel principal',
    path: '/',
    icono: '📊',
  },
  {
    id: 'plan-cuentas',
    label: 'Plan de cuentas',
    path: '/plan-cuentas',
    icono: '📒',
    permisoRequerido: 'contabilidad',
  },
  {
    id: 'facturas',
    label: 'Facturas',
    path: '/facturas',
    icono: '🧾',
    permisoRequerido: 'ventas',
  },
  {
    id: 'clientes',
    label: 'Clientes',
    path: '/clientes',
    icono: '👥',
    permisoRequerido: 'ventas',
  },
  {
    id: 'crm',
    label: 'CRM Pipeline',
    path: '/crm',
    icono: '🎯',
    permisoRequerido: 'ventas',
  },
  {
    id: 'pos',
    label: 'Punto de Venta',
    path: '/pos',
    icono: '🧾',
    permisoRequerido: 'pos',
  },
  {
    id: 'cxc',
    label: 'Cuentas por Cobrar',
    path: '/cxc',
    icono: '💳',
    permisoRequerido: 'ventas',
  },
  {
    id: 'retenciones',
    label: 'Retenciones',
    path: '/retenciones',
    icono: '📑',
    permisoRequerido: 'contabilidad',
  },
  {
    id: 'compras',
    label: 'Compras',
    path: '/compras',
    icono: '🛒',
    permisoRequerido: 'contabilidad',
  },
  {
    id: 'nomina',
    label: 'Nómina RRHH',
    path: '/nomina',
    icono: '💼',
    permisoRequerido: 'nomina',
  },
  {
    id: 'activos-fijos',
    label: 'Activos Fijos',
    path: '/activos-fijos',
    icono: '🏭',
    permisoRequerido: 'contabilidad',
  },
  {
    id: 'config-contable',
    label: 'Configuración contable',
    path: '/config-contable',
    icono: '⚙️',
    permisoRequerido: 'contabilidad',
  },
]

export function moduloVisible(modulo: ModuloDef, rol: Rol | undefined, permisos: Record<string, boolean> | undefined) {
  if (!rol) return false
  if (rol === 'Super Administrador') return true
  if (modulo.rolesPermitidos && !modulo.rolesPermitidos.includes(rol)) return false
  if (modulo.permisoRequerido && !permisos?.[modulo.permisoRequerido]) return false
  return true
}
