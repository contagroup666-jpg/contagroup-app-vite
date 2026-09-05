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
  | 'Contador Auxiliar'
  | 'Contador de Empresa'
  | 'Jefe de Nómina'
  | 'Bodeguero'
  | 'Auditor'

export type EtapaLead = 'Prospecto' | 'Contactado' | 'Propuesta' | 'Negociación' | 'Cerrado'

export interface PagoPos {
  metodo: 'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Credito'
  monto: number
}

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
      leads: {
        Row: {
          id: string
          empresa_id: string
          nombre: string
          contacto: string | null
          valor: number
          etapa: EtapaLead
          email: string | null
          fecha_cierre: string | null
          notas: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['leads']['Row']> & {
          empresa_id: string
          nombre: string
        }
        Update: Partial<Database['public']['Tables']['leads']['Row']>
      }
      actividades: {
        Row: {
          id: string
          empresa_id: string
          lead_id: string | null
          tipo: string
          fecha: string
          descripcion: string
          estado: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['actividades']['Row']> & {
          empresa_id: string
          fecha: string
          descripcion: string
        }
        Update: Partial<Database['public']['Tables']['actividades']['Row']>
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
          pagos: PagoPos[]
          turno_id: string | null
          cajero_id: string | null
          cajero_nombre: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['facturas']['Row']> & {
          empresa_id: string
          numero: string
          fecha: string
        }
        Update: Partial<Database['public']['Tables']['facturas']['Row']>
      }
      factura_items: {
        Row: {
          id: string
          factura_id: string
          nombre: string
          cantidad: number
          precio: number
          total: number
          orden: number
        }
        Insert: Partial<Database['public']['Tables']['factura_items']['Row']> & {
          factura_id: string
          nombre: string
        }
        Update: Partial<Database['public']['Tables']['factura_items']['Row']>
      }
      movimientos_inv: {
        Row: {
          id: string
          empresa_id: string
          producto_id: string
          tipo: string
          cantidad: number
          costo_unitario: number
          vr_unitario: number
          fecha: string
          ref: string | null
          nota: string | null
          factura_id: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['movimientos_inv']['Row']> & {
          empresa_id: string
          producto_id: string
          tipo: string
        }
        Update: Partial<Database['public']['Tables']['movimientos_inv']['Row']>
      }
      pos_turnos: {
        Row: {
          id: string
          empresa_id: string
          cajero_id: string | null
          cajero_nombre: string | null
          fecha_apertura: string
          monto_inicial: number
          estado: 'ABIERTO' | 'CERRADO'
          fecha_cierre: string | null
          monto_final_declarado: number | null
          monto_calculado: number | null
          diferencia: number | null
          totales_por_metodo: Record<string, number> | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['pos_turnos']['Row']> & {
          empresa_id: string
        }
        Update: Partial<Database['public']['Tables']['pos_turnos']['Row']>
      }
      config_cuentas_contables: {
        Row: {
          id: string
          empresa_id: string
          cuenta_caja_id: string | null
          cuenta_bancos_id: string | null
          cuenta_cxc_id: string | null
          cuenta_inventario_id: string | null
          cuenta_ventas_id: string | null
          cuenta_iva_id: string | null
          cuenta_costo_ventas_id: string | null
          cuenta_cxp_id: string | null
          cuenta_retenciones_id: string | null
          updated_at: string
          updated_por: string | null
        }
        Insert: Partial<Database['public']['Tables']['config_cuentas_contables']['Row']> & {
          empresa_id: string
        }
        Update: Partial<Database['public']['Tables']['config_cuentas_contables']['Row']>
      }
      retenciones: {
        Row: {
          id: string
          empresa_id: string
          proveedor_id: string
          numero: string
          fecha: string
          base_iva: number
          pct_iva: number
          ret_iva: number
          base_renta: number
          pct_renta: number
          ret_renta: number
          total_retenido: number
          factura_ref: string | null
          autorizacion: string | null
          compra_id: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['retenciones']['Row']> & {
          empresa_id: string
          proveedor_id: string
          numero: string
          fecha: string
        }
        Update: Partial<Database['public']['Tables']['retenciones']['Row']>
      }
      cxc_cargos: {
        Row: {
          id: string
          empresa_id: string
          cliente_id: string
          concepto: string
          fecha: string
          total: number
          fecha_vencimiento: string | null
          observaciones: string | null
          estado_convenio: string | null
          convenio_id: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['cxc_cargos']['Row']> & {
          empresa_id: string
          cliente_id: string
          concepto: string
          fecha: string
          total: number
        }
        Update: Partial<Database['public']['Tables']['cxc_cargos']['Row']>
      }
      cxc_abonos: {
        Row: {
          id: string
          empresa_id: string
          cargo_id: string
          cliente_id: string
          monto: number
          fecha: string
          metodo: string
          referencia: string | null
          observacion: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['cxc_abonos']['Row']> & {
          empresa_id: string
          cargo_id: string
          cliente_id: string
          monto: number
          fecha: string
          metodo: string
        }
        Update: Partial<Database['public']['Tables']['cxc_abonos']['Row']>
      }
      caja_chica: {
        Row: {
          id: string
          empresa_id: string
          nombre: string
          cuenta_id: string
          monto_fondo: number
          saldo_actual: number
          responsable_id: string | null
          estado: string
          fecha_apertura: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['caja_chica']['Row']> & {
          empresa_id: string
          nombre: string
          cuenta_id: string
          monto_fondo: number
        }
        Update: Partial<Database['public']['Tables']['caja_chica']['Row']>
      }
      caja_chica_movimientos: {
        Row: {
          id: string
          caja_chica_id: string
          empresa_id: string
          tipo: 'Apertura' | 'Gasto' | 'Reposicion' | 'Ajuste'
          concepto: string
          beneficiario: string | null
          cuenta_contrapartida_id: string | null
          monto: number
          fecha: string
          asiento_id: string | null
          creado_por: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['caja_chica_movimientos']['Row']> & {
          caja_chica_id: string
          empresa_id: string
          tipo: string
          concepto: string
          monto: number
          fecha: string
        }
        Update: Partial<Database['public']['Tables']['caja_chica_movimientos']['Row']>
      }
      compras: {
        Row: {
          id: string
          empresa_id: string
          proveedor_id: string
          numero: string
          fecha: string
          fecha_registro: string | null
          fecha_vencimiento: string | null
          tipo_comprobante: string
          autorizacion: string | null
          sustento: string | null
          tipo_compra: string
          item_id: string | null
          cuenta_id: string | null
          categoria: string | null
          base0: number
          baseiva: number
          iva: number
          total: number
          concepto: string | null
          estado: string
          fecha_pago: string | null
          forma_pago: string | null
          retencion_id: string | null
          monto_retenido: number
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['compras']['Row']> & {
          empresa_id: string
          proveedor_id: string
          numero: string
          fecha: string
        }
        Update: Partial<Database['public']['Tables']['compras']['Row']>
      }
      proveedores: {
        Row: {
          id: string
          empresa_id: string
          nombre: string
          ruc: string | null
          tipo: string
          email: string | null
          telefono: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['proveedores']['Row']> & {
          empresa_id: string
          nombre: string
        }
        Update: Partial<Database['public']['Tables']['proveedores']['Row']>
      }
      empleados: {
        Row: {
          id: string
          empresa_id: string
          nombre: string
          cedula: string | null
          cargo: string | null
          salario: number
          fecha_ingreso: string | null
          telefono: string | null
          email: string | null
          tipo_contrato: string | null
          banco: string | null
          num_cuenta: string | null
          tipo_cuenta: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['empleados']['Row']> & {
          empresa_id: string
          nombre: string
        }
        Update: Partial<Database['public']['Tables']['empleados']['Row']>
      }
      nomina: {
        Row: {
          id: string
          empresa_id: string
          periodo: string
          cant_empleados: number
          total_bruto: number
          total_iess: number
          total_neto: number
          estado: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['nomina']['Row']> & {
          empresa_id: string
          periodo: string
        }
        Update: Partial<Database['public']['Tables']['nomina']['Row']>
      }
      detalle_nomina: {
        Row: {
          id: string
          empresa_id: string
          empleado_id: string
          codigo: string
          descripcion: string
          tipo: string
          valor: number
          fecha: string
          periodo: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['detalle_nomina']['Row']> & {
          empresa_id: string
          empleado_id: string
          codigo: string
          descripcion: string
          tipo: string
          fecha: string
        }
        Update: Partial<Database['public']['Tables']['detalle_nomina']['Row']>
      }
      activos_fijos: {
        Row: {
          id: string
          empresa_id: string
          nombre: string
          categoria: string | null
          fecha_compra: string
          valor_compra: number
          valor_residual: number
          vida_util_anios: number
          metodo: string | null
          estado: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['activos_fijos']['Row']> & {
          empresa_id: string
          nombre: string
          fecha_compra: string
        }
        Update: Partial<Database['public']['Tables']['activos_fijos']['Row']>
      }
    }
  }
}
