import React from 'react';
import './UI.css';

// ── Button ─────────────────────────────────────────────────────────────────
export const Button = ({ children, variant = 'primary', size = 'md', loading, disabled, className = '', ...props }) => (
  <button
    className={`btn btn--${variant} btn--${size} ${loading ? 'btn--loading' : ''} ${className}`}
    disabled={disabled || loading}
    {...props}
  >
    {loading ? <span className="btn-spinner" /> : children}
  </button>
);

// ── Input ──────────────────────────────────────────────────────────────────
export const Input = ({ label, error, icon, className = '', ...props }) => (
  <div className={`input-group ${error ? 'input-group--error' : ''} ${className}`}>
    {label && <label className="input-label">{label}</label>}
    <div className="input-wrap">
      {icon && <span className="input-icon">{icon}</span>}
      <input className={`input-field ${icon ? 'input-field--icon' : ''}`} {...props} />
    </div>
    {error && <span className="input-error">{error}</span>}
  </div>
);

// ── Badge ──────────────────────────────────────────────────────────────────
export const Badge = ({ children, variant = 'default' }) => (
  <span className={`badge badge--${variant}`}>{children}</span>
);

// ── Card ───────────────────────────────────────────────────────────────────
export const Card = ({ children, className = '', onClick }) => (
  <div className={`card ${onClick ? 'card--clickable' : ''} ${className}`} onClick={onClick}>
    {children}
  </div>
);

// ── Spinner ────────────────────────────────────────────────────────────────
export const Spinner = ({ size = 20 }) => (
  <div className="spinner" style={{ width: size, height: size }} />
);

// ── Stat ───────────────────────────────────────────────────────────────────
export const Stat = ({ label, value, sub, accent }) => (
  <div className={`stat-card ${accent ? 'stat-card--accent' : ''}`}>
    <span className="stat-label">{label}</span>
    <span className="stat-value">{value}</span>
    {sub && <span className="stat-sub">{sub}</span>}
  </div>
);

// ── Status dot ─────────────────────────────────────────────────────────────
export const StatusDot = ({ status }) => {
  const colors = {
    searching: 'var(--orange)',
    accepted: 'var(--blue)',
    in_progress: 'var(--green)',
    completed: 'var(--text-3)',
    cancelled: 'var(--red)',
    online: 'var(--green)',
    offline: 'var(--text-3)',
  };
  return (
    <span
      className="status-dot"
      style={{ background: colors[status] || 'var(--text-3)', boxShadow: `0 0 6px ${colors[status] || 'transparent'}` }}
    />
  );
};

// ── Alert ──────────────────────────────────────────────────────────────────
export const Alert = ({ message, type = 'error', onClose }) => {
  if (!message) return null;
  return (
    <div className={`alert alert--${type}`}>
      <span>{message}</span>
      {onClose && <button className="alert-close" onClick={onClose}>✕</button>}
    </div>
  );
};
