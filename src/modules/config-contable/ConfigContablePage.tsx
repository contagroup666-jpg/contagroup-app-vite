import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'

type Cuenta = Database['public']['Tables']['plan_cuentas']['Row']
type Config = Database['public']['Tables']['config_cuentas_contables']['Row']

const CAMPOS: { key: keyof Pick<
  Config,
  | 'cuenta_caja_id'
  | 'cuenta_bancos_id'
  | 'cuenta_cxc_id'
  | 'cuenta_inventario_id'
  | 'cuenta_ventas_id'
  | 'cuenta_iva_id'
  | 'cuenta_costo_ventas_id'
  | 'cuenta_cxp_id'
  | 'cuenta_retenciones_id'
>; label: string; ayuda: string }[] = [
  { key: 'cuenta_caja_id', label: 'Caja / Efectivo', ayuda: 'Recibe los pagos en efectivo del POS' },
  { key: 'cuenta_bancos_id', label: 'Bancos (Tarjeta / Transferencia)', ayuda: 'Recibe pagos con tarjeta o transferencia' },
  { key: 'cuenta_cxc_id', label: 'Cuentas por Cobrar', ayuda: 'Recibe ventas a crédito' },
  { key: 'cuenta_inventario_id', label: 'Inventario', ayuda: 'Se acredita al salir mercadería vendida' },
  { key: 'cuenta_ventas_id', label: 'Ventas / Ingresos', ayuda: 'Se acredita el subtotal de cada venta' },
  { key: 'cuenta_iva_id', label: 'IVA por Pagar', ayuda: 'Se acredita el IVA cobrado en cada venta' },
  { key: 'cuenta_costo_ventas_id', label: 'Costo de Ventas', ayuda: 'Se debita el costo de la mercadería vendida' },
  { key: 'cuenta_cxp_id', label: 'Cuentas por Pagar', ayuda: 'Se acredita al registrar una compra a crédito' },
  { key: 'cuenta_retenciones_id', label: 'Retenciones por Pagar', ayuda: 'Se acredita el monto retenido a un proveedor (SRI)' },
]

export default function ConfigContablePage() {
  const { perfil } = useAuth()
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [config, setConfig] = useState<Partial<Config>>({})
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    let activo = true
    async function cargar() {
      setLoading(true)
      const [cuentasRes, configRes] = await Promise.all([
        supabase.from('plan_cuentas').select('*').eq('es_detalle', true).order('codigo'),
        supabase.from('config_cuentas_contables').select('*').maybeSingle(),
      ])
      if (!activo) return
      if (cuentasRes.error) setError(cuentasRes.error.message)
      else setCuentas((cuentasRes.data ?? []) as unknown as Cuenta[])
      if (configRes.data) setConfig(configRes.data as unknown as Config)
      setLoading(false)
    }
    cargar()
    return () => {
      activo = false
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!perfil?.empresa_id) {
      setError('Tu usuario no tiene una empresa activa asignada.')
      return
    }
    setGuardando(true)
    setError(null)
    setOk(false)

    const payload = {
      empresa_id: perfil.empresa_id,
      cuenta_caja_id: config.cuenta_caja_id || null,
      cuenta_bancos_id: config.cuenta_bancos_id || null,
      cuenta_cxc_id: config.cuenta_cxc_id || null,
      cuenta_inventario_id: config.cuenta_inventario_id || null,
      cuenta_ventas_id: config.cuenta_ventas_id || null,
      cuenta_iva_id: config.cuenta_iva_id || null,
      cuenta_costo_ventas_id: config.cuenta_costo_ventas_id || null,
      cuenta_cxp_id: config.cuenta_cxp_id || null,
      cuenta_retenciones_id: config.cuenta_retenciones_id || null,
      updated_at: new Date().toISOString(),
      updated_por: perfil.id,
    }

    const { data, error: err } = await supabase
      .from('config_cuentas_contables')
      .upsert(payload, { onConflict: 'empresa_id' })
      .select()
      .single()

    setGuardando(false)
    if (err) {
      setError(err.message)
      return
    }
    setConfig(data as unknown as Config)
    setOk(true)
    setTimeout(() => setOk(false), 2500)
  }

  const faltantes = CAMPOS.filter((c) => !config[c.key]).length

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-base font-semibold text-white">Configuración contable</h2>
      <p className="text-xs text-white/40 mt-0.5 mb-1">
        Define qué cuenta del plan de cuentas de esta empresa corresponde a cada concepto.
      </p>
      <p className="text-xs text-white/40 mb-4">
        Los códigos de cuenta no son iguales entre empresas, así que módulos como el Punto de Venta
        necesitan saber exactamente cuál cuenta usar para no contabilizar en el lugar equivocado.
      </p>

      {loading && <p className="text-xs text-white/40">Cargando…</p>}

      {!loading && (
        <>
          {faltantes > 0 && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
              Faltan {faltantes} cuenta{faltantes === 1 ? '' : 's'} por configurar. Mientras tanto, el
              Punto de Venta no podrá contabilizar automáticamente las ventas.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {CAMPOS.map((campo) => (
              <div key={campo.key}>
                <label className="block text-xs text-white/50 mb-1">
                  {campo.label} <span className="text-white/30">— {campo.ayuda}</span>
                </label>
                <select
                  value={(config[campo.key] as string) || ''}
                  onChange={(e) => setConfig({ ...config, [campo.key]: e.target.value || null })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                >
                  <option value="">Sin asignar…</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} — {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            {error && (
              <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {ok && <p className="text-xs text-emerald-400">✓ Configuración guardada.</p>}

            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-4 py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
