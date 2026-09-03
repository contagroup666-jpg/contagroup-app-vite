import { supabase } from './supabaseClient'

const MOTOR_URL = 'https://contagroup-motor-contable-production.up.railway.app'

export interface ResultadoNominaMensual {
  ingresos: {
    sueldoMensual: number
    horasExtra50: number
    horasExtra100: number
    comisiones: number
    totalIngresos: number
  }
  descuentos: { aportePersonalIESS: number }
  aportesPatronales: {
    aportePatronalIESS: number
    ieceSecap: number
    fondoReserva: number
    totalCostoPatronal: number
  }
  netoAPagar: number
  costoTotalEmpresa: number
}

export interface ResultadoDecimos {
  decimoTerceroMensualizado: number
  decimoTerceroAnual: number
  decimoCuartoMensualizado: number
  decimoCuartoAnual: number
}

export interface ResultadoDepreciacion {
  depreciacionMensual: number
  depreciacionAcumulada: number
  valorEnLibros: number
  mesesTranscurridos: number
  mesesVidaUtil: number
  totalmenteDepreciado: boolean
}

async function llamarMotor<T>(ruta: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`${MOTOR_URL}${ruta}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || 'El motor contable devolvió un error.')
  return json as T
}

export function calcularNominaMensual(params: {
  sueldoMensual: number
  mesesAntiguedad: number
  horasExtra50?: number
  horasExtra100?: number
  comisiones?: number
}) {
  return llamarMotor<ResultadoNominaMensual>('/api/nomina/calcular', params)
}

export function calcularDecimos(params: { sumaIngresosAnuales: number; mesesTrabajadosEnPeriodo?: number }) {
  return llamarMotor<ResultadoDecimos>('/api/nomina/decimos', params)
}

export function calcularDepreciacion(params: {
  valorCompra: number
  valorResidual: number
  vidaUtilAnios: number
  fechaCompra: string
  fechaCorte?: string
}) {
  return llamarMotor<ResultadoDepreciacion>('/api/activos-fijos/depreciacion', params)
}
