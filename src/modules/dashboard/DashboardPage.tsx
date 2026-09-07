import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'

type Factura = Database['public']['Tables']['facturas']['Row']
type CxcCargo = Database['public']['Tables']['cxc_cargos']['Row']
type CxcAbono = Database['public']['Tables']['cxc_abonos']['Row']
type Auditoria = Database['public']['Tables']['auditoria']['Row']

function fmt(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n || 0)
}

const NOMBRES_TABLA: Record<string, string> = {
  facturas: 'una factura',
  asientos: 'un asiento contable',
  compras: 'una compra',
  caja_chica_movimientos: 'un movimiento de caja chica',
  movimientos_caja: 'un movimiento de tesorería',
  cxc_abonos: 'un abono a CxC',
  retenciones: 'una retención',
  pos_devoluciones: 'una devolución',
}

// Panel de mando: lo primero que ve cualquier persona al entrar. Reemplaza
// el placeholder original ("por ahora tiene migrados Plan de cuentas y
// Facturas...") que llevaba semanas desactualizado frente a los ~20 módulos
// ya migrados. Muestra cifras vivas de la empresa activa, no texto fijo.
export default function DashboardPage() {
  const { perfil } = useAuth()
  const empresaId = perfil?.empresa_id ?? null
  const esSuperAdmin = perfil?.rol === 'Super Administrador'

  const [facturas, setFacturas] = useState<Factura[]>([])
  const [cargos, setCargos] = useState<CxcCargo[]>([])
  const [abonos, setAbonos] = useState<CxcAbono[]>([])
  const [actividad, setActividad] = useState<Auditoria[]>([])
  const [conteoEmpresas, setConteoEmpresas] = useState<number | null>(null)
  const [conteoUsuarios, setConteoUsuarios] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      setLoading(true)
      if (empresaId) {
        const [facRes, cargosRes, abonosRes, actRes] = await Promise.all([
          supabase.from('facturas').select('*').eq('empresa_id', empresaId).neq('estado', 'Anulada'),
          supabase.from('cxc_cargos').select('*').eq('empresa_id', empresaId),
          supabase.from('cxc_abonos').select('*').eq('empresa_id', empresaId),
          supabase.from('auditoria').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(6),
        ])
        setFacturas((facRes.data ?? []) as unknown as Factura[])
        setCargos((cargosRes.data ?? []) as unknown as CxcCargo[])
        setAbonos((abonosRes.data ?? []) as unknown as CxcAbono[])
        setActividad((actRes.data ?? []) as unknown as Auditoria[])
      }
      if (esSuperAdmin) {
        const [empRes, usrRes] = await Promise.all([
          supabase.from('empresas').select('id', { count: 'exact', head: true }).eq('estado', 'Activa'),
          supabase.from('usuarios').select('id', { count: 'exact', head: true }),
        ])
        setConteoEmpresas(empRes.count ?? 0)
        setConteoUsuarios(usrRes.count ?? 0)
      }
      setLoading(false)
    }
    cargar()
  }, [empresaId, esSuperAdmin])

  const kpis = useMemo(() => {
    const ahora = new Date()
    const delMes = facturas.filter((f) => {
      const d = new Date(f.fecha)
      return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear()
    })
    const ventasMes = delMes.reduce((s, f) => s + f.total, 0)
    const totalCargos = cargos.reduce((s, c) => s + c.total, 0)
    const totalAbonos = abonos.reduce((s, a) => s + a.monto, 0)
    const cxcPendiente = Math.max(0, totalCargos - totalAbonos)
    const hoy = new Date().toISOString().slice(0, 10)
    const facturasHoy = facturas.filter((f) => f.fecha === hoy).length
    return { ventasMes, cxcPendiente, facturasMes: delMes.length, facturasHoy }
  }, [facturas, cargos, abonos])

  const primerNombre = perfil?.nombre?.split(' ')[0] ?? ''
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="p-8 max-w-6xl">
      <p className="text-xs text-white/40 mb-1">{saludo}</p>
      <h1 className="font-display-serif text-[28px] text-white leading-tight mb-1">
        {primerNombre ? `Hola, ${primerNombre}` : 'Panel de mando'}
      </h1>
      <p className="text-sm text-white/50 mb-6">
        {empresaId ? 'Así está la contabilidad de tu empresa hoy.' : 'Vista general del sistema.'}
      </p>

      {!empresaId && !esSuperAdmin && (
        <div className="rounded-2xl border border-dashed border-white/15 py-10 px-6 text-center">
          <p className="text-sm text-white/60">Tu usuario todavía no tiene una empresa asignada.</p>
          <p className="text-xs text-white/35 mt-1">Pide al administrador de tu cuenta que te asigne una desde Usuarios y Roles.</p>
        </div>
      )}

      {empresaId && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="rounded-2xl border border-white/10 bg-[var(--color-bg-1)]/40 p-4">
            <p className="text-[11px] text-white/40 mb-1.5">Ventas del mes</p>
            <p className="font-display-serif text-2xl text-white leading-none">{loading ? '—' : fmt(kpis.ventasMes)}</p>
            <p className="text-[11px] text-white/30 mt-1.5">{kpis.facturasMes} facturas</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[var(--color-bg-1)]/40 p-4">
            <p className="text-[11px] text-white/40 mb-1.5">Por cobrar</p>
            <p className="font-display-serif text-2xl leading-none" style={{ color: kpis.cxcPendiente > 0 ? 'var(--color-amber-400)' : '#e7ecf5' }}>
              {loading ? '—' : fmt(kpis.cxcPendiente)}
            </p>
            <p className="text-[11px] text-white/30 mt-1.5">saldo pendiente de clientes</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[var(--color-bg-1)]/40 p-4">
            <p className="text-[11px] text-white/40 mb-1.5">Facturado hoy</p>
            <p className="font-display-serif text-2xl text-white leading-none">{loading ? '—' : kpis.facturasHoy}</p>
            <p className="text-[11px] text-white/30 mt-1.5">documentos emitidos</p>
          </div>
          <Link to="/ats" className="rounded-2xl border border-white/10 bg-[var(--color-bg-1)]/40 p-4 hover:border-[var(--color-gold)]/40 transition-colors group">
            <p className="text-[11px] text-white/40 mb-1.5">Cumplimiento SRI</p>
            <p className="font-display-serif text-2xl text-white leading-none group-hover:text-[var(--color-gold)] transition-colors">ATS →</p>
            <p className="text-[11px] text-white/30 mt-1.5">generar anexo del mes</p>
          </Link>
        </div>
      )}

      {esSuperAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="rounded-2xl border border-white/10 bg-[var(--color-bg-1)]/40 p-4">
            <p className="text-[11px] text-white/40 mb-1.5">Empresas activas</p>
            <p className="font-display-serif text-2xl text-white leading-none">{conteoEmpresas ?? '—'}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[var(--color-bg-1)]/40 p-4">
            <p className="text-[11px] text-white/40 mb-1.5">Usuarios en el sistema</p>
            <p className="font-display-serif text-2xl text-white leading-none">{conteoUsuarios ?? '—'}</p>
          </div>
          <Link to="/admin" className="rounded-2xl border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/[0.06] p-4 hover:bg-[var(--color-gold)]/[0.1] transition-colors col-span-2 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-white/50 mb-1">Administración</p>
              <p className="text-sm text-white font-medium">Crear empresa, gestionar usuarios y roles</p>
            </div>
            <span className="text-[var(--color-gold)] text-lg" aria-hidden>→</span>
          </Link>
        </div>
      )}

      {empresaId && (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-medium text-white/60">Actividad reciente</span>
            <Link to="/auditoria" className="text-[11px] text-blue-300 hover:underline">
              Ver todo →
            </Link>
          </div>
          {actividad.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-white/30">Sin actividad registrada todavía.</div>
          ) : (
            <ul>
              {actividad.map((a) => (
                <li key={a.id} className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between text-xs">
                  <span className="text-white/60">
                    <span className="text-white/85 font-medium">{a.usuario_nombre}</span>{' '}
                    {a.accion === 'crear' ? 'creó' : a.accion === 'editar' ? 'editó' : a.accion === 'eliminar' ? 'eliminó' : 'inició sesión'}
                    {a.tabla !== 'sesion' && ` ${NOMBRES_TABLA[a.tabla] || a.tabla}`}
                  </span>
                  <span className="text-white/30 whitespace-nowrap ml-3">{new Date(a.created_at).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
