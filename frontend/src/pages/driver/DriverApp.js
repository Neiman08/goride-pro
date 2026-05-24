import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useRide } from '../../context/RideContext';
import { useGeolocation } from '../../hooks/useGeolocation';
import useSocketEvent from '../../hooks/useSocketEvent';
import RideMap from '../../components/map/RideMap';
import Notification from '../../components/common/Notification';
import { ridesAPI } from '../../api/rides';

const VIEWS = { HOME: 'home', HISTORY: 'history', PROFILE: 'profile' };

export default function DriverApp() {
  const { user, logout, updateUser } = useAuth();
  const { socket } = useSocket();
  const { activeRide, setActiveRide, notification, notify } = useRide();
  const { location: driverPos } = useGeolocation(true); // watch=true for continuous updates
  const [isOnline, setIsOnline] = useState(user?.isOnline || false);
  const [pendingRides, setPendingRides] = useState([]);
  const [view, setView] = useState(VIEWS.HOME);
  const [history, setHistory] = useState([]);
  const [togglingOnline, setTogglingOnline] = useState(false);

  // Send GPS to server every 5s while online and on a trip
  useEffect(() => {
    if (!socket || !isOnline || !driverPos) return;
    const rideId = activeRide?._id;

    socket.emit('driver:location_update', { lat: driverPos.lat, lng: driverPos.lng, rideId });

    const interval = setInterval(() => {
      socket.emit('driver:location_update', { lat: driverPos.lat, lng: driverPos.lng, rideId });
    }, 5000);

    return () => clearInterval(interval);
  }, [socket, isOnline, driverPos, activeRide]);

  // Incoming ride requests
  useSocketEvent('ride:new_request', useCallback((ride) => {
    if (!isOnline || activeRide) return;
    setPendingRides((prev) => [ride, ...prev.filter((r) => r._id !== ride._id)]);
    notify('🔔 New ride request!', 'info');
  }, [isOnline, activeRide, notify]));

  // Ride taken by another driver
  useSocketEvent('ride:taken', useCallback(({ rideId }) => {
    setPendingRides((prev) => prev.filter((r) => r._id !== rideId));
  }, []));

  // Passenger cancelled
  useSocketEvent('ride:cancelled', useCallback(() => {
    setActiveRide(null);
    setIsOnline(true);
    notify('❌ Passenger cancelled', 'warning');
  }, [setActiveRide, notify]));

  const toggleOnline = async () => {
    setTogglingOnline(true);
    try {
      const newStatus = !isOnline;
      socket?.emit(newStatus ? 'driver:go_online' : 'driver:go_offline', driverPos || {});
      setIsOnline(newStatus);
      updateUser({ isOnline: newStatus });
      notify(newStatus ? '🟢 You are online' : '🔴 You are offline', 'info');
      if (!newStatus) setPendingRides([]);
    } finally {
      setTogglingOnline(false);
    }
  };

  const acceptRide = async (rideId) => {
    try {
      const { data } = await ridesAPI.accept(rideId);
      setActiveRide(data.ride);
      setPendingRides([]);
      socket?.emit('ride:join', { rideId });
      notify('✅ Ride accepted!', 'success');
    } catch (err) {
      notify(err.response?.data?.message || 'Could not accept ride', 'error');
    }
  };

  const rejectRide = async (rideId) => {
    try {
      await ridesAPI.reject(rideId);
      setPendingRides((prev) => prev.filter((r) => r._id !== rideId));
    } catch { /* ignore */ }
  };

  const startRide = async () => {
    try {
      await ridesAPI.start(activeRide._id);
      setActiveRide((p) => ({ ...p, status: 'in_progress' }));
      notify('🚗 Ride started!', 'success');
    } catch (err) { notify(err.response?.data?.message || 'Error', 'error'); }
  };

  const completeRide = async () => {
    try {
      const { data } = await ridesAPI.complete(activeRide._id);
      notify(`✅ Completed! You earned $${data.commission?.driverPayout}`, 'success');
      setActiveRide(null);
      setIsOnline(true);
    } catch (err) { notify(err.response?.data?.message || 'Error', 'error'); }
  };

  const s = {
    app: { minHeight: '100vh', background: '#080b12', color: '#fff', fontFamily: 'DM Sans, sans-serif', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
    badge: { background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.5 },
    main: { flex: 1, padding: 20, paddingBottom: 90, overflowY: 'auto' },
    onlineCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 20, marginBottom: 16 },
    onlineDot: (on) => ({ width: 12, height: 12, borderRadius: '50%', background: on ? '#10b981' : '#6b7280', boxShadow: on ? '0 0 10px rgba(16,185,129,0.5)' : 'none', animation: on ? 'pulse 2s infinite' : 'none' }),
    toggleBtn: (on) => ({ padding: '10px 18px', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, transition: 'all 0.2s',
      background: on ? 'rgba(239,68,68,0.15)' : 'linear-gradient(135deg,#10b981,#059669)', color: on ? '#ef4444' : '#fff' }),
    earningsRow: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 },
    earningCard: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '14px 12px' },
    rideRequestCard: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: 20, marginBottom: 14 },
    activeRideCard: { background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 20, padding: 20, marginBottom: 16 },
    actionBtn: (color) => ({ flex: 1, padding: 14, border: 'none', borderRadius: 12, background: `linear-gradient(135deg, ${color})`, color: '#fff', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' }),
    nav: { position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, display: 'flex', background: 'rgba(8,11,18,0.95)', borderTop: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', padding: '8px 0', zIndex: 50 },
    navBtn: (active) => ({ flex: 1, background: 'none', border: 'none', color: active ? '#10b981' : 'rgba(255,255,255,0.35)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, cursor: 'pointer', padding: 8 }),
  };

  const originCoords = activeRide?.origin?.coordinates;
  const destCoords = activeRide?.destination?.coordinates;

  return (
    <div style={s.app}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap'); @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      <Notification notification={notification} />

      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 18 }}>🚗 RideApp</span>
          <span style={s.badge}>Driver</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{user?.name?.split(' ')[0]}</span>
          <button style={{ background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 8, padding: '6px 10px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14 }} onClick={logout}>↩</button>
        </div>
      </div>

      {/* Map when on a ride */}
      {view === VIEWS.HOME && activeRide && (
        <div style={{ height: 240 }}>
          <RideMap origin={originCoords} destination={destCoords} driverLocation={driverPos} height="240px" />
        </div>
      )}

      <main style={s.main}>
        {view === VIEWS.HOME && (
          <>
            {/* Online toggle */}
            <div style={s.onlineCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={s.onlineDot(isOnline)} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{isOnline ? 'You are Online' : 'You are Offline'}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    {isOnline ? 'Receiving ride requests' : 'Go online to start earning'}
                  </div>
                </div>
              </div>
              <button style={s.toggleBtn(isOnline)} onClick={toggleOnline} disabled={togglingOnline}>
                {isOnline ? 'Go Offline' : 'Go Online'}
              </button>
            </div>

            {/* Earnings summary */}
            <div style={s.earningsRow}>
              {[
                { label: 'Total Earnings', value: `$${(user?.totalEarnings || 0).toFixed(2)}` },
                { label: 'Total Rides', value: user?.totalRides || 0 },
                { label: 'Rating', value: `⭐ ${user?.rating || '5.0'}` },
              ].map(({ label, value }) => (
                <div key={label} style={s.earningCard}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Active ride */}
            {activeRide && (
              <div style={s.activeRideCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16 }}>
                    {activeRide.status === 'accepted' ? 'Pick up passenger' : 'Ride in progress'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 28 }}>🧑</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{activeRide.passenger?.name}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>⭐ {activeRide.passenger?.rating}</div>
                  </div>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 800, color: '#10b981' }}>
                    ${activeRide.driverPayout}
                  </div>
                </div>

                <div style={{ marginBottom: 16, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                  <div style={{ marginBottom: 6 }}>📍 {activeRide.origin?.address}</div>
                  <div>🏁 {activeRide.destination?.address}</div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  {activeRide.status === 'accepted' && (
                    <button style={s.actionBtn('#3b82f6, #1d4ed8')} onClick={startRide}>🚗 Start Ride</button>
                  )}
                  {activeRide.status === 'in_progress' && (
                    <button style={s.actionBtn('#10b981, #059669')} onClick={completeRide}>✅ Complete</button>
                  )}
                </div>
              </div>
            )}

            {/* Pending ride requests */}
            {isOnline && !activeRide && pendingRides.length > 0 && (
              <>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
                  🔔 Ride Requests ({pendingRides.length})
                </div>
                {pendingRides.map((ride) => (
                  <div key={ride._id} style={s.rideRequestCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontWeight: 600 }}>🧑 {ride.passenger?.name}</span>
                      <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, color: '#10b981' }}>
                        ${ride.driverPayout}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>
                      <div>📍 {ride.origin?.address}</div>
                      <div style={{ marginTop: 4 }}>🏁 {ride.destination?.address}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
                      <span>📍 {ride.distanceText}</span>
                      <span>⏱ {ride.durationText}</span>
                      <span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 6 }}>{ride.rideType}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => rejectRide(ride._id)}
                        style={{ flex: 1, padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                        Reject
                      </button>
                      <button onClick={() => acceptRide(ride._id)}
                        style={{ flex: 2, padding: 12, background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>
                        Accept
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {isOnline && !activeRide && pendingRides.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.25)' }}>
                <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 3s infinite' }}>📡</div>
                <p>Waiting for ride requests...</p>
              </div>
            )}
          </>
        )}

        {view === VIEWS.HISTORY && (
          <>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Trip History</div>
            {history.length === 0 && <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingTop: 40 }}>No completed trips yet</p>}
            {history.map((ride) => (
              <div key={ride._id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{new Date(ride.createdAt).toLocaleDateString()}</span>
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, color: '#10b981' }}>${ride.driverPayout || ride.finalPrice}</span>
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>👤 {ride.passenger?.name}</p>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 8, display: 'flex', gap: 12 }}>
                  <span>{ride.distanceText}</span><span>{ride.durationText}</span><span>{ride.rideType}</span>
                </div>
              </div>
            ))}
          </>
        )}

        {view === VIEWS.PROFILE && (
          <div style={{ textAlign: 'center', paddingTop: 20 }}>
            <div style={{ fontSize: 72, marginBottom: 16 }}>🧑‍✈️</div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{user?.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 8 }}>{user?.email}</div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginBottom: 24 }}>{user?.phone}</div>
            {user?.vehicleInfo?.brand && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, textAlign: 'left', marginBottom: 16 }}>
                <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, marginBottom: 10 }}>🚗 Vehicle</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>{user.vehicleInfo.color} {user.vehicleInfo.brand} {user.vehicleInfo.model} ({user.vehicleInfo.year})</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontFamily: 'monospace', letterSpacing: 1 }}>{user.vehicleInfo.plate}</div>
              </div>
            )}
          </div>
        )}
      </main>

      <nav style={s.nav}>
        <button style={s.navBtn(view === VIEWS.HOME)} onClick={() => setView(VIEWS.HOME)}>🏠<br/>Home</button>
        <button style={s.navBtn(view === VIEWS.HISTORY)} onClick={() => { setView(VIEWS.HISTORY); ridesAPI.getHistory().then(({ data }) => setHistory(data.rides)); }}>📋<br/>History</button>
        <button style={s.navBtn(view === VIEWS.PROFILE)} onClick={() => setView(VIEWS.PROFILE)}>👤<br/>Profile</button>
      </nav>
    </div>
  );
}
