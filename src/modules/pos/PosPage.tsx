import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { crearAsiento } from '../../lib/contabilidad'
import { useAuth } from '../../context/AuthContext'
import type { Database, PagoPos } from '../../types/database'

type Producto = Database['public']['Tables']['productos']['Row']
type Turno = Database['public']['Tables']['pos_turnos']['Row']
type Config = Database['public']['Tables']['config_cuentas_contables']['Row']

type TipoDoc = 'NOTA_VENTA' | 'FACTURA'
type ItemCarrito = { producto_id: string; nombre: string; precio: number; costo: number; cantidad: number }

function fmt(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n || 0)
}

const IVA_RATE = 0.12

export default function PosPage() {
  const { perfil } = useAuth()
  const empresaId = perfil?.empresa_id ?? null

  const [turno, setTurno] = useState<Turno | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [clientes, setClientes] = useState<{ id: string; nombre: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [montoInicial, setMontoInicial] = useState('')
  const [abriendo, setAbriendo] = useState(false)

  const [q, setQ] = useState('')
  const [carrito, setCarrito] = useState<ItemCarrito[]>([])
  const [tipoDoc, setTipoDoc] = useState<TipoDoc>('NOTA_VENTA')
  const [clienteId, setClienteId] = useState('')
  const [pagos, setPagos] = useState<PagoPos[]>([{ metodo: 'Efectivo', monto: 0 }])
  const [procesando, setProcesando] = useState(false)
  const [errorVenta, setErrorVenta] = useState<string | null>(null)
  const [ultimaVenta, setUltimaVenta] = useState<{ numero: string; total: number } | null>(null)

  const [mostrarCierre, setMostrarCierre] = useState(false)
  const [contado, setContado] = useState('')
  const [cerrando, setCerrando] = useState(false)

  async function cargar() {
    if (!empresaId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [turnoRes, configRes] = await Promise.all([
      supabase.from('pos_turnos').select('*').eq('empresa_id', empresaId).eq('estado', 'ABIERTO').maybeSingle(),
      supabase.from('config_cuentas_contables').select('*').eq('empresa_id', empresaId).maybeSingle(),
    ])
    if (turnoRes.error) {
      setError(turnoRes.error.message)
      setLoading(false)
      return
    }
    setConfig((configRes.data as unknown as Config) ?? null)
    setTurno((turnoRes.data as unknown as Turno) ?? null)
    if (turnoRes.data) {
      const [prodRes, cliRes] = await Promise.all([
        supabase.from('productos').select('*').eq('empresa_id', empresaId).order('nombre'),
        supabase.from('clientes').select('id,nombre').eq('empresa_id', empresaId).order('nombre'),
      ])
      setProductos((prodRes.data ?? []) as unknown as Producto[])
      setClientes((cliRes.data ?? []) as { id: string; nombre: string }[])
    }
    setError(null)
    setLoading(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  const resultadosBusqueda = useMemo(() => {
    const term = q.toLowerCase().trim()
    if (!term) return []
    return productos
      .filter((p) => p.nombre.toLowerCase().includes(term) || p.codigo.toLowerCase().includes(term))
      .slice(0, 8)
  }, [q, productos])

  const { sub, iva, tot } = useMemo(() => {
    const s = carrito.reduce((a, i) => a + i.precio * i.cantidad, 0)
    const v = s * IVA_RATE
    return { sub: s, iva: v, tot: s + v }
  }, [carrito])

  const pagado = pagos.reduce((a, p) => a + (Number(p.monto) || 0), 0)
  const restante = tot - pagado

  useEffect(() => {
    if (pagos.length === 1) setPagos([{ ...pagos[0], monto: parseFloat(tot.toFixed(2)) }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tot])

  async function handleAbrirCaja() {
    if (!empresaId) return
    setAbriendo(true)
    const { error: err } = await supabase.from('pos_turnos').insert({
      empresa_id: empresaId,
      cajero_id: perfil?.id ?? null,
      cajero_nombre: perfil?.nombre ?? '—',
      fecha_apertura: new Date().toISOString(),
      monto_inicial: parseFloat(montoInicial) || 0,
      estado: 'ABIERTO',
    })
    setAbriendo(false)
    if (err) {
      setError(err.message)
      return
    }
    setMontoInicial('')
    await cargar()
  }

  function agregarProducto(p: Producto) {
    if (p.stock <= 0) {
      setErrorVenta(`"${p.nombre}" no tiene stock disponible.`)
      return
    }
    setErrorVenta(null)
    setCarrito((prev) => {
      const ex = prev.find((i) => i.producto_id === p.id)
      if (ex) {
        if (ex.cantidad + 1 > p.stock) {
          setErrorVenta('No hay suficiente stock.')
          return prev
        }
        return prev.map((i) => (i.producto_id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i))
      }
      return [...prev, { producto_id: p.id, nombre: p.nombre, precio: p.precio, costo: p.costo || 0, cantidad: 1 }]
    })
    setQ('')
  }

  function cambiarCantidad(idx: number, delta: number) {
    setCarrito((prev) => {
      const it = prev[idx]
      if (!it) return prev
      const prod = productos.find((p) => p.id === it.producto_id)
      const nueva = it.cantidad + delta
      if (nueva <= 0) return prev.filter((_, i) => i !== idx)
      if (prod && nueva > prod.stock) {
        setErrorVenta('No hay suficiente stock.')
        return prev
      }
      return prev.map((i, ix) => (ix === idx ? { ...i, cantidad: nueva } : i))
    })
  }

  function quitarItem(idx: number) {
    setCarrito((prev) => prev.filter((_, i) => i !== idx))
  }

  function agregarPago() {
    setPagos((prev) => [...prev, { metodo: 'Efectivo', monto: Math.max(0, parseFloat(restante.toFixed(2))) }])
  }

  function actualizarPago(idx: number, cambio: Partial<PagoPos>) {
    setPagos((prev) => prev.map((p, i) => (i === idx ? { ...p, ...cambio } : p)))
  }

  function quitarPago(idx: number) {
    setPagos((prev) => prev.filter((_, i) => i !== idx))
  }

  function limpiarVenta() {
    setCarrito([])
    setPagos([{ metodo: 'Efectivo', monto: 0 }])
    setClienteId('')
    setTipoDoc('NOTA_VENTA')
  }

  async function confirmarVenta() {
    if (!empresaId) return
    if (carrito.length === 0) {
      setErrorVenta('Agrega productos al carrito.')
      return
    }
    if (Math.abs(pagado - tot) > 0.02) {
      setErrorVenta('Los pagos no cuadran con el total.')
      return
    }
    const necesitaCliente = tipoDoc === 'FACTURA' || pagos.some((p) => p.metodo === 'Credito')
    if (necesitaCliente && !clienteId) {
      setErrorVenta('Selecciona un cliente (requerido para Factura o Crédito).')
      return
    }

    setProcesando(true)
    setErrorVenta(null)
    try {
      for (const it of carrito) {
        const prod = productos.find((p) => p.id === it.producto_id)
        if (!prod || prod.stock < it.cantidad) {
          throw new Error(`Sin stock suficiente de ${it.nombre}.`)
        }
      }

      const clienteNombre = necesitaCliente ? clientes.find((c) => c.id === clienteId)?.nombre ?? 'Cliente' : 'Consumidor Final'

      const { count } = await supabase
        .from('facturas')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .eq('origen', 'POS')
        .eq('tipo_doc', tipoDoc)
      const previos = count || 0
      const numero = tipoDoc === 'FACTURA' ? `001-001-${String(previos + 1).padStart(9, '0')}` : `NV-${String(previos + 1).padStart(6, '0')}`

      const { data: nuevaFactura, error: facErr } = await supabase
        .from('facturas')
        .insert({
          empresa_id: empresaId,
          numero,
          cliente_id: necesitaCliente ? clienteId : null,
          cliente_nombre: clienteNombre,
          cajero_nombre: perfil?.nombre ?? '—',
          cajero_id: perfil?.id ?? null,
          fecha: new Date().toISOString().slice(0, 10),
          subtotal: sub,
          iva,
          total: tot,
          estado: 'Autorizada',
          origen: 'POS',
          tipo_doc: tipoDoc,
          turno_id: turno?.id ?? null,
          pagos,
          items: carrito.map((i) => ({ producto_id: i.producto_id, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio, costo: i.costo })),
        })
        .select()
        .single()
      if (facErr) throw new Error(facErr.message)

      await supabase.from('factura_items').insert(
        carrito.map((it, i) => ({
          factura_id: nuevaFactura.id,
          nombre: it.nombre,
          cantidad: it.cantidad,
          precio: it.precio,
          total: it.precio * it.cantidad,
          orden: i,
        }))
      )

      for (const it of carrito) {
        const prod = productos.find((p) => p.id === it.producto_id)
        if (prod) {
          await supabase.from('productos').update({ stock: (prod.stock || 0) - it.cantidad }).eq('id', it.producto_id)
        }
        await supabase.from('movimientos_inv').insert({
          empresa_id: empresaId,
          producto_id: it.producto_id,
          tipo: 'salida',
          cantidad: it.cantidad,
          costo_unitario: it.costo,
          vr_unitario: it.costo,
          ref: 'POS',
          factura_id: String(nuevaFactura.id),
          nota: `Venta POS ${numero}`,
        })
      }

      // Contabilización real vía fn_crear_asiento, usando el mapeo de cuentas
      // configurado para esta empresa (nunca códigos hardcodeados — ver
      // ConfigContablePage). Si falta algún mapeo, se avisa y NO se contabiliza
      // nada a medias; la venta queda registrada igual, para asentar manual.
      const costoTotal = carrito.reduce((a, i) => a + (i.costo || 0) * i.cantidad, 0)
      const metodosUsados = new Set(pagos.filter((p) => p.monto > 0).map((p) => p.metodo))
      const necesita: string[] = []
      if (metodosUsados.has('Efectivo') && !config?.cuenta_caja_id) necesita.push('Caja')
      if ((metodosUsados.has('Tarjeta') || metodosUsados.has('Transferencia')) && !config?.cuenta_bancos_id) necesita.push('Bancos')
      if (metodosUsados.has('Credito') && !config?.cuenta_cxc_id) necesita.push('Cuentas por Cobrar')
      if (!config?.cuenta_ventas_id) necesita.push('Ventas')
      if (!config?.cuenta_iva_id) necesita.push('IVA por Pagar')
      if (costoTotal > 0 && (!config?.cuenta_inventario_id || !config?.cuenta_costo_ventas_id)) necesita.push('Inventario/Costo de Ventas')

      if (necesita.length > 0) {
        setUltimaVenta({ numero, total: tot })
        limpiarVenta()
        await cargar()
        setErrorVenta(
          `Venta ${numero} registrada, pero NO se contabilizó: falta configurar la(s) cuenta(s) ${necesita.join(', ')} en Configuración contable.`
        )
        return
      }

      const lineas = []
      for (const p of pagos) {
        const monto = Number(p.monto) || 0
        if (monto <= 0) continue
        if (p.metodo === 'Efectivo') lineas.push({ cuenta_id: config!.cuenta_caja_id!, debe: monto, haber: 0 })
        else if (p.metodo === 'Credito') lineas.push({ cuenta_id: config!.cuenta_cxc_id!, debe: monto, haber: 0 })
        else lineas.push({ cuenta_id: config!.cuenta_bancos_id!, debe: monto, haber: 0 })
      }
      lineas.push({ cuenta_id: config!.cuenta_ventas_id!, debe: 0, haber: sub })
      if (iva > 0) lineas.push({ cuenta_id: config!.cuenta_iva_id!, debe: 0, haber: iva })
      if (costoTotal > 0) {
        lineas.push({ cuenta_id: config!.cuenta_costo_ventas_id!, debe: costoTotal, haber: 0 })
        lineas.push({ cuenta_id: config!.cuenta_inventario_id!, debe: 0, haber: costoTotal })
      }

      try {
        await crearAsiento({
          empresaId,
          concepto: `Venta POS ${numero}`,
          fecha: new Date().toISOString().slice(0, 10),
          lineas,
          prefijo: 'POS',
          creadoPor: perfil?.id ?? null,
        })
      } catch (asientoErr) {
        setUltimaVenta({ numero, total: tot })
        limpiarVenta()
        await cargar()
        setErrorVenta(
          `Venta ${numero} registrada, pero el asiento contable falló: ${(asientoErr as Error).message}. Regístralo manualmente en Libro Diario.`
        )
        return
      }

      setUltimaVenta({ numero, total: tot })
      limpiarVenta()
      await cargar()
    } catch (e) {
      setErrorVenta((e as Error).message)
    } finally {
      setProcesando(false)
    }
  }

  async function abrirCierre() {
    setContado('')
    setMostrarCierre(true)
  }

  async function handleCerrarCaja() {
    if (!turno || !empresaId) return
    setCerrando(true)
    const { data: facsD } = await supabase.from('facturas').select('*').eq('empresa_id', empresaId).eq('turno_id', turno.id).eq('origen', 'POS')
    const facs = (facsD ?? []) as unknown as Database['public']['Tables']['facturas']['Row'][]
    const porMetodo: Record<string, number> = { Efectivo: 0, Tarjeta: 0, Transferencia: 0, Credito: 0 }
    facs.forEach((f) => (f.pagos ?? []).forEach((p) => (porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + (p.monto || 0))))
    const esperado = (turno.monto_inicial || 0) + (porMetodo.Efectivo || 0)
    const declarado = parseFloat(contado) || 0

    const { error: err } = await supabase
      .from('pos_turnos')
      .update({
        estado: 'CERRADO',
        fecha_cierre: new Date().toISOString(),
        monto_final_declarado: declarado,
        monto_calculado: esperado,
        diferencia: parseFloat((declarado - esperado).toFixed(2)),
        totales_por_metodo: porMetodo,
      })
      .eq('id', turno.id)

    setCerrando(false)
    if (err) {
      setError(err.message)
      return
    }
    setMostrarCierre(false)
    await cargar()
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
          <h2 className="text-base font-semibold text-white">Punto de Venta</h2>
          <p className="text-xs text-white/40 mt-0.5">
            {loading
              ? 'Cargando…'
              : turno
              ? `Turno abierto · ${turno.cajero_nombre} · desde ${new Date(turno.fecha_apertura).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}`
              : 'Caja cerrada'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/config-contable" className="text-[11px] text-white/40 hover:text-white/70 underline">
            ⚙️ Configuración contable
          </Link>
          {turno && (
            <button
              onClick={abrirCierre}
              className="rounded-lg border border-white/10 text-white/60 text-xs font-semibold px-3 py-1.5 hover:bg-white/5 transition-colors"
            >
              🔒 Cerrar caja
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {ultimaVenta && !errorVenta && (
        <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 mb-4">
          ✓ {ultimaVenta.numero} registrada por {fmt(ultimaVenta.total)} — nueva venta lista.
        </p>
      )}

      {loading && <p className="text-xs text-white/40">Cargando…</p>}

      {!loading && !turno && (
        <div className="rounded-xl border border-white/10 p-10 text-center max-w-sm mx-auto">
          <div className="text-3xl mb-2">🧾</div>
          <p className="text-sm font-medium text-white mb-1">Caja cerrada</p>
          <p className="text-xs text-white/40 mb-5">Abre un turno para empezar a vender.</p>
          <label className="block text-xs text-white/50 mb-1 text-left">Monto inicial en efectivo</label>
          <input
            type="number"
            step="0.01"
            value={montoInicial}
            onChange={(e) => setMontoInicial(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)] mb-3"
          />
          <button
            onClick={handleAbrirCaja}
            disabled={abriendo}
            className="w-full rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60"
          >
            {abriendo ? 'Abriendo…' : 'Abrir caja'}
          </button>
        </div>
      )}

      {!loading && turno && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-4 items-start">
          <div className="rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-2 border border-white/10 rounded-lg px-3 mb-3">
              <span className="text-white/40">🔍</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar producto…"
                className="flex-1 bg-transparent border-none outline-none text-sm text-white py-2"
              />
            </div>
            {resultadosBusqueda.length > 0 && (
              <div className="mb-3 flex flex-col gap-1 max-h-48 overflow-auto">
                {resultadosBusqueda.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => agregarProducto(p)}
                    disabled={p.stock <= 0}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-white/10 text-left hover:bg-white/5 disabled:opacity-40 transition-colors"
                  >
                    <div>
                      <p className="text-xs font-medium text-white">{p.nombre}</p>
                      <p className="text-[11px] text-white/40">Stock: {p.stock <= 0 ? 'Agotado' : p.stock}</p>
                    </div>
                    <span className="text-xs font-semibold text-[var(--color-blue-4)]">{fmt(p.precio)}</span>
                  </button>
                ))}
              </div>
            )}

            {carrito.length === 0 ? (
              <p className="text-xs text-white/30 text-center py-10">Sin productos — busca uno arriba</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-white/40">
                    <th className="pb-2 font-medium">Producto</th>
                    <th className="pb-2 font-medium text-center">Cant.</th>
                    <th className="pb-2 font-medium text-right">Subtotal</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {carrito.map((it, idx) => (
                    <tr key={it.producto_id} className="border-t border-white/5">
                      <td className="py-2 text-white">{it.nombre}</td>
                      <td className="py-2">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => cambiarCantidad(idx, -1)} className="w-5 h-5 rounded border border-white/10 text-white/60 hover:bg-white/5">
                            −
                          </button>
                          <span className="w-5 text-center text-white">{it.cantidad}</span>
                          <button onClick={() => cambiarCantidad(idx, 1)} className="w-5 h-5 rounded border border-white/10 text-white/60 hover:bg-white/5">
                            +
                          </button>
                        </div>
                      </td>
                      <td className="py-2 text-right text-white font-medium">{fmt(it.precio * it.cantidad)}</td>
                      <td className="py-2 text-center">
                        <button onClick={() => quitarItem(idx)} className="text-red-400/70 hover:text-red-400">
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-xl border border-white/10 p-4">
            <p className="text-xs font-semibold text-white/70 mb-3">🧾 Resumen de venta</p>
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>Subtotal</span>
              <span>{fmt(sub)}</span>
            </div>
            <div className="flex justify-between text-xs text-white/50 mb-2">
              <span>IVA (12%)</span>
              <span>{fmt(iva)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-white border-t border-white/10 pt-2 mb-3">
              <span>TOTAL</span>
              <span className="text-[var(--color-blue-4)]">{fmt(tot)}</span>
            </div>

            <div className="flex gap-1.5 mb-3">
              <button
                onClick={() => setTipoDoc('NOTA_VENTA')}
                className={`flex-1 rounded-lg text-[11px] font-semibold py-1.5 ${tipoDoc === 'NOTA_VENTA' ? 'bg-[var(--color-blue-5)] text-white' : 'border border-white/10 text-white/50'}`}
              >
                Nota de venta
              </button>
              <button
                onClick={() => setTipoDoc('FACTURA')}
                className={`flex-1 rounded-lg text-[11px] font-semibold py-1.5 ${tipoDoc === 'FACTURA' ? 'bg-[var(--color-blue-5)] text-white' : 'border border-white/10 text-white/50'}`}
              >
                Factura
              </button>
            </div>

            {(tipoDoc === 'FACTURA' || pagos.some((p) => p.metodo === 'Credito')) && (
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-[var(--color-blue-5)] mb-3"
              >
                <option value="">Seleccionar cliente…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            )}

            <div className="mb-2">
              {pagos.map((p, idx) => (
                <div key={idx} className="flex gap-1.5 mb-1.5">
                  <select
                    value={p.metodo}
                    onChange={(e) => actualizarPago(idx, { metodo: e.target.value as PagoPos['metodo'] })}
                    className="flex-1 rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-[11px] text-white outline-none"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Tarjeta">Tarjeta</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Credito">Crédito</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={p.monto}
                    onChange={(e) => actualizarPago(idx, { monto: parseFloat(e.target.value) || 0 })}
                    className="w-20 rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-[11px] text-white outline-none"
                  />
                  <button onClick={() => quitarPago(idx)} className="text-red-400/70 hover:text-red-400 text-xs px-1">
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button onClick={agregarPago} className="w-full rounded-lg border border-white/10 text-white/50 text-[11px] font-semibold py-1.5 mb-2 hover:bg-white/5">
              + Método de pago
            </button>
            <p className={`text-[11px] font-semibold text-right mb-3 ${Math.abs(restante) < 0.01 ? 'text-emerald-400' : 'text-red-400'}`}>
              {Math.abs(restante) < 0.01 ? 'Pagos completos ✓' : `Falta: ${fmt(Math.abs(restante))}`}
            </p>

            {errorVenta && (
              <p role="alert" className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-2 mb-3">
                {errorVenta}
              </p>
            )}

            <button
              onClick={confirmarVenta}
              disabled={procesando || carrito.length === 0}
              className="w-full rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60"
            >
              {procesando ? 'Procesando…' : '✅ Confirmar venta'}
            </button>
          </div>
        </div>
      )}

      {mostrarCierre && turno && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setMostrarCierre(false)}>
          <div className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Cerrar caja</h3>
            <p className="text-xs text-white/40 mb-4">Cuenta el efectivo físico y regístralo para calcular la diferencia.</p>
            <label className="block text-xs text-white/50 mb-1">Efectivo contado físicamente</label>
            <input
              type="number"
              step="0.01"
              value={contado}
              onChange={(e) => setContado(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)] mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setMostrarCierre(false)}
                className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={handleCerrarCaja}
                disabled={cerrando}
                className="flex-1 rounded-lg bg-red-500/80 text-white text-xs font-semibold py-2 hover:bg-red-500 disabled:opacity-60"
              >
                {cerrando ? 'Cerrando…' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
