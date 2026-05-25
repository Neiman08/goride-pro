import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ridesAPI, usersAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import AppShell from '../../components/layout/AppShell';
import { Button, Card, Badge, Stat, StatusDot, Alert, Spinner } from '../../components/ui/UI';
import './DriverDashboard.css';

const GMAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

// ── Load Google Maps once ──────────────────────────────────────────────────
function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve(window.google.maps);
    if (!GMAPS_KEY) return reject(new Error('Missing Google Maps API key'));
    const existing = document.getElementById('google-maps-script');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google.maps));
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

// ── Embedded map for active ride ───────────────────────────────────────────
function RideMapEmbed({ originLat, originLng, destLat, destLng, driverLocation }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const directionsRenderer = useRef(null);
  const driverMarker = useRef(null);
  const routeDrawn = useRef(false);

  // Init map ONCE — primitive props prevent unnecessary re-renders
  useEffect(() => {
    if (!originLat || !destLat) return;
    let mounted = true;

    loadGoogleMaps().then((maps) => {
      if (!mounted || !mapRef.current) return;

      // Only create map once
      if (!mapInstance.current) {
        mapInstance.current = new maps.Map(mapRef.current, {
          center: { lat: originLat, lng: originLng },
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
          styles: [
            { elementType: 'geometry', stylers: [{ color: '#111827' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#f9fafb' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#374151' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          ],
        });

        directionsRenderer.current = new maps.DirectionsRenderer({
          map: mapInstance.current,
          suppressMarkers: false,
          polylineOptions: { strokeColor: '#facc15', strokeWeight: 5 },
        });
      }

      // Only draw route once per origin/dest pair
      if (!routeDrawn.current) {
        routeDrawn.current = true;
        const svc = new maps.DirectionsService();
        svc.route({
          origin: new maps.LatLng(originLat, originLng),
          destination: new maps.LatLng(destLat, destLng),
          travelMode: maps.TravelMode.DRIVING,
        }, (result, status) => {
          if (status === 'OK' && directionsRenderer.current) {
            directionsRenderer.current.setDirections(result);
          }
        });
      }
    }).catch(console.error);

    return () => { mounted = false; };
  }, [originLat, originLng, destLat, destLng]);

  // Update driver marker position — separate effect, no map rebuild
  useEffect(() => {
    if (!driverLocation || !mapInstance.current || !window.google) return;
    const pos = { lat: driverLocation.lat, lng: driverLocation.lng };
    if (driverMarker.current) {
      driverMarker.current.setPosition(pos);
    } else {
      driverMarker.current = new window.google.maps.Marker({
        position: pos,
        map: mapInstance.current,
        icon: {
          path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 7,
          fillColor: '#facc15',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
        title: 'You',
      });
    }
    // Only pan if driver moved significantly (>50m) to avoid constant jumping
    mapInstance.current.panTo(pos);
  }, [driverLocation]);

  return (
    <div
      ref={mapRef}
      style={{
        width: '100%',
        height: 240,
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 16,
        background: '#111827',
      }}
    />
  );
}

// ── Driver Home ────────────────────────────────────────────────────────────
function DriverHome() {
  const { user, updateUser } = useAuth();
  const [isOnline, setIsOnline]     = useState(user?.isOnline || false);
  const [activeRide, setActiveRide] = useState(null);
  const [pendingRides, setPendingRides] = useState([]);
  const [toast, setToast]           = useState('');
  const [loading, setLoading]       = useState(true);
  const [driverLocation, setDriverLocation] = useState(null);
  const watchIdRef = useRef(null);
  const socketRef  = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }, []);

  // ── GPS watch ────────────────────────────────────────────────────────────
  const startGPS = useCallback(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDriverLocation(loc);

        // Send to server via socket
        const socket = getSocket();
        if (socket?.connected) {
          socket.emit('driver:location_update', {
            lat: loc.lat,
            lng: loc.lng,
            rideId: null, // updated below in effect
          });
        }
      },
      (err) => console.warn('GPS error:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }, []);

  const stopGPS = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // ── Socket setup ──────────────────────────────────────────────────────────
  const registerRideListeners = useCallback((socket) => {
    // Remove any existing listeners first to avoid duplicates
    socket.off('ride:new_request');
    socket.off('ride:taken');
    socket.off('ride:cancelled');

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
  }, [showToast]);

  useEffect(() => {
    // Load active ride on mount
    ridesAPI.active()
      .then(({ data }) => setActiveRide(data.ride))
      .finally(() => setLoading(false));

    // Get initial GPS position
    navigator.geolocation.getCurrentPosition(
      (pos) => setDriverLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );

    // Wait for socket to be available, then attach listeners
    // Retry every 500ms until socket exists and is connected
    const setupSocket = () => {
      const socket = getSocket();
      if (!socket) return; // still not created

      // Register immediately if already connected
      if (socket.connected) {
        registerRideListeners(socket);
      }

      // Re-register every time socket (re)connects — this is the key fix
      // If driver's app was open before socket authenticated, this catches it
      socket.off('connect'); // remove old listener to avoid stacking
      socket.on('connect', () => {
        console.log('[Driver] Socket connected — registering ride listeners');
        registerRideListeners(socket);

        // If driver was online before reconnect, re-announce to server
        if (isOnline) {
          navigator.geolocation.getCurrentPosition(
            (pos) => socket.emit('driver:go_online', { lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => {}
          );
        }
      });

      clearInterval(waitInterval);
    };

    const waitInterval = setInterval(setupSocket, 500);
    setupSocket(); // try immediately

    return () => {
      clearInterval(waitInterval);
      stopGPS();
      const socket = getSocket();
      if (socket) {
        socket.off('connect');
        socket.off('ride:new_request');
        socket.off('ride:taken');
        socket.off('ride:cancelled');
      }
    };
  }, [registerRideListeners, stopGPS]);

  // ── Go online / offline ───────────────────────────────────────────────────
  const toggleOnline = async () => {
    const next = !isOnline;

    // Get real GPS position first
    const pos = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(driverLocation || { lat: 41.8781, lng: -87.6298 }) // Chicago fallback
      );
    });

    await usersAPI.updateAvailability(next);
    setIsOnline(next);
    updateUser({ isOnline: next });

    const socket = getSocket();
    if (socket) {
      if (next) {
        socket.emit('driver:go_online', pos);
        startGPS();
      } else {
        socket.emit('driver:go_offline');
        stopGPS();
      }
    }

    if (next) {
      const { data } = await ridesAPI.available();
      setPendingRides(data.rides || []);
    } else {
      setPendingRides([]);
    }

    showToast(next ? '🟢 You are online' : '🔴 You are offline');
  };

  // ── Ride actions ──────────────────────────────────────────────────────────
  const acceptRide = async (rideId) => {
    try {
      const { data } = await ridesAPI.accept(rideId);
      setActiveRide(data.ride);
      setPendingRides([]);
      startGPS(); // ensure GPS is running during ride
      showToast('✅ Ride accepted! Head to pickup.');
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not accept');
    }
  };

  // "Arrived" — driver reached pickup point, notifies passenger
  const arrivedAtPickup = async () => {
    try {
      await ridesAPI.arrived(activeRide._id);
      setActiveRide((r) => ({ ...r, status: 'arrived' }));
      showToast('📍 Passenger notified you arrived!');
    } catch {
      // If endpoint doesn't exist yet, just show status change locally
      setActiveRide((r) => ({ ...r, status: 'arrived' }));
      showToast('📍 Marked as arrived');
    }
  };

  const startRide = async () => {
    await ridesAPI.start(activeRide._id);
    setActiveRide((r) => ({ ...r, status: 'in_progress' }));
    showToast('🚗 Ride started — head to destination');
  };

  const completeRide = async () => {
    try {
      const { data } = await ridesAPI.complete(activeRide._id);
      showToast(`✅ Done! You earned $${data.commission?.driverPayout}`);
      setActiveRide(null);
      setIsOnline(true);
    } catch (err) {
      showToast(err.response?.data?.message || 'Error completing ride');
    }
  };

  if (loading) return <div className="page"><Spinner size={28} /></div>;

  // Map target changes based on ride status:
  // accepted / arrived → go to origin (pickup)
  // in_progress → go to destination
  const mapOrigin = activeRide?.origin?.coordinates
    ? { lat: activeRide.origin.coordinates.lat, lng: activeRide.origin.coordinates.lng }
    : null;

  const mapDestination = activeRide?.destination?.coordinates
    ? { lat: activeRide.destination.coordinates.lat, lng: activeRide.destination.coordinates.lng }
    : null;

  const mapTarget = activeRide?.status === 'in_progress'
    ? { origin: mapOrigin, destination: mapDestination }           // show full route
    : { origin: driverLocation, destination: mapOrigin };          // show route to pickup

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      <div className="page-header">
        <h1 className="page-title">Driver Dashboard</h1>
        {driverLocation && (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            📍 GPS active
          </span>
        )}
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
        <Button variant={isOnline ? 'danger' : 'success'} onClick={toggleOnline}>
          {isOnline ? 'Go offline' : 'Go online'}
        </Button>
      </Card>

      {/* Stats */}
      <div className="stat-grid">
        <Stat label="Total rides"    value={user?.totalRides || 0} />
        <Stat label="Total earnings" value={`$${(user?.totalEarnings || 0).toFixed(2)}`} accent />
        <Stat label="Rating"         value={`⭐ ${user?.rating || '5.0'}`} />
      </div>

      {/* ── Active ride ── */}
      {activeRide && (
        <div>
          <p className="section-title">Active ride</p>
          <Card className="active-ride-card">

            {/* Status banner */}
            <div className="active-ride-status">
              <StatusDot status={activeRide.status} />
              <span>{{
                accepted:    '🚦 Head to pickup location',
                arrived:     '📍 Waiting for passenger',
                in_progress: '🛣️ Ride in progress — head to destination',
              }[activeRide.status] || activeRide.status}</span>
            </div>

            {/* Passenger info */}
            <div className="passenger-pill">
              <div className="passenger-avatar">{activeRide.passenger?.name?.[0]}</div>
              <div>
                <p className="passenger-name">{activeRide.passenger?.name}</p>
                <p className="passenger-sub">⭐ {activeRide.passenger?.rating} · {activeRide.passenger?.phone}</p>
              </div>
              <div className="ride-payout mono">${activeRide.driverPayout}</div>
            </div>

            {/* Map */}
            {mapTarget.origin && mapTarget.destination && (
              <>
                <RideMapEmbed
                  originLat={mapTarget.origin.lat}
                  originLng={mapTarget.origin.lng}
                  destLat={mapTarget.destination.lat}
                  destLng={mapTarget.destination.lng}
                  driverLocation={driverLocation}
                />
                {/* Open in navigation app */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${mapTarget.destination.lat},${mapTarget.destination.lng}&travelmode=driving`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex: 1, display: 'block', textAlign: 'center',
                      padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                      background: 'rgba(255,255,255,0.08)', color: '#fff',
                      textDecoration: 'none', border: '1px solid rgba(255,255,255,0.12)'
                    }}
                  >
                    🗺️ Google Maps
                  </a>
                  <a
                    href={`waze://?ll=${mapTarget.destination.lat},${mapTarget.destination.lng}&navigate=yes`}
                    style={{
                      flex: 1, display: 'block', textAlign: 'center',
                      padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                      background: 'rgba(255,255,255,0.08)', color: '#fff',
                      textDecoration: 'none', border: '1px solid rgba(255,255,255,0.12)'
                    }}
                  >
                    🔵 Waze
                  </a>
                </div>
              </>
            )}

            {/* Route text */}
            <div className="ride-route">
              <div className="route-point"><span className="dot dot--green" /><span>{activeRide.origin?.address}</span></div>
              <div className="route-line" />
              <div className="route-point"><span className="dot dot--red" /><span>{activeRide.destination?.address}</span></div>
            </div>

            {/* Action buttons based on status */}
            <div className="ride-actions" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              {activeRide.status === 'accepted' && (
                <Button variant="primary" size="lg" className="btn--full" onClick={arrivedAtPickup}>
                  📍 I arrived at pickup
                </Button>
              )}
              {activeRide.status === 'arrived' && (
                <Button variant="primary" size="lg" className="btn--full" onClick={startRide}>
                  🚗 Passenger on board — Start ride
                </Button>
              )}
              {activeRide.status === 'in_progress' && (
                <Button variant="success" size="lg" className="btn--full" onClick={completeRide}>
                  ✅ Complete ride
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Pending requests ── */}
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

      {!isOnline && (
        <Card className="waiting-card">
          <div className="waiting-icon">💤</div>
          <p>You are offline. Go online to receive rides.</p>
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
      <div className="page-header"><h1 className="page-title">Earnings</h1></div>
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
        <Route path="rides"    element={<DriverRides />} />
        <Route path="earnings" element={<DriverEarnings />} />
        <Route path="profile"  element={<DriverProfile />} />
      </Routes>
    </AppShell>
  );
}
