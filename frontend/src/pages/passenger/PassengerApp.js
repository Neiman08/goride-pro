import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRide } from '../../context/RideContext';
import { useGeolocation } from '../../hooks/useGeolocation';
import RideMap from '../../components/map/RideMap';
import BookingPanel from '../../components/passenger/BookingPanel';
import ActiveRideCard from '../../components/passenger/ActiveRideCard';
import Notification from '../../components/common/Notification';
import { ridesAPI } from '../../api/rides';

const VIEWS = { HOME: 'home', HISTORY: 'history', PROFILE: 'profile' };

export default function PassengerApp() {
  const { user, logout } = useAuth();
  const { activeRide, setActiveRide, driverLocation, notification, clearRide } = useRide();
  const { location: userLocation } = useGeolocation();
  const [view, setView] = useState(VIEWS.HOME);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data } = await ridesAPI.getHistory();
      setHistory(data.rides);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (view === VIEWS.HISTORY) loadHistory();
  }, [view]);

  const s = {
    app: { minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'DM Sans, sans-serif', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto', position: 'relative' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
    logo: { fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 18, color: '#fff' },
    badge: { background: 'rgba(124,77,255,0.2)', color: '#a78bfa', fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.5 },
    logoutBtn: { background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 8, padding: '6px 10px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14 },
    mapContainer: { height: 280, position: 'relative', flexShrink: 0 },
    main: { flex: 1, padding: 20, paddingBottom: 90, overflowY: 'auto' },
    nav: { position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, display: 'flex', background: 'rgba(10,10,15,0.95)', borderTop: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)', padding: '8px 0', zIndex: 50 },
    navBtn: (active) => ({ flex: 1, background: 'none', border: 'none', color: active ? '#7c4dff' : 'rgba(255,255,255,0.35)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 500, cursor: 'pointer', padding: 8 }),
    histCard: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 16, marginBottom: 12 },
    statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 },
    statCard: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20, textAlign: 'center' },
  };

  const originCoords = activeRide?.origin?.coordinates;
  const destCoords = activeRide?.destination?.coordinates;

  return (
    <div style={s.app}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500&display=swap');`}</style>
      <Notification notification={notification} />

      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={s.logo}>🚗 RideApp</span>
          <span style={s.badge}>Passenger</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Hi, {user?.name?.split(' ')[0]}</span>
          <button style={s.logoutBtn} onClick={logout}>↩ Out</button>
        </div>
      </div>

      {/* Map always visible on home */}
      {view === VIEWS.HOME && (
        <div style={s.mapContainer}>
          <RideMap
            origin={originCoords}
            destination={destCoords}
            driverLocation={driverLocation}
            userLocation={userLocation}
            height="280px"
          />
        </div>
      )}

      <main style={s.main}>
        {/* HOME */}
        {view === VIEWS.HOME && (
          <>
            {activeRide && ['searching', 'accepted', 'in_progress', 'completed'].includes(activeRide.status) ? (
              <ActiveRideCard
                ride={activeRide}
                onCancelled={clearRide}
                onCompleted={clearRide}
              />
            ) : (
              <BookingPanel onRideRequested={(ride) => setActiveRide(ride)} />
            )}
          </>
        )}

        {/* HISTORY */}
        {view === VIEWS.HISTORY && (
          <>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Ride History</div>
            {loadingHistory && <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>Loading...</p>}
            {!loadingHistory && history.length === 0 && <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingTop: 40 }}>No rides yet</p>}
            {history.map((ride) => (
              <div key={ride._id} style={s.histCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{new Date(ride.createdAt).toLocaleDateString()}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: ride.status === 'completed' ? '#10b981' : '#ef4444' }}>
                    {ride.status === 'completed' ? `$${ride.finalPrice}` : 'Cancelled'}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>📍 {ride.origin?.address}</p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>🏁 {ride.destination?.address}</p>
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                  <span>{ride.rideType}</span>
                  <span>{ride.distanceText}</span>
                  <span>{ride.durationText}</span>
                </div>
              </div>
            ))}
          </>
        )}

        {/* PROFILE */}
        {view === VIEWS.PROFILE && (
          <div style={{ textAlign: 'center', paddingTop: 20 }}>
            <div style={{ fontSize: 72, marginBottom: 16 }}>🧑</div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{user?.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 24 }}>{user?.email}</div>
            <div style={s.statGrid}>
              <div style={s.statCard}>
                <div style={{ fontSize: 28, fontFamily: 'Syne, sans-serif', fontWeight: 800 }}>{user?.totalRides || 0}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Total Rides</div>
              </div>
              <div style={s.statCard}>
                <div style={{ fontSize: 28, fontFamily: 'Syne, sans-serif', fontWeight: 800 }}>⭐ {user?.rating || '5.0'}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Rating</div>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav style={s.nav}>
        <button style={s.navBtn(view === VIEWS.HOME)} onClick={() => setView(VIEWS.HOME)}>🏠<br/>Home</button>
        <button style={s.navBtn(view === VIEWS.HISTORY)} onClick={() => setView(VIEWS.HISTORY)}>📋<br/>History</button>
        <button style={s.navBtn(view === VIEWS.PROFILE)} onClick={() => setView(VIEWS.PROFILE)}>👤<br/>Profile</button>
      </nav>
    </div>
  );
}
