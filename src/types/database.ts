// Tipos generados a mano a partir del esquema real de Supabase (proyecto contagroup-erp).
// Se tipan aquí las tablas a medida que se migra cada módulo del ERP a este frontend
// (usuarios, empresas, accesos_multiempresa, plan_cuentas, usuario_ia_credenciales,
// clientes, productos, facturas). El resto de las tablas del sistema aún vive solo
// en el index.html monolítico y no tiene tipos aquí todavía.

export type Rol =
  | 'Super Administrador'
  | 'Admin Empresa'
  | 'Contador'
  | 'Cajero'
  | 'Contador General'
  | 'Contador de Empresa'
  | 'Jefe de Nómina'
  | 'Bodeguero'
  | 'Auditor'

// Forma real de cada elemento del array jsonb `facturas.items` (línea de detalle de la factura).
export interface FacturaItemJson {
  producto_id?: string
  nombre: string
  cantidad: number
  precio: number
  costo?: number
}

export interface Database {
  public: {
    Tables: {
      usuarios: {
        Row: {
          id: string
          nombre: string
          email: string
          rol: Rol
          empresa_id: string | null
          cupo_empresas: number | null
          acceso_nomina: boolean
          permisos: Record<string, boolean>
          roles_gestionables: string[]
          es_demo: boolean
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['usuarios']['Row']> & {
          id: string
          nombre: string
          email: string
        }
        Update: Partial<Database['public']['Tables']['usuarios']['Row']>
      }
      empresas: {
        Row: {
          id: string
          nombre: string
          ruc: string | null
          direccion: string | null
          telefono: string | null
          email: string | null
          ciudad: string | null
          regimen: string | null
          moneda: string
          iva_porcentaje: number
          logo_url: string | null
          estado: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['empresas']['Row']> & { nombre: string }
        Update: Partial<Database['public']['Tables']['empresas']['Row']>
      }
      accesos_multiempresa: {
        Row: {
          id: string
          usuario_id: string
          empresa_id: string
          permisos: Record<string, boolean>
          estado: 'Activo' | 'Revocado'
          asignado_por: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['accesos_multiempresa']['Row']> & {
          usuario_id: string
          empresa_id: string
        }
        Update: Partial<Database['public']['Tables']['accesos_multiempresa']['Row']>
      }
      plan_cuentas: {
        Row: {
          id: string
          empresa_id: string
          codigo: string
          nombre: string
          clase: number
          tipo: string
          saldo: number
          tipo_costo: string | null
          nivel: number
          es_detalle: boolean
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['plan_cuentas']['Row']> & {
          empresa_id: string
          codigo: string
          nombre: string
          clase: number
          tipo: string
        }
        Update: Partial<Database['public']['Tables']['plan_cuentas']['Row']>
      }
      usuario_ia_credenciales: {
        Row: {
          id: string
          usuario_id: string
          proveedor: string
          activo: boolean
          estado_verificacion: string | null
          ultima_verificacion: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['usuario_ia_credenciales']['Row']> & {
          usuario_id: string
        }
        Update: Partial<Database['public']['Tables']['usuario_ia_credenciales']['Row']>
      }
      clientes: {
        Row: {
          id: string
          empresa_id: string
          nombre: string
          ruc: string | null
          email: string | null
          telefono: string | null
          direccion: string | null
          tipo_identificacion: string
          contribuyente_especial: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['clientes']['Row']> & {
          empresa_id: string
          nombre: string
        }
        Update: Partial<Database['public']['Tables']['clientes']['Row']>
      }
      productos: {
        Row: {
          id: string
          empresa_id: string
          codigo: string
          nombre: string
          precio: number
          costo: number
          stock: number
          stock_min: number
          stock_max: number
          categoria: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['productos']['Row']> & {
          empresa_id: string
          codigo: string
          nombre: string
        }
        Update: Partial<Database['public']['Tables']['productos']['Row']>
      }
      facturas: {
        Row: {
          id: string
          empresa_id: string
          numero: string
          cliente_id: string | null
          cliente_nombre: string | null
          fecha: string
          subtotal: number
          iva: number
          total: number
          estado: string
          origen: string
          tipo_doc: string | null
          forma_pago: string | null
          motivo_anulacion: string | null
          items: FacturaItemJson[]
          pagos: unknown[]
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['facturas']['Row']> & {
          empresa_id: string
          numero: string
          fecha: string
        }
        Update: Partial<Database['public']['Tables']['facturas']['Row']>
      }
    }
  }
}
