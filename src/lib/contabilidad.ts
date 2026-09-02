import { supabase } from './supabaseClient'

export interface LineaAsiento {
  cuenta_id: string
  debe: number
  haber: number
}

/**
 * Crea un asiento contable balanceado (encabezado + líneas) en una sola llamada
 * atómica al RPC `fn_crear_asiento`. A diferencia del legacy `postearCuenta()`
 * (que solo sumaba/restaba directo sobre `plan_cuentas.saldo` sin dejar rastro
 * en el libro diario), esto sí registra el asiento real con sus líneas.
 *
 * Lanza un error si el RPC falla (cuenta no encontrada, sin permiso, asiento
 * desequilibrado, etc.) — quien llame debe capturarlo y mostrarlo al usuario.
 */
export async function crearAsiento(params: {
  empresaId: string
  concepto: string
  fecha: string
  lineas: LineaAsiento[]
  prefijo?: string
  creadoPor?: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('fn_crear_asiento', {
    p_empresa_id: params.empresaId,
    p_concepto: params.concepto,
    p_fecha: params.fecha,
    p_lineas: params.lineas,
    p_creado_por: params.creadoPor ?? null,
    p_prefijo: params.prefijo ?? 'ASI',
  })
  if (error) throw new Error(error.message)
  return data as string
}
