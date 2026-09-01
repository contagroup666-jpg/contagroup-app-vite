import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import RequireAuth from './components/RequireAuth'
import AppLayout from './modules/layout/AppLayout'
import DashboardPage from './modules/dashboard/DashboardPage'
import PlanCuentasPage from './modules/plan-cuentas/PlanCuentasPage'
import FacturasPage from './modules/facturas/FacturasPage'
import FacturaDetallePage from './modules/facturas/FacturaDetallePage'
import ClientesPage from './modules/clientes/ClientesPage'
import AdminDashboardPage from './modules/admin/AdminDashboardPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RequireAuth>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/plan-cuentas" element={<PlanCuentasPage />} />
              <Route path="/facturas" element={<FacturasPage />} />
              <Route path="/facturas/:id" element={<FacturaDetallePage />} />
              <Route path="/clientes" element={<ClientesPage />} />
              <Route path="/admin" element={<AdminDashboardPage />} />
            </Route>
          </Routes>
        </RequireAuth>
      </BrowserRouter>
    </AuthProvider>
  )
}
