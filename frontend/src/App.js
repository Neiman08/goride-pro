import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthPage from './pages/auth/AuthPage';
import PassengerDashboard from './pages/passenger/PassengerDashboard';
import DriverDashboard from './pages/driver/DriverDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';

// ── Route guards ──────────────────────────────────────────────────────────
function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading…</div>;
  if (user) return <Navigate to={roleDest(user.role)} replace />;
  return children;
}

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (role && user.role !== role) return <Navigate to={roleDest(user.role)} replace />;
  return children;
}

const roleDest = (role) => ({ passenger: '/passenger', driver: '/driver', admin: '/admin' }[role] || '/auth');

// ── App ───────────────────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auth" replace />} />

      <Route path="/auth" element={
        <PublicRoute><AuthPage /></PublicRoute>
      } />

      <Route path="/passenger/*" element={
        <ProtectedRoute role="passenger"><PassengerDashboard /></ProtectedRoute>
      } />

      <Route path="/driver/*" element={
        <ProtectedRoute role="driver"><DriverDashboard /></ProtectedRoute>
      } />

      <Route path="/admin/*" element={
        <ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/auth" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
