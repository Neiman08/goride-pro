import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../ui/UI';
import './AppShell.css';

const NAV = {
  passenger: [
    { to: '/passenger',         label: 'Home',    icon: '⬡' },
    { to: '/passenger/book',    label: 'Book',    icon: '＋' },
    { to: '/passenger/history', label: 'History', icon: '◷' },
    { to: '/passenger/profile', label: 'Profile', icon: '◎' },
  ],
  driver: [
    { to: '/driver',            label: 'Dashboard', icon: '⬡' },
    { to: '/driver/rides',      label: 'Rides',     icon: '◈' },
    { to: '/driver/earnings',   label: 'Earnings',  icon: '$' },
    { to: '/driver/profile',    label: 'Profile',   icon: '◎' },
  ],
  admin: [
    { to: '/admin',             label: 'Overview',    icon: '⬡' },
    { to: '/admin/rides',       label: 'Rides',       icon: '◈' },
    { to: '/admin/drivers',     label: 'Drivers',     icon: '🚘' },
    { to: '/admin/passengers',  label: 'Passengers',  icon: '🧑' },
    { to: '/admin/commissions', label: 'Commissions', icon: '$' },
    { to: '/admin/tariffs',     label: 'Tariffs',     icon: '⚙' },
  ],
};

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const nav = NAV[user?.role] || [];

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  return (
    <div className={`shell ${collapsed ? 'shell--collapsed' : ''}`}>
      {/* Sidebar */}
      <aside className="shell-sidebar">
        <div className="sidebar-top">
          <div className="sidebar-logo">
            <span className="sidebar-logo-icon">⬡</span>
            {!collapsed && <span className="sidebar-logo-text">RideApp</span>}
          </div>
          <button className="sidebar-collapse" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        <nav className="sidebar-nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/passenger' || item.to === '/driver' || item.to === '/admin'}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {!collapsed && (
            <div className="sidebar-user">
              <div className="sidebar-avatar">{user?.name?.[0]?.toUpperCase()}</div>
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{user?.name}</span>
                <Badge variant={user?.role}>{user?.role}</Badge>
              </div>
            </div>
          )}
          <button className="sidebar-logout" onClick={handleLogout} title="Log out">
            ↩
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="shell-main">
        {children}
      </main>
    </div>
  );
}
