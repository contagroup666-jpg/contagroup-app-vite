import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Database } from '../../types/database'
import TablaSkeleton from '../../components/TablaSkeleton'
import EstadoVacio from '../../components/EstadoVacio'

type Cliente = Database['public']['Tables']['clientes']['Row']

const VACIO = { nombre: '', ruc: '', email: '', telefono: '', direccion: '' }

export default function ClientesPage() {
  const { perfil } = useAuth()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [form, setForm] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)

  async function cargar() {
    setLoading(true)
    const { data, error: err } = await supabase.from('clientes').select('*').order('nombre')
    if (err) setError(err.message)
    else {
      setClientes((data ?? []) as unknown as Cliente[])
      setError(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  function abrirNuevo() {
    setEditando(null)
    setForm(VACIO)
    setFormError(null)
    setMostrarForm(true)
  }

  function abrirEditar(c: Cliente) {
    setEditando(c)
    setForm({
      nombre: c.nombre,
      ruc: c.ruc ?? '',
      email: c.email ?? '',
      telefono: c.telefono ?? '',
      direccion: c.direccion ?? '',
    })
    setFormError(null)
    setMostrarForm(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) {
      setFormError('El nombre es obligatorio.')
      return
    }
    if (!perfil?.empresa_id && !editando) {
      setFormError('Tu usuario no tiene una empresa activa asignada.')
      return
    }
    setGuardando(true)
    setFormError(null)

    const payload = {
      nombre: form.nombre.trim(),
      ruc: form.ruc.trim() || null,
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
      direccion: form.direccion.trim() || null,
    }

    const resultado = editando
      ? await supabase.from('clientes').update(payload).eq('id', editando.id)
      : await supabase.from('clientes').insert({ ...payload, empresa_id: perfil?.empresa_id })

    if (resultado.error) {
      // RLS puede rechazar el insert/update si, por ejemplo, el usuario perdió acceso a la
      // empresa entre que abrió el formulario y guardó — se lo mostramos tal cual, sin adivinar.
      setFormError(resultado.error.message)
      setGuardando(false)
      return
    }

    setGuardando(false)
    setMostrarForm(false)
    await cargar()
  }

  const filtrados = clientes.filter((c) => {
    const q = busqueda.toLowerCase()
    if (!q) return true
    return c.nombre.toLowerCase().includes(q) || (c.ruc ?? '').includes(q)
  })

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Clientes</h2>
          <p className="text-xs text-white/40 mt-0.5">{clientes.length} cliente{clientes.length === 1 ? '' : 's'} en la empresa activa</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar nombre o RUC…"
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-white outline-none focus:border-[var(--color-blue-5)] w-56"
          />
          <button
            onClick={abrirNuevo}
            className="rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[var(--color-blue-6)] transition-colors"
          >
            + Nuevo cliente
          </button>
        </div>
      </div>

      {loading && <TablaSkeleton columnas={3} />}
      {error && (
        <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          No se pudieron cargar los clientes: {error}
        </p>
      )}

      {!loading && !error && filtrados.length === 0 && clientes.length === 0 && (
        <EstadoVacio
          icono="👥"
          titulo="Todavía no hay clientes"
          descripcion="Registra el primero para empezar a facturarle."
          accion={{ label: '+ Nuevo cliente', onClick: abrirNuevo }}
        />
      )}
      {!loading && !error && filtrados.length === 0 && clientes.length > 0 && (
        <EstadoVacio icono="🔍" titulo="Sin resultados" descripcion="Nadie coincide con esa búsqueda." />
      )}

      {!loading && !error && filtrados.length > 0 && (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-left text-white/50 text-[11px] uppercase tracking-wide">
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">RUC / CI</th>
                <th className="px-3 py-2 font-medium">Contacto</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-2 text-white">{c.nombre}</td>
                  <td className="px-3 py-2 text-white/60 font-mono text-xs">{c.ruc || '—'}</td>
                  <td className="px-3 py-2 text-white/50 text-xs">
                    {c.email && <div>{c.email}</div>}
                    {c.telefono && <div>{c.telefono}</div>}
                    {!c.email && !c.telefono && '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => abrirEditar(c)}
                      className="text-xs text-[var(--color-blue-5)] hover:underline"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mostrarForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setMostrarForm(false)}>
          <div
            className="bg-[var(--color-bg-1)] border border-white/10 rounded-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-white mb-4">
              {editando ? 'Editar cliente' : 'Nuevo cliente'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Nombre *</label>
                <input
                  autoFocus
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">RUC / Cédula</label>
                <input
                  value={form.ruc}
                  onChange={(e) => setForm({ ...form, ruc: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Teléfono</label>
                <input
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-blue-5)]"
                />
              </div>

              {formError && (
                <p role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setMostrarForm(false)}
                  className="flex-1 rounded-lg border border-white/10 text-white/60 text-xs font-semibold py-2 hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 rounded-lg bg-[var(--color-blue-5)] text-white text-xs font-semibold py-2 hover:bg-[var(--color-blue-6)] disabled:opacity-60"
                >
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
