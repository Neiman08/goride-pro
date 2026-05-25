import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useJsApiLoader } from '@react-google-maps/api';
import { useAuth } from '../../context/AuthContext';
import { ridesAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import { useGeolocation } from '../../hooks/useGeolocation';
import AppShell from '../../components/layout/AppShell';
import RideMap from '../../components/map/RideMap';
import PlacesInput from '../../components/common/PlacesInput';
import { Button, Card, Badge, Stat, StatusDot, Alert, Spinner } from '../../components/ui/UI';
import './PassengerDashboard.css';

const LIBRARIES = ['places', 'geometry'];
const RIDE_TYPES = [
  { id: 'economy', icon: '🚗', label: 'Economy',  desc: 'Affordable, everyday' },
  { id: 'comfort', icon: '🚙', label: 'Comfort',   desc: 'Newer cars, more legroom' },
  { id: 'xl',      icon: '🚐', label: 'XL',        desc: 'Up to 6 passengers' },
];
const STATUS_LABEL = {
  searching:   'Finding your driver…',
  accepted:    'Driver on the way',
  in_progress: 'Ride in progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
};

// ── Book Ride (with real map) ───────────────────────────────────────────────
function BookRide() {
  const navigate  = useNavigate();
  const { location: userLocation } = useGeolocation();

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '',
    libraries: LIBRARIES,
  });

  const [origin, setOrigin]           = useState(null);
  const [destination, setDestination] = useState(null);
  const [rideType, setRideType]       = useState('economy');
  const [fares, setFares]             = useState(null);
  const [route, setRoute]             = useState(null);
  const [loading, setLoading]         = useState(false);
  const [estimating, setEstimating]   = useState(false);
  const [error, setError]             = useState('');

  // Get estimate whenever both locations set
  useEffect(() => {
    if (!origin || !destination) return;
    setEstimating(true);
    ridesAPI.estimate({
      originLat: origin.coordinates.lat, originLng: origin.coordinates.lng,
      destLat:   destination.coordinates.lat, destLng: destination.coordinates.lng,
    })
      .then(({ data }) => { setFares(data.fares); setRoute(data.route); })
      .catch(() => {})
      .finally(() => setEstimating(false));
  }, [origin, destination]);

  const handleRequest = async () => {
    if (!origin || !destination) return setError('Select pickup and destination');
    setLoading(true); setError('');
    try {
      await ridesAPI.request({ origin, destination, rideType });
      navigate('/passenger');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not request ride');
    } finally { setLoading(false); }
  };

  return (
    <div className="book-layout">
      {/* Left panel */}
      <div className="book-panel">
        <div className="page-header">
          <h1 className="page-title">Book a ride</h1>
        </div>

        {/* Location inputs */}
        <div className="location-stack">
          {isLoaded ? (
            <>
              <PlacesInput
                placeholder="Pickup location"
                dotColor="var(--green)"
                value={origin?.address || ''}
                onSelect={setOrigin}
              />
              <div className="location-connector">
                <div className="connector-line" />
              </div>
              <PlacesInput
                placeholder="Where to?"
                dotColor="var(--red)"
                value={destination?.address || ''}
                onSelect={setDestination}
              />
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <Spinner size={20} />
            </div>
          )}
        </div>

        {/* Route summary */}
        {route && (
          <div className="route-summary">
            <span>📍 {route.distanceText}</span>
            <span>⏱ {route.durationText}</span>
          </div>
        )}

        {/* Ride type selector */}
        <p className="section-title">Choose ride type</p>
        <div className="ride-type-list">
          {RIDE_TYPES.map((t) => (
            <div
              key={t.id}
              className={`ride-type-row ${rideType === t.id ? 'active' : ''}`}
              onClick={() => setRideType(t.id)}
            >
              <span className="ride-type-icon">{t.icon}</span>
              <div className="ride-type-info">
                <span className="ride-type-name">{t.label}</span>
                <span className="ride-type-desc">{t.desc}</span>
              </div>
              <div className="ride-type-right">
                {estimating
                  ? <Spinner size={14} />
                  : fares?.[t.id]
                    ? <span className="ride-type-price">${fares[t.id].totalFare}</span>
                    : null}
              </div>
            </div>
          ))}
        </div>

        {/* Fare breakdown */}
        {fares?.[rideType] && (
          <div className="fare-breakdown">
            <span>Base <b>${fares[rideType].baseFare}</b></span>
            <span>Distance <b>${fares[rideType].distanceCost}</b></span>
            <span>Time <b>${fares[rideType].timeCost}</b></span>
            {fares[rideType].surgeActive && (
              <Badge variant="warning">🔥 Surge ×{fares[rideType].surgeMultiplier}</Badge>
            )}
          </div>
        )}

        {error && <Alert message={error} onClose={() => setError('')} />}

        <Button
          variant="primary" size="lg" className="btn--full"
          loading={loading}
          disabled={!origin || !destination}
          onClick={handleRequest}
        >
          {fares?.[rideType]
            ? `Request ${RIDE_TYPES.find(t=>t.id===rideType)?.label} — $${fares[rideType].totalFare}`
            : 'Request ride'}
        </Button>
      </div>

      {/* Map */}
      <div className="book-map">
        <RideMap
          origin={origin?.coordinates}
          destination={destination?.coordinates}
          userLocation={userLocation}
          height="100%"
        />
      </div>
    </div>
  );
}

