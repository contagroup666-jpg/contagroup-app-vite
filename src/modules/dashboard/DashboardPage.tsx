import { useAuth } from '../../context/AuthContext'

export default function DashboardPage() {
  const { perfil } = useAuth()

  return (
    <div className="p-6">
      <h2 className="text-base font-semibold text-white">Hola, {perfil?.nombre?.split(' ')[0] ?? ''} 👋</h2>
      <p className="text-sm text-white/50 mt-1">
        Este es el nuevo frontend en Vite + React. Por ahora tiene migrados{' '}
        <span className="text-white/80">Plan de cuentas</span> y{' '}
        <span className="text-white/80">Facturas</span>; el resto sigue disponible en el sistema actual
        mientras se migra módulo por módulo.
      </p>
    </div>
  )
}
