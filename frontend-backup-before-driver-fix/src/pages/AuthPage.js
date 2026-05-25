import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLE_DEST = { passenger: '/passenger', driver: '/driver', admin: '/admin' };

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState('passenger');
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [vehicle, setVehicle] = useState({ brand: '', model: '', plate: '', color: '', year: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));
  const setV = (field) => (e) => setVehicle((p) => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async () => {
    setError(''); setLoading(true);
    try {
      let user;
      if (mode === 'login') {
        user = await login(form.email, form.password);
      } else {
        const payload = { ...form, role };
        if (role === 'driver') payload.vehicleInfo = { ...vehicle, year: parseInt(vehicle.year) };
        user = await register(payload);
      }
      navigate(ROLE_DEST[user.role] || '/passenger');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const s = {
    page: { minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif',
      backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(120,80,255,0.07) 0%,transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(0,200,150,0.05) 0%,transparent 50%)' },
    card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: '48px 40px', width: '100%', maxWidth: 420 },
    logo: { textAlign: 'center', marginBottom: 32 },
    logoText: { fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 800, color: '#fff', display: 'block', marginTop: 8, letterSpacing: -1 },
    tabs: { display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4, marginBottom: 24 },
    tab: (active) => ({ flex: 1, padding: '10px', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 500, transition: 'all 0.2s',
      background: active ? 'rgba(255,255,255,0.1)' : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,0.4)' }),
    roleRow: { display: 'flex', gap: 10, marginBottom: 16 },
    roleBtn: (active) => ({ flex: 1, padding: 12, border: `1px solid ${active ? '#7c4dff' : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, cursor: 'pointer',
      background: active ? 'rgba(124,77,255,0.1)' : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,0.5)', fontFamily: 'DM Sans, sans-serif', fontSize: 13 }),
    input: { width: '100%', padding: '14px 16px', marginBottom: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box' },
    vehicleSection: { background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, marginBottom: 12 },
    sectionLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, display: 'block' },
    error: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', padding: '10px 14px', fontSize: 13, marginBottom: 12 },
    btn: { width: '100%', padding: 16, background: 'linear-gradient(135deg, #7c4dff, #5c35cc)', border: 'none', borderRadius: 14, color: '#fff',
      fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8, opacity: loading ? 0.6 : 1 },
  };

  return (
    <div style={s.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap'); input::placeholder { color: rgba(255,255,255,0.3); }`}</style>
      <div style={s.card}>
        <div style={s.logo}>
          <span style={{ fontSize: 44 }}>🚗</span>
          <span style={s.logoText}>RideApp</span>
        </div>

        <div style={s.tabs}>
          <button style={s.tab(mode === 'login')} onClick={() => setMode('login')}>Sign In</button>
          <button style={s.tab(mode === 'register')} onClick={() => setMode('register')}>Sign Up</button>
        </div>

        {mode === 'register' && (
          <>
            <div style={s.roleRow}>
              <button style={s.roleBtn(role === 'passenger')} onClick={() => setRole('passenger')}>🧑 Passenger</button>
              <button style={s.roleBtn(role === 'driver')} onClick={() => setRole('driver')}>🚘 Driver</button>
            </div>
            <input style={s.input} placeholder="Full name" value={form.name} onChange={set('name')} />
            <input style={s.input} placeholder="Phone" value={form.phone} onChange={set('phone')} />
          </>
        )}

        <input style={s.input} placeholder="Email" type="email" value={form.email} onChange={set('email')} />
        <input style={s.input} placeholder="Password (8+ chars, 1 uppercase, 1 number)" type="password" value={form.password} onChange={set('password')} />

        {mode === 'register' && role === 'driver' && (
          <div style={s.vehicleSection}>
            <span style={s.sectionLabel}>Vehicle Information</span>
            {['brand', 'model', 'plate', 'color'].map((f) => (
              <input key={f} style={s.input} placeholder={f.charAt(0).toUpperCase() + f.slice(1)} value={vehicle[f]} onChange={setV(f)} />
            ))}
            <input style={s.input} placeholder="Year (e.g. 2022)" value={vehicle.year} onChange={setV('year')} />
          </div>
        )}

        {error && <div style={s.error}>{error}</div>}

        <button style={s.btn} onClick={handleSubmit} disabled={loading}>
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        {mode === 'register' && role === 'driver' && (
          <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 12 }}>
            Driver accounts require admin approval before first login.
          </p>
        )}
      </div>
    </div>
  );
}