// ── Passenger Home ─────────────────────────────────────────────────────────
function PassengerHome() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [activeRide, setActiveRide]     = useState(null);
  const [driverLoc, setDriverLoc]       = useState(null);
  const [loading, setLoading]           = useState(true);
  const [toast, setToast]               = useState('');
  const { location: userLocation }      = useGeolocation();

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }, []);

  useEffect(() => {
    ridesAPI.active().then(({ data }) => {
      setActiveRide(data.ride);
    }).finally(() => setLoading(false));

    const socket = getSocket();
    if (!socket) return;

    socket.on('ride:accepted',  (r) => { setActiveRide(r); showToast(`🎉 ${r.driver.name} accepted!`); });
    socket.on('ride:driver_arrived', (d) => showToast(`📍 ${d.driverName} arrived! Get ready.`));
    socket.on('ride:started',   ()  => showToast('🚗 Ride started!'));
    socket.on('ride:completed', (d) => { showToast(`✅ Done — $${d.finalPrice}`); setActiveRide(null); setDriverLoc(null); });
    socket.on('ride:cancelled', (d) => { showToast(`❌ Cancelled by ${d.cancelledBy}`); setActiveRide(null); setDriverLoc(null); });
    socket.on('ride:driver_moved', ({ lat, lng }) => setDriverLoc({ lat, lng }));

    return () => {
      ['ride:accepted','ride:driver_arrived','ride:started','ride:completed','ride:cancelled','ride:driver_moved']
        .forEach((ev) => socket.off(ev));
    };
  }, [showToast]);

  // Join ride socket room when active ride is set
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !activeRide?._id) return;
    socket.emit('ride:join', { rideId: activeRide._id });
    return () => socket.emit('ride:leave', { rideId: activeRide._id });
  }, [activeRide?._id]);

  const cancelRide = async () => {
    await ridesAPI.cancel(activeRide._id, 'Cancelled by passenger');
    setActiveRide(null);
    setDriverLoc(null);
  };

  if (loading) return <div className="page"><Spinner size={28} /></div>;

  return (
    <div className={activeRide ? 'ride-layout' : 'page'}>
      {toast && <div className="toast">{toast}</div>}

      {/* ── Active ride: split layout with map ─────────────────────────── */}
      {activeRide ? (
        <>
          {/* Live map */}
          <div className="ride-map-container">
            <RideMap
              origin={activeRide.origin?.coordinates}
              destination={activeRide.destination?.coordinates}
              driverLocation={driverLoc}
              userLocation={userLocation}
              height="100%"
            />
          </div>

          {/* Info panel */}
          <div className="ride-info-panel">
            <div className="active-ride-status">
              <StatusDot status={activeRide.status} />
              <span className="active-ride-status-text">{STATUS_LABEL[activeRide.status]}</span>
            </div>

            <div className="ride-route">
              <div className="route-point"><span className="dot dot--green" /><span>{activeRide.origin?.address}</span></div>
              <div className="route-line" />
              <div className="route-point"><span className="dot dot--red" /><span>{activeRide.destination?.address}</span></div>
            </div>

            <div className="ride-meta">
              <span className="mono">${activeRide.estimatedPrice}</span>
              <span>{activeRide.distanceText}</span>
              <span>{activeRide.durationText}</span>
              <Badge variant="default">{activeRide.rideType}</Badge>
            </div>

            {activeRide.driver && (
              <div className="driver-pill">
                <div className="driver-pill-avatar">{activeRide.driver.name?.[0]}</div>
                <div style={{ flex: 1 }}>
                  <p className="driver-pill-name">{activeRide.driver.name}</p>
                  <p className="driver-pill-sub">
                    ⭐ {activeRide.driver.rating} · {activeRide.driver.vehicleInfo?.color} {activeRide.driver.vehicleInfo?.brand} · <span className="mono">{activeRide.driver.vehicleInfo?.plate}</span>
                  </p>
                </div>
              </div>
            )}

            {['searching', 'accepted'].includes(activeRide.status) && (
              <Button variant="danger" size="sm" onClick={cancelRide}>Cancel ride</Button>
            )}
          </div>
        </>
      ) : (
        /* ── No active ride: normal home ─────────────────────────────── */
        <>
          <div className="page-header">
            <h1 className="page-title">Hey, {user?.name?.split(' ')[0]} 👋</h1>
            <p className="page-sub">Where are you headed?</p>
          </div>

          <div className="stat-grid">
            <Stat label="Total rides" value={user?.totalRides || 0} />
            <Stat label="Rating"      value={`⭐ ${user?.rating || '5.0'}`} />
          </div>

          <Card className="book-cta-card">
            <h2>Ready to ride?</h2>
            <p>Real-time tracking, transparent pricing.</p>
            <Button variant="primary" size="lg" onClick={() => navigate('/passenger/book')}>
              Book a ride →
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}

// ── History ────────────────────────────────────────────────────────────────
function RideHistory() {
  const [rides, setRides]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ridesAPI.history().then(({ data }) => setRides(data.rides)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">Ride history</h1></div>
      {loading ? <Spinner size={28} /> : (
        <div className="history-list">
          {rides.length === 0 && <p className="empty-state">No rides yet</p>}
          {rides.map((r) => (
            <Card key={r._id} className="history-card">
              <div className="history-header">
                <Badge variant={r.status === 'completed' ? 'success' : 'danger'}>{r.status}</Badge>
                <span className="mono history-price">${r.finalPrice ?? r.estimatedPrice}</span>
              </div>
              <div className="history-route">
                <p>📍 {r.origin?.address}</p>
                <p>🏁 {r.destination?.address}</p>
              </div>
              <div className="history-meta">
                <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                <span>{r.distanceText}</span>
                <Badge variant="default">{r.rideType}</Badge>
                {r.driver && <span>Driver: {r.driver.name}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Profile ────────────────────────────────────────────────────────────────
function PassengerProfile() {
  const { user } = useAuth();
  return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">Profile</h1></div>
      <Card>
        <div className="profile-avatar-lg">{user?.name?.[0]?.toUpperCase()}</div>
        <h2 className="profile-name">{user?.name}</h2>
        <p className="profile-email">{user?.email}</p>
        <div className="stat-grid" style={{ marginTop: 24 }}>
          <Stat label="Total rides" value={user?.totalRides || 0} />
          <Stat label="Rating"      value={`⭐ ${user?.rating}`} />
        </div>
      </Card>
    </div>
  );
}

// ── Router ─────────────────────────────────────────────────────────────────
export default function PassengerDashboard() {
  return (
    <AppShell>
      <Routes>
        <Route index         element={<PassengerHome />} />
        <Route path="book"   element={<BookRide />} />
        <Route path="history" element={<RideHistory />} />
        <Route path="profile" element={<PassengerProfile />} />
      </Routes>
    </AppShell>
  );
}
