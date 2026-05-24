import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ridesAPI, usersAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import AppShell from '../../components/layout/AppShell';
import { Button, Card, Badge, Stat, StatusDot, Alert, Spinner } from '../../components/ui/UI';
import './DriverDashboard.css';

// ── Dashboard home ─────────────────────────────────────────────────────────
function DriverHome() {
  const { user, updateUser } = useAuth();
  const [isOnline, setIsOnline]   = useState(user?.isOnline || false);
  const [activeRide, setActiveRide] = useState(null);
  const [pendingRides, setPendingRides] = useState([]);
  const [toast, setToast]         = useState('');
  const [loading, setLoading]     = useState(true);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }, []);

  useEffect(() => {
    ridesAPI.active().then(({ data }) => setActiveRide(data.ride)).finally(() => setLoading(false));

    const socket = getSocket();
    if (!socket) return;

    socket.on('ride:new_request', (ride) => {
      setPendingRides((p) => [ride, ...p.filter((r) => r._id !== ride._id)]);
      showToast('🔔 New ride request!');
    });
    socket.on('ride:taken', ({ rideId }) => {
      setPendingRides((p) => p.filter((r) => r._id !== rideId));
    });
    socket.on('ride:cancelled', () => {
      showToast('❌ Passenger cancelled');
      setActiveRide(null);
      setIsOnline(true);
    });

    return () => { socket.off('ride:new_request'); socket.off('ride:taken'); socket.off('ride:cancelled'); };
  }, [showToast]);

  const toggleOnline = async () => {
    const next = !isOnline;
    await usersAPI.updateAvailability(next);
    setIsOnline(next);
    updateUser({ isOnline: next });

    const socket = getSocket();
    if (socket) {
      if (next) socket.emit('driver:go_online', { lat: 40.7128, lng: -74.006 }); // TODO: real GPS
      else socket.emit('driver:go_offline');
    }

    if (next) {
      const { data } = await ridesAPI.available();
      setPendingRides(data.rides || []);
    } else {
      setPendingRides([]);
    }
    showToast(next ? '🟢 You are online' : '🔴 You are offline');
  };

  const acceptRide = async (rideId) => {
    try {
      const { data } = await ridesAPI.accept(rideId);
      setActiveRide(data.ride);
      setPendingRides([]);
      showToast('✅ Ride accepted!');
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not accept');
    }
  };

  const startRide = async () => {
    await ridesAPI.start(activeRide._id);
    setActiveRide((r) => ({ ...r, status: 'in_progress' }));
    showToast('🚗 Ride started');
  };

  const completeRide = async () => {
    const { data } = await ridesAPI.complete(activeRide._id);
    showToast(`✅ Done! +$${data.commission?.driverPayout}`);
    setActiveRide(null);
    setIsOnline(true);
  };

  if (loading) return <div className="page"><Spinner size={28} /></div>;

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      <div className="page-header">
        <h1 className="page-title">Driver Dashboard</h1>
      </div>

      {/* Online toggle */}
      <Card className={`online-card ${isOnline ? 'online-card--on' : ''}`}>
        <div className="online-info">
          <StatusDot status={isOnline ? 'online' : 'offline'} />
          <div>
            <p className="online-status">{isOnline ? 'You are online' : 'You are offline'}</p>
            <p className="online-sub">{isOnline ? 'Receiving ride requests' : 'Tap to start earning'}</p>
          </div>
        </div>
        <Button
          variant={isOnline ? 'danger' : 'success'}
          onClick={toggleOnline}
        >
          {isOnline ? 'Go offline' : 'Go online'}
        </Button>
      </Card>

      {/* Stats */}
      <div className="stat-grid">
        <Stat label="Total rides"    value={user?.totalRides || 0} />
        <Stat label="Total earnings" value={`$${(user?.totalEarnings || 0).toFixed(2)}`} accent />
        <Stat label="Rating"         value={`⭐ ${user?.rating || '5.0'}`} />
      </div>

      {/* Active ride */}
      {activeRide && (
        <div>
          <p className="section-title">Active ride</p>
          <Card className="active-ride-card">
            <div className="active-ride-status">
              <StatusDot status={activeRide.status} />
              <span>{{ accepted: 'Heading to pickup', in_progress: 'Ride in progress' }[activeRide.status]}</span>
            </div>

            <div className="passenger-pill">
              <div className="passenger-avatar">{activeRide.passenger?.name?.[0]}</div>
              <div>
                <p className="passenger-name">{activeRide.passenger?.name}</p>
                <p className="passenger-sub">⭐ {activeRide.passenger?.rating} · {activeRide.passenger?.phone}</p>
              </div>
              <div className="ride-payout mono">${activeRide.driverPayout}</div>
            </div>

            <div className="ride-route">
              <div className="route-point"><span className="dot dot--green" /><span>{activeRide.origin?.address}</span></div>
              <div className="route-line" />
              <div className="route-point"><span className="dot dot--red" /><span>{activeRide.destination?.address}</span></div>
            </div>

            <div className="ride-actions">
              {activeRide.status === 'accepted' && (
                <Button variant="primary" size="lg" className="btn--full" onClick={startRide}>Start ride</Button>
              )}
              {activeRide.status === 'in_progress' && (
                <Button variant="success" size="lg" className="btn--full" onClick={completeRide}>Complete ride</Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Pending requests */}
      {isOnline && !activeRide && pendingRides.length > 0 && (
        <div>
          <p className="section-title">Ride requests near you</p>
          <div className="pending-list">
            {pendingRides.map((r) => (
              <Card key={r._id} className="pending-card">
                <div className="pending-header">
                  <span className="passenger-name">{r.passenger?.name}</span>
                  <span className="mono pending-payout">${r.driverPayout}</span>
                </div>
                <div className="ride-route">
                  <div className="route-point"><span className="dot dot--green" /><span>{r.origin?.address}</span></div>
                  <div className="route-line" />
                  <div className="route-point"><span className="dot dot--red" /><span>{r.destination?.address}</span></div>
                </div>
                <div className="pending-meta">
                  <span>{r.distanceText}</span>
                  <span>{r.durationText}</span>
                  <Badge variant="default">{r.rideType}</Badge>
                </div>
                <div className="pending-actions">
                  <Button variant="primary" className="btn--full" onClick={() => acceptRide(r._id)}>Accept</Button>
                  <Button variant="ghost" onClick={() => ridesAPI.reject(r._id).then(() => setPendingRides((p) => p.filter((x) => x._id !== r._id)))}>Skip</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {isOnline && !activeRide && pendingRides.length === 0 && (
        <Card className="waiting-card">
          <div className="waiting-icon">◎</div>
          <p>Waiting for ride requests…</p>
        </Card>
      )}
    </div>
  );
}

// ── Earnings ───────────────────────────────────────────────────────────────
function DriverEarnings() {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ridesAPI.history({ status: 'completed' })
      .then(({ data }) => setHistory(data.rides))
      .finally(() => setLoading(false));
  }, []);

  const totalEarnings = history.reduce((s, r) => s + (r.driverPayout || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Earnings</h1>
      </div>

      <div className="stat-grid">
        <Stat label="All-time earnings" value={`$${totalEarnings.toFixed(2)}`} accent />
        <Stat label="Completed rides"   value={history.length} />
        <Stat label="Driver payout"     value="70%" />
      </div>

      {loading ? <Spinner size={28} /> : (
        <div className="history-list">
          {history.length === 0 && <p className="empty-state">No completed rides yet</p>}
          {history.map((r) => (
            <Card key={r._id} className="history-card">
              <div className="history-header">
                <span>{r.passenger?.name}</span>
                <span className="mono pending-payout">${r.driverPayout?.toFixed(2)}</span>
              </div>
              <div className="history-route">
                <p>📍 {r.origin?.address}</p>
                <p>🏁 {r.destination?.address}</p>
              </div>
              <div className="history-meta">
                <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                <span>{r.distanceText}</span>
                <Badge variant="default">{r.rideType}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Rides ──────────────────────────────────────────────────────────────────
function DriverRides() {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ridesAPI.history().then(({ data }) => setRides(data.rides)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">All rides</h1></div>
      {loading ? <Spinner size={28} /> : (
        <div className="history-list">
          {rides.length === 0 && <p className="empty-state">No rides yet</p>}
          {rides.map((r) => (
            <Card key={r._id} className="history-card">
              <div className="history-header">
                <Badge variant={r.status === 'completed' ? 'success' : 'danger'}>{r.status}</Badge>
                <span className="mono pending-payout">${r.finalPrice?.toFixed(2) ?? r.estimatedPrice?.toFixed(2)}</span>
              </div>
              <div className="history-route">
                <p>📍 {r.origin?.address}</p>
                <p>🏁 {r.destination?.address}</p>
              </div>
              <div className="history-meta">
                <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                <Badge variant="default">{r.rideType}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Profile ────────────────────────────────────────────────────────────────
function DriverProfile() {
  const { user } = useAuth();
  return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">Profile</h1></div>
      <Card>
        <div className="profile-avatar-lg">{user?.name?.[0]?.toUpperCase()}</div>
        <h2 className="profile-name">{user?.name}</h2>
        <p className="profile-email">{user?.email}</p>
        {user?.vehicleInfo?.brand && (
          <div className="vehicle-box">
            <p className="section-title" style={{ marginBottom: 8 }}>Vehicle</p>
            <p>{user.vehicleInfo.color} {user.vehicleInfo.brand} {user.vehicleInfo.model} {user.vehicleInfo.year}</p>
            <p className="mono" style={{ marginTop: 4, color: 'var(--text-3)' }}>{user.vehicleInfo.plate}</p>
          </div>
        )}
        <div className="stat-grid" style={{ marginTop: 20 }}>
          <Stat label="Total rides"    value={user?.totalRides || 0} />
          <Stat label="Rating"         value={`⭐ ${user?.rating}`} />
          <Stat label="Total earnings" value={`$${(user?.totalEarnings || 0).toFixed(2)}`} accent />
        </div>
      </Card>
    </div>
  );
}

// ── Router ─────────────────────────────────────────────────────────────────
export default function DriverDashboard() {
  return (
    <AppShell>
      <Routes>
        <Route index element={<DriverHome />} />
        <Route path="rides" element={<DriverRides />} />
        <Route path="earnings" element={<DriverEarnings />} />
        <Route path="profile" element={<DriverProfile />} />
      </Routes>
    </AppShell>
  );
}
