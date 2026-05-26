import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';

import AuthPage            from './pages/auth/AuthPage';
import PassengerDashboard  from './pages/passenger/PassengerDashboard';
import DriverDashboard     from './pages/driver/DriverDashboard';
import AdminDashboard      from './pages/admin/AdminDashboard';
import DriverRegistration  from './pages/driver/registration/DriverRegistration';
import DriverPending       from './pages/driver/registration/DriverPending';

// ── Route guards ──────────────────────────────────────────────────────────

const roleDest = (role) => ({ passenger: '/passenger', driver: '/driver', admin: '/admin' }[role] || '/auth');

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (user) return <Navigate to={roleDest(user.role)} replace />;
  return children;
}

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (role && user.role !== role) return <Navigate to={roleDest(user.role)} replace />;
  return children;
}

// Driver pending — accessible only to drivers awaiting approval
function DriverPendingRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (user.role !== 'driver') return <Navigate to={roleDest(user.role)} replace />;
  return children;
}

// ── Routes ────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auth" replace />} />

      {/* Auth */}
      <Route path="/auth" element={<PublicRoute><AuthPage /></PublicRoute>} />

      {/* Driver registration — public (no auth needed for step 1) */}
      <Route path="/driver/register" element={<DriverRegistration />} />

      {/* Driver pending — shown after registration, waiting for approval */}
      <Route path="/driver/pending" element={<DriverPendingRoute><DriverPending /></DriverPendingRoute>} />

      {/* Passenger */}
      <Route path="/passenger/*" element={<ProtectedRoute role="passenger"><PassengerDashboard /></ProtectedRoute>} />

      {/* Driver dashboard — only approved drivers reach here */}
      <Route path="/driver/*" element={<ProtectedRoute role="driver"><DriverDashboard /></ProtectedRoute>} />

      {/* Admin */}
      <Route path="/admin/*" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/auth" replace />} />
    </Routes>
  );
}

// ── App ───────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  );
}
