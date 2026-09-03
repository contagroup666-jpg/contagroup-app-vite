import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { calcularNominaMensual, calcularDecimos } from '../../lib/motorContable'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'
import EstadoVacio from '../../components/EstadoVacio'

type Empleado = Database['public']['Tables']['empleados']['Row']
type Nomina = Database['public']['Tables']['nomina']['Row']
type DetalleNomina = Database['public']['Tables']['detalle_nomina']['Row']

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function fmt(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n || 0)
}

const EMP_VACIO = {
  nombre: '',
  cedula: '',
  cargo: '',
  salario: '0',
  fecha_ingreso: new Date().toISOString().slice(0, 10),
  tipo_contrato: 'Indefinido',
  telefono: '',
  email: '',
  banco: '',
  num_cuenta: '',
  tipo_cuenta: 'Ahorros',
}

function mesesEntre(desde: string, hoy = new Date()) {
  const d = new Date(desde + 'T00:00:00')
  return Math.max(0, (hoy.getFullYear() - d.getFullYear()) * 12 + (hoy.getMonth() - d.getMonth()))
}

export default function NominaPage() {
  const { perfil } = useAuth()
  const empresaId = perfil?.empresa_id ?? null
  const [tab, setTab] = useState<'roles' | 'empleados' | 'decimos'>('roles')

  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [nominas, setNominas] = useState<Nomina[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editandoEmp, setEditandoEmp] = useState<Empleado | null>(null)
  const [formEmp, setFormEmp] = useState(EMP_VACIO)
  const [mostrarFormEmp, setMostrarFormEmp] = useState(false)
  const [errorEmp, setErrorEmp] = useState<string | null>(null)
  const [guardandoEmp, setGuardandoEmp] = useState(false)

  const [mostrarCalculo, setMostrarCalculo] = useState(false)
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [calculando, setCalculando] = useState(false)
  const [errorCalculo, setErrorCalculo] = useState<string | null>(null)

  const [verDetalle, setVerDetalle] = useState<Nomina | null>(null)
  const [detalle, setDetalle] = useState<DetalleNomina[]>([])
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  const [decIngresos, setDecIngresos] = useState('0')
  const [decMeses, setDecMeses] = useState('12')
  const [decResultado, setDecResultado] = useState<Awaited<ReturnType<typeof calcularDecimos>> | null>(null)
  const [decError, setDecError] = useState<string | null>(null)
  const [decCalculando, setDecCalculando] = useState(false)

  async function cargar() {
    if (!empresaId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [empRes, nomRes] = await Promise.all([
      supabase.from('empleados').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('nomina').select('*').eq('empresa_id', empresaId).order('periodo', { ascending: false }),
    ])
    if (empRes.error) setError(empRes.error.message)
    else setEmpleados((empRes.data ?? []) as unknown as Empleado[])
    setNominas((nomRes.data ?? []) as unknown as Nomina[])
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  // ── Empleados ──
  function abrirNuevoEmp() {
    setEditandoEmp(null)
    setFormEmp(EMP_VACIO)
    setErrorEmp(null)
    setMostrarFormEmp(true)
  }
  function abrirEditarEmp(e: Empleado) {
    setEditandoEmp(e)
    setFormEmp({
      nombre: e.nombre,
      cedula: e.cedula ?? '',
      cargo: e.cargo ?? '',
      salario: String(e.salario ?? 0),
      fecha_ingreso: e.fecha_ingreso ?? new Date().toISOString().slice(0, 10),
      tipo_contrato: e.tipo_contrato ?? 'Indefinido',
      telefono: e.telefono ?? '',
      email: e.email ?? '',
      banco: e.banco ?? '',
      num_cuenta: e.num_cuenta ?? '',
      tipo_cuenta: e.tipo_cuenta ?? 'Ahorros',
    })
    setErrorEmp(null)
    setMostrarFormEmp(true)
  }
  async function handleSubmitEmp(e: FormEvent) {
    e.preventDefault()
    if (!formEmp.nombre.trim()) {
      setErrorEmp('El nombre es obligatorio.')
      return
    }
    if (!empresaId) return
    setGuardandoEmp(true)
    setErrorEmp(null)
    const payload = {
      nombre: formEmp.nombre.trim(),
      cedula: formEmp.cedula.trim() || null,
      cargo: formEmp.cargo.trim() || null,
      salario: parseFloat(formEmp.salario) || 0,
      fecha_ingreso: formEmp.fecha_ingreso || null,
      tipo_contrato: formEmp.tipo_contrato,
      telefono: formEmp.telefono.trim() || null,
      email: formEmp.email.trim() || null,
      banco: formEmp.banco.trim() || null,
      num_cuenta: formEmp.num_cuenta.trim() || null,
      tipo_cuenta: formEmp.tipo_cuenta,
    }
    const resultado = editandoEmp
      ? await supabase.from('empleados').update(payload).eq('id', editandoEmp.id)
      : await supabase.from('empleados').insert({ ...payload, empresa_id: empresaId })
    setGuardandoEmp(false)
    if (resultado.error) {
      setErrorEmp(resultado.error.message)
      return
    }
    setMostrarFormEmp(false)
    await cargar()
  }
  async function handleEliminarEmp(e: Empleado) {
    if (!confirm(`¿Eliminar a "${e.nombre}"?`)) return
    const { error: err } = await supabase.from('empleados').delete().eq('id', e.id)
    if (err) {
      setError(`No se pudo eliminar (verifica que no tenga roles de pago asociados): ${err.message}`)
      return
    }
    await cargar()
  }

  // ── Cálculo de rol ──
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`
  const yaExiste = nominas.some((n) => n.periodo === periodo)

  async function handleCalcularRol() {
    if (!empresaId || empleados.length === 0) return
    setCalculando(true)
    setErrorCalculo(null)
    try {
      let totalBruto = 0
      let totalIess = 0
      let totalNeto = 0
      const filasDetalle: Database['public']['Tables']['detalle_nomina']['Insert'][] = []
      const fechaCorte = new Date(anio, mes - 1, 1).toISOString().slice(0, 10)

      for (const emp of empleados) {
        const meses = mesesEntre(emp.fecha_ingreso ?? fechaCorte, new Date(anio, mes - 1, 1))
        const resultado = await calcularNominaMensual({ sueldoMensual: emp.salario, mesesAntiguedad: meses })
        totalBruto += resultado.ingresos.totalIngresos
        totalIess += resultado.descuentos.aportePersonalIESS
        totalNeto += resultado.netoAPagar

        filasDetalle.push(
          { empresa_id: empresaId, empleado_id: emp.id, codigo: 'SUELDO', descripcion: 'Sueldo mensual', tipo: 'ingreso', valor: resultado.ingresos.sueldoMensual, fecha: fechaCorte, periodo },
          { empresa_id: empresaId, empleado_id: emp.id, codigo: 'IESS_PERS', descripcion: 'Aporte personal IESS (9.45%)', tipo: 'descuento', valor: resultado.descuentos.aportePersonalIESS, fecha: fechaCorte, periodo },
          { empresa_id: empresaId, empleado_id: emp.id, codigo: 'IESS_PATR', descripcion: 'Aporte patronal IESS (11.15%)', tipo: 'informativo', valor: resultado.aportesPatronales.aportePatronalIESS, fecha: fechaCorte, periodo },
          { empresa_id: empresaId, empleado_id: emp.id, codigo: 'NETO', descripcion: 'Neto a pagar', tipo: 'informativo', valor: resultado.netoAPagar, fecha: fechaCorte, periodo }
        )
      }

      const { error: errNom } = await supabase.from('nomina').insert({
        empresa_id: empresaId,
        periodo,
        cant_empleados: empleados.length,
        total_bruto: totalBruto,
        total_iess: totalIess,
        total_neto: totalNeto,
        estado: 'Calculado',
      })
      if (errNom) throw new Error(errNom.message)

      const { error: errDet } = await supabase.from('detalle_nomina').insert(filasDetalle)
      if (errDet) throw new Error(errDet.message)

      setMostrarCalculo(false)
      await cargar()
    } catch (e) {
      setErrorCalculo((e as Error).message)
    } finally {
      setCalculando(false)
    }
  }

  async function abrirDetalle(n: Nomina) {
    setVerDetalle(n)
    setCargandoDetalle(true)
    const { data } = await supabase.from('detalle_nomina').select('*').eq('empresa_id', n.empresa_id).eq('periodo', n.periodo)
    setDetalle((data ?? []) as unknown as DetalleNomina[])
    setCargandoDetalle(false)
  }

  const nombreEmpleado = (id: string) => empleados.find((e) => e.id === id)?.nombre ?? 'N/D'
  const detallePorEmpleado = useMemo(() => {
    const grupos: Record<string, DetalleNomina[]> = {}
    detalle.forEach((d) => {
      grupos[d.empleado_id] = grupos[d.empleado_id] || []
      grupos[d.empleado_id].push(d)
    })
    return grupos
  }, [detalle])

  async function handleCalcularDecimos(e: FormEvent) {
    e.preventDefault()
    setDecCalculando(true)
    setDecError(null)
    setDecResultado(null)
    try {
      const resultado = await calcularDecimos({ sumaIngresosAnuales: parseFloat(decIngresos) || 0, mesesTrabajadosEnPeriodo: parseInt(decMeses) || 12 })
      setDecResultado(resultado)
    } catch (err) {
      setDecError((err as Error).message)
    } finally {
      setDecCalculando(false)
    }
  }

  if (!empresaId) {
    return (
      <div className="p-6">
        <p className="text-sm text-white/60">Tu usuario no tiene una empresa activa asignada.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Nómina y RRHH</h2>
          <p className="text-xs text-white/40 mt-0.5">Roles de pago y empleados — cálculo real vía motor contable (IESS Ecuador 2026)</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={abrirNuevoEmp} className="rounded-lg border border-white/10 text-white/60 text-xs font-semibold px-3 py-1.5 hover:bg-white/5 transition-colors">+ Empleado</button>
          <button
            onClick={() => {
              setErrorCalculo(null)
              setMostrarCalculo(true)
            }}
            className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[var(--color-blue-6)] transition-colors"
          >
            + Calcular Rol
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-white/10">
        <button onClick={() => setTab('roles')} className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === 'roles' ? 'border-[var(--color-blue-5)] text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}>📋 Roles de Pago</button>
        <button onClick={() => setTab('empleados')} className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === 'empleados' ? 'border-[var(--color-blue-5)] text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}>👥 Empleados</button>
        <button onClick={() => setTab('decimos')} className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === 'decimos' ? 'border-[var(--color-blue-5)] text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}>🧮 Décimos</button>
      </div>

      {error && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>}
      {loading && <p className="text-xs text-white/40">Cargando…</p>}

      {!loading && tab === 'roles' && (
        <>
          {nominas.length === 0 ? (
            <EstadoVacio icono="📋" titulo="Sin roles de pago calculados" descripcion="Registra empleados y calcula el primer rol." accion={{ label: '+ Calcular Rol', onClick: () => setMostrarCalculo(true) }} />
          ) : (
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">Período</th>
                    <th className="px-4 py-2 font-medium text-center">Empl.</th>
                    <th className="px-4 py-2 font-medium text-right">Bruto</th>
                    <th className="px-4 py-2 font-medium text-right">IESS</th>
                    <th className="px-4 py-2 font-medium text-right">Neto</th>
                    <th className="px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {nominas.map((n) => (
                    <tr key={n.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5 text-white font-mono text-xs">{n.periodo}</td>
                      <td className="px-4 py-2.5 text-white/60 text-center">{n.cant_empleados}</td>
                      <td className="px-4 py-2.5 text-right text-white/70">{fmt(n.total_bruto)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-400/80">{fmt(n.total_iess)}</td>
                      <td className="px-4 py-2.5 text-right text-white font-medium">{fmt(n.total_neto)}</td>
                      <td className="px-4 py-2.5"><span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">{n.estado}</span></td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => abrirDetalle(n)} className="text-[11px] text-[var(--color-blue-4)] hover:underline">Ver detalle</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!loading && tab === 'empleados' && (
        <>
          {empleados.length === 0 ? (
            <EstadoVacio icono="👥" titulo="Sin empleados" descripcion="Registra tu primer empleado." accion={{ label: '+ Empleado', onClick: abrirNuevoEmp }} />
          ) : (
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">Nombre</th>
                    <th className="px-4 py-2 font-medium">Cédula</th>
                    <th className="px-4 py-2 font-medium">Cargo</th>
                    <th className="px-4 py-2 font-medium text-right">Salario</th>
                    <th className="px-4 py-2 font-medium">Ingreso</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {empleados.map((e) => (
                    <tr key={e.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5 text-white">{e.nombre}</td>
                      <td className="px-4 py-2.5 text-white/60 text-xs font-mono">{e.cedula || '—'}</td>
                      <td className="px-4 py-2.5 text-white/60 text-xs">{e.cargo || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-white font-medium">{fmt(e.salario)}</td>
                      <td className="px-4 py-2.5 text-white/60 text-xs">{e.fecha_ingreso || '—'}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => abrirEditarEmp(e)} className="text-[11px] text-white/50 hover:text-white mr-3">Editar</button>
                        <button onClick={() => handleEliminarEmp(e)} className="text-[11px] text-red-400/70 hover:text-red-400">Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!loading && tab === 'decimos' && (
        <div className="max-w-sm">
          <p className="text-xs text-white/40 mb-4">Décimo tercero (1/12 de lo percibido en el año) y décimo cuarto (1 SBU, proporcional) — calculado por el motor contable.</p>
          <form onSubmit={handleCalcularDecimos} className="space-y-3">
            <div>
              <label className="block text-xs text-white/50 mb-1">Suma de ingresos del año</label>
              <input type="number" step="0.01" value={decIngresos} onChange={(e) => setDecIngresos(e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Meses trabajados en el período</label>
              <input type="number" min="0" max="12" value={decMeses} onChange={(e) => setDecMeses(e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
            </div>
            {decError && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{decError}</p>}
            <button type="submit" disabled={decCalculando} className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-4 py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">{decCalculando ? 'Calculando…' : 'Calcular'}</button>
          </form>

          {decResultado && (
            <div className="mt-4 rounded-xl border border-white/10 p-4 space-y-2">
              <div className="flex justify-between text-xs"><span className="text-white/50">Décimo tercero (mensualizado)</span><span className="text-white">{fmt(decResultado.decimoTerceroMensualizado)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-white/50">Décimo tercero (anual)</span><span className="text-white font-medium">{fmt(decResultado.decimoTerceroAnual)}</span></div>
              <div className="flex justify-between text-xs border-t border-white/10 pt-2"><span className="text-white/50">Décimo cuarto (mensualizado)</span><span className="text-white">{fmt(decResultado.decimoCuartoMensualizado)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-white/50">Décimo cuarto (anual)</span><span className="text-white font-medium">{fmt(decResultado.decimoCuartoAnual)}</span></div>
            </div>
          )}
        </div>
      )}

      {mostrarFormEmp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setMostrarFormEmp(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-4">{editandoEmp ? 'Editar empleado' : 'Nuevo empleado'}</h3>
            <form onSubmit={handleSubmitEmp} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Nombre *</label>
                <input autoFocus value={formEmp.nombre} onChange={(e) => setFormEmp({ ...formEmp, nombre: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Cédula</label>
                  <input value={formEmp.cedula} onChange={(e) => setFormEmp({ ...formEmp, cedula: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Cargo</label>
                  <input value={formEmp.cargo} onChange={(e) => setFormEmp({ ...formEmp, cargo: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Salario mensual</label>
                  <input type="number" step="0.01" value={formEmp.salario} onChange={(e) => setFormEmp({ ...formEmp, salario: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Fecha de ingreso</label>
                  <input type="date" value={formEmp.fecha_ingreso} onChange={(e) => setFormEmp({ ...formEmp, fecha_ingreso: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Tipo de contrato</label>
                <select value={formEmp.tipo_contrato} onChange={(e) => setFormEmp({ ...formEmp, tipo_contrato: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                  <option value="Indefinido">Indefinido</option>
                  <option value="Plazo Fijo">Plazo Fijo</option>
                  <option value="Ocasional">Ocasional</option>
                  <option value="Prácticas">Prácticas</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Teléfono</label>
                  <input value={formEmp.telefono} onChange={(e) => setFormEmp({ ...formEmp, telefono: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Email</label>
                  <input type="email" value={formEmp.email} onChange={(e) => setFormEmp({ ...formEmp, email: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Banco</label>
                  <input value={formEmp.banco} onChange={(e) => setFormEmp({ ...formEmp, banco: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Nº cuenta</label>
                  <input value={formEmp.num_cuenta} onChange={(e) => setFormEmp({ ...formEmp, num_cuenta: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Tipo</label>
                  <select value={formEmp.tipo_cuenta} onChange={(e) => setFormEmp({ ...formEmp, tipo_cuenta: e.target.value })} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                    <option value="Ahorros">Ahorros</option>
                    <option value="Corriente">Corriente</option>
                  </select>
                </div>
              </div>
              {errorEmp && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{errorEmp}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setMostrarFormEmp(false)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">Cancelar</button>
                <button type="submit" disabled={guardandoEmp} className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">{guardandoEmp ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mostrarCalculo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setMostrarCalculo(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Calcular rol de pago</h3>
            <p className="text-xs text-white/40 mb-4">Calcula IESS, fondo de reserva y neto para los {empleados.length} empleado{empleados.length === 1 ? '' : 's'} activos, vía el motor contable.</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Mes</label>
                <select value={mes} onChange={(e) => setMes(parseInt(e.target.value))} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]">
                  {MESES.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Año</label>
                <input type="number" value={anio} onChange={(e) => setAnio(parseInt(e.target.value))} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]" />
              </div>
            </div>
            {yaExiste && <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2 mb-3">Ya existe un rol calculado para {periodo}. Calcular de nuevo creará un registro duplicado.</p>}
            {empleados.length === 0 && <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-2 mb-3">No hay empleados registrados.</p>}
            {errorCalculo && <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">{errorCalculo}</p>}
            <div className="flex gap-2">
              <button onClick={() => setMostrarCalculo(false)} className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">Cancelar</button>
              <button onClick={handleCalcularRol} disabled={calculando || empleados.length === 0} className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60">{calculando ? 'Calculando…' : 'Calcular'}</button>
            </div>
          </div>
        </div>
      )}

      {verDetalle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setVerDetalle(null)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-lg my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Detalle del rol — {verDetalle.periodo}</h3>
            <p className="text-xs text-white/40 mb-4">Bruto {fmt(verDetalle.total_bruto)} · IESS {fmt(verDetalle.total_iess)} · Neto {fmt(verDetalle.total_neto)}</p>
            {cargandoDetalle && <p className="text-xs text-white/40">Cargando…</p>}
            {!cargandoDetalle && (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {Object.entries(detallePorEmpleado).map(([empId, filas]) => (
                  <div key={empId} className="rounded-lg border border-white/10 p-3">
                    <p className="text-xs font-semibold text-white mb-2">{nombreEmpleado(empId)}</p>
                    {filas.map((f) => (
                      <div key={f.id} className="flex justify-between text-[11px] text-white/60">
                        <span>{f.descripcion}</span>
                        <span className={f.tipo === 'descuento' ? 'text-red-400' : f.tipo === 'ingreso' ? 'text-emerald-400' : 'text-white/50'}>{f.tipo === 'descuento' ? '−' : ''}{fmt(f.valor)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setVerDetalle(null)} className="w-full mt-4 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}
