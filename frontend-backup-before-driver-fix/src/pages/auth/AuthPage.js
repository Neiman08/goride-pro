import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button, Input, Alert } from '../../components/ui/UI';
import './AuthPage.css';

const ROLE_DEST = { passenger: '/passenger', driver: '/driver', admin: '/admin' };

export default function AuthPage() {
  const [mode, setMode]     = useState('login');
  const [role, setRole]     = useState('passenger');
  const [step, setStep]     = useState(1); // register is 2-step
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '',
  });
  const [vehicle, setVehicle] = useState({
    brand: '', model: '', year: '', plate: '', color: '',
  });

  const { login, register } = useAuth();
  const navigate = useNavigate();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setV = (k) => (e) => setVehicle((v) => ({ ...v, [k]: e.target.value }));

  const handleLogin = async () => {
    setError('');
    if (!form.email || !form.password) return setError('Email and password required');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      navigate(ROLE_DEST[user.role] || '/passenger');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    setError('');
    if (step === 1) {
      if (!form.name || !form.email || !form.password)
        return setError('Name, email and password required');
      if (role === 'driver') return setStep(2);
    }
    setLoading(true);
    try {
      const payload = { ...form, role };
      if (role === 'driver') payload.vehicleInfo = { ...vehicle, year: parseInt(vehicle.year) };
      const user = await register(payload);
      navigate(ROLE_DEST[user.role] || '/passenger');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      {/* Left panel */}
      <div className="auth-left">
        <div className="auth-brand">
          <span className="auth-logo">⬡</span>
          <span className="auth-brand-name">RideApp</span>
        </div>
        <div className="auth-tagline">
          <h1>Move people.<br />Build income.</h1>
          <p>The platform for drivers and passengers who value reliability.</p>
        </div>
        <div className="auth-stats">
          <div className="auth-stat"><span className="auth-stat-n">70%</span><span>driver payout</span></div>
          <div className="auth-stat"><span className="auth-stat-n">Real</span><span>live tracking</span></div>
          <div className="auth-stat"><span className="auth-stat-n">3</span><span>ride types</span></div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="auth-right">
        <div className="auth-card">

          {/* Tabs */}
          <div className="auth-tabs">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setStep(1); setError(''); }}>
              Sign in
            </button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setStep(1); setError(''); }}>
              Register
            </button>
          </div>

          {/* LOGIN */}
          {mode === 'login' && (
            <div className="auth-form fade-up">
              <Input label="Email" type="email" placeholder="you@email.com" value={form.email} onChange={set('email')} icon="✉" />
              <Input label="Password" type="password" placeholder="••••••••" value={form.password} onChange={set('password')} icon="🔒" />
              {error && <Alert message={error} onClose={() => setError('')} />}
              <Button variant="primary" size="lg" className="btn--full" loading={loading} onClick={handleLogin}>
                Sign in
              </Button>
              <p className="auth-hint">Admin? Use your admin credentials above.</p>
            </div>
          )}

          {/* REGISTER step 1 */}
          {mode === 'register' && step === 1 && (
            <div className="auth-form fade-up">
              {/* Role selector */}
              <div className="role-selector">
                {['passenger', 'driver'].map((r) => (
                  <button
                    key={r}
                    className={`role-btn ${role === r ? 'active' : ''}`}
                    onClick={() => setRole(r)}
                  >
                    <span className="role-icon">{r === 'passenger' ? '🧑' : '🚘'}</span>
                    <span className="role-label">{r === 'passenger' ? 'Passenger' : 'Driver'}</span>
                    {r === 'driver' && <span className="role-tag">Earn 70%</span>}
                  </button>
                ))}
              </div>

              <Input label="Full name" placeholder="Jane Smith" value={form.name} onChange={set('name')} />
              <Input label="Email" type="email" placeholder="you@email.com" value={form.email} onChange={set('email')} />
              <Input label="Password" type="password" placeholder="Min 8 chars, 1 uppercase, 1 number" value={form.password} onChange={set('password')} />
              <Input label="Phone (optional)" type="tel" placeholder="+1 555 000 0000" value={form.phone} onChange={set('phone')} />

              {error && <Alert message={error} onClose={() => setError('')} />}

              <Button variant="primary" size="lg" className="btn--full" loading={loading} onClick={handleRegister}>
                {role === 'driver' ? 'Continue →' : 'Create account'}
              </Button>
            </div>
          )}

          {/* REGISTER step 2 — driver vehicle */}
          {mode === 'register' && step === 2 && (
            <div className="auth-form fade-up">
              <div className="auth-step-header">
                <button className="back-btn" onClick={() => setStep(1)}>← Back</button>
                <span className="step-label">Vehicle information</span>
              </div>
              <p className="auth-hint" style={{ marginBottom: 4 }}>
                Admin will review and approve your account within 24h.
              </p>

              <div className="form-row">
                <Input label="Brand" placeholder="Toyota" value={vehicle.brand} onChange={setV('brand')} />
                <Input label="Model" placeholder="Camry" value={vehicle.model} onChange={setV('model')} />
              </div>
              <div className="form-row">
                <Input label="Year" type="number" placeholder="2020" value={vehicle.year} onChange={setV('year')} />
                <Input label="Color" placeholder="Black" value={vehicle.color} onChange={setV('color')} />
              </div>
              <Input label="License plate" placeholder="ABC-1234" value={vehicle.plate} onChange={setV('plate')} />

              {error && <Alert message={error} onClose={() => setError('')} />}

              <Button variant="primary" size="lg" className="btn--full" loading={loading} onClick={handleRegister}>
                Submit application
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
