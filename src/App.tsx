import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import RequireAuth from './components/RequireAuth'
import AppLayout from './modules/layout/AppLayout'
import DashboardPage from './modules/dashboard/DashboardPage'
import PlanCuentasPage from './modules/plan-cuentas/PlanCuentasPage'
import FacturasPage from './modules/facturas/FacturasPage'
import FacturaDetallePage from './modules/facturas/FacturaDetallePage'
import ClientesPage from './modules/clientes/ClientesPage'
import CrmPage from './modules/crm/CrmPage'
import PosPage from './modules/pos/PosPage'
import ComprasPage from './modules/compras/ComprasPage'
import CxCPage from './modules/cxc/CxCPage'
import CajaChicaPage from './modules/caja-chica/CajaChicaPage'
import TesoreriaPage from './modules/tesoreria/TesoreriaPage'
import RetencionesPage from './modules/retenciones/RetencionesPage'
import NominaPage from './modules/nomina/NominaPage'
import ActivosFijosPage from './modules/activos-fijos/ActivosFijosPage'
import ConfigContablePage from './modules/config-contable/ConfigContablePage'
import AdminDashboardPage from './modules/admin/AdminDashboardPage'
import UsuariosPage from './modules/usuarios/UsuariosPage'

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
              <Route path="/crm" element={<CrmPage />} />
              <Route path="/pos" element={<PosPage />} />
              <Route path="/compras" element={<ComprasPage />} />
              <Route path="/cxc" element={<CxCPage />} />
              <Route path="/caja-chica" element={<CajaChicaPage />} />
              <Route path="/tesoreria" element={<TesoreriaPage />} />
              <Route path="/retenciones" element={<RetencionesPage />} />
              <Route path="/nomina" element={<NominaPage />} />
              <Route path="/activos-fijos" element={<ActivosFijosPage />} />
              <Route path="/config-contable" element={<ConfigContablePage />} />
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/usuarios" element={<UsuariosPage />} />
            </Route>
          </Routes>
        </RequireAuth>
      </BrowserRouter>
    </AuthProvider>
  )
}
