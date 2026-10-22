import React from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import Log from './components/Log';
import ProtectedRoute from './components/ProtectedRoute';
import { AppLoader } from './components/ApiUi';
import { AuthProvider, ROLE_HOME, useAuth } from './context/AuthContext';
import AppShell from './layout/AppShell';
import Dashboard from './pages/Dashboard';
import Inquiries from './pages/Inquiries';
import Applicants from './pages/Applicants';
import Activities from './pages/Activities';
import Users from './pages/Users';
import Inventory from './pages/Inventory';
import SupplyRequests from './pages/SupplyRequests';
import Analytics from './pages/Analytics';
import Branches from './pages/Branches';

function RoleRedirect() {
  const { loading, role, isAuthenticated } = useAuth();
  if (loading) return <AppLoader label="Loading Herald…" />;
  return <Navigate to={isAuthenticated ? (ROLE_HOME[role] || '/') : '/'} replace />;
}

function RoleGuard({ roles }) {
  return <ProtectedRoute allowedRoles={roles} />;
}

export default function App() {
  const base = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '');
  return (
    <BrowserRouter basename={base}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Log />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route element={<RoleGuard roles={['admin']} />}><Route path="/admin-dashboard" element={<Dashboard />} /><Route path="/users" element={<Users />} /></Route>
              <Route element={<RoleGuard roles={['marketing']} />}><Route path="/marketing-dashboard" element={<Dashboard />} /></Route>
              <Route element={<RoleGuard roles={['sales']} />}><Route path="/sales-dashboard" element={<Dashboard />} /></Route>
              <Route element={<RoleGuard roles={['logistics']} />}><Route path="/logistics-dashboard" element={<Dashboard />} /></Route>
              <Route element={<RoleGuard roles={['franchisee']} />}><Route path="/franchisee-dashboard" element={<Dashboard />} /></Route>
              <Route element={<RoleGuard roles={['admin','marketing','sales']} />}><Route path="/inquiries" element={<Inquiries />} /><Route path="/marketing-inquiries" element={<Navigate to="/inquiries" replace />} /></Route>
              <Route element={<RoleGuard roles={['admin','sales','franchisee']} />}><Route path="/applicants" element={<Applicants />} /><Route path="/activities" element={<Activities />} /></Route>
              <Route element={<RoleGuard roles={['admin','logistics']} />}><Route path="/branches" element={<Branches />} /></Route>
              <Route element={<RoleGuard roles={['admin','logistics','franchisee']} />}><Route path="/inventory" element={<Inventory />} /></Route>
              <Route element={<RoleGuard roles={['admin','sales','logistics','franchisee']} />}><Route path="/supply-requests" element={<SupplyRequests />} /></Route>
              <Route element={<RoleGuard roles={['admin','marketing','sales','logistics']} />}><Route path="/analytics" element={<Analytics />} /></Route>
              <Route path="/franchise-management" element={<Navigate to="/applicants" replace />} />
              <Route path="/user-management" element={<Navigate to="/users" replace />} />
              <Route path="/supply-chain" element={<Navigate to="/supply-requests" replace />} />
              <Route path="/analytics-dashboard" element={<Navigate to="/analytics" replace />} />
            </Route>
          </Route>
          <Route path="*" element={<RoleRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
