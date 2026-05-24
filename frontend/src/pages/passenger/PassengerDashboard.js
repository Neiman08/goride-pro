import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ridesAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import AppShell from '../../components/layout/AppShell';
import { Button, Card, Badge, Stat, StatusDot, Alert, Spinner } from '../../components/ui/UI';
import './PassengerDashboard.css';

const STATUS_LABEL = {
  searching: 'Finding your driver…',
  accepted: 'Driver on the way',
  in_progress: 'Ride in progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const RIDE_TYPES = [
  { id: 'economy', icon: '🚗', label: 'Economy', desc: 'Affordable, everyday' },
  { id: 'comfort', icon: '🚙', label: 'Comfort', desc: 'Newer cars, more legroom' },
  { id: 'xl', icon: '🚐', label: 'XL', desc: 'Up to 6 passengers' },
];

const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve(window.google.maps);
    if (!GOOGLE_KEY) return reject(new Error('Missing Google Maps API key'));

    const existing = document.getElementById('google-maps-script');
    if (existing) {
      existing.onload = () => resolve(window.google.maps);
      existing.onerror = reject;
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

function PassengerHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeRide, setActiveRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  useEffect(() => {
    ridesAPI.active()
      .then(({ data }) => setActiveRide(data.ride))
      .finally(() => setLoading(false));

    const socket = getSocket();
    if (!socket) return;

    const showToast = (msg) => {
      setToast(msg);
      setTimeout(() => setToast(''), 4000);
    };

    const handlers = {
      'ride:accepted': (r) => {
        setActiveRide(r);
        showToast(`🎉 ${r.driver.name} accepted your ride!`);
      },
      'ride:started': () => showToast('🚗 Ride started!'),
      'ride:completed': (d) => {
        showToast(`✅ Ride complete — $${d.finalPrice}`);
        setActiveRide(null);
      },
      'ride:cancelled': (d) => {
        showToast(`❌ Cancelled by ${d.cancelledBy}`);
        setActiveRide(null);
      },
    };

    Object.entries(handlers).forEach(([ev, fn]) => socket.on(ev, fn));
    return () => Object.keys(handlers).forEach((ev) => socket.off(ev));
  }, []);

  const cancelRide = async () => {
    await ridesAPI.cancel(activeRide._id, 'Cancelled by passenger');
    setActiveRide(null);
  };

  if (loading) return <div className="page"><Spinner size={28} /></div>;

  return (
    <div className="page">
      {toast && <div className="toast">{toast}</div>}

      <div className="page-header">
        <h1 className="page-title">Hey, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="page-sub">Where are you headed today?</p>
      </div>

      <div className="stat-grid">
        <Stat label="Total rides" value={user?.totalRides || 0} />
        <Stat label="Rating" value={`⭐ ${user?.rating || '5.0'}`} />
      </div>

      {activeRide ? (
        <ActiveRideCard ride={activeRide} onCancel={cancelRide} />
      ) : (
        <Card className="book-cta-card">
          <h2>Ready to ride?</h2>
          <p>Get a car in minutes, tracked in real time.</p>
          <Button variant="primary" size="lg" onClick={() => navigate('/passenger/book')}>
            Book a ride →
          </Button>
        </Card>
      )}
    </div>
  );
}

function ActiveRideCard({ ride, onCancel }) {
  return (
    <Card className="active-ride">
      <div className="active-ride-status">
        <StatusDot status={ride.status} />
        <span className="active-ride-status-text">{STATUS_LABEL[ride.status]}</span>
      </div>

      <div className="ride-route">
        <div className="route-point">
          <span className="dot dot--green" />
          <span>{ride.origin?.address}</span>
        </div>
        <div className="route-line" />
        <div className="route-point">
          <span className="dot dot--red" />
          <span>{ride.destination?.address}</span>
        </div>
      </div>

      <div className="ride-meta">
        <span className="mono">${ride.estimatedPrice}</span>
        <span>{ride.distanceText}</span>
        <span>{ride.durationText}</span>
        <Badge variant="default">{ride.rideType}</Badge>
      </div>

      {ride.driver && (
        <div className="driver-pill">
          <div className="driver-pill-avatar">{ride.driver.name?.[0]}</div>
          <div>
            <p className="driver-pill-name">{ride.driver.name}</p>
            <p className="driver-pill-sub">
              ⭐ {ride.driver.rating} · {ride.driver.vehicleInfo?.color} {ride.driver.vehicleInfo?.brand} · {ride.driver.vehicleInfo?.plate}
            </p>
          </div>
        </div>
      )}

      {['searching', 'accepted'].includes(ride.status) && (
        <Button variant="danger" size="sm" onClick={onCancel}>Cancel ride</Button>
      )}
    </Card>
  );
}

function BookRide() {
  const navigate = useNavigate();

  const mapRef = useRef(null);
  const originInputRef = useRef(null);
  const destinationInputRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const originMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);

  const [origin, setOrigin] = useState({
    address: '',
    coordinates: { lat: 41.8781, lng: -87.6298 },
  });

  const [destination, setDestination] = useState({
    address: '',
    coordinates: { lat: 41.9742, lng: -87.9073 },
  });

  const [rideType, setRideType] = useState('economy');
  const [fares, setFares] = useState(null);
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let mounted = true;

    loadGoogleMaps()
      .then((maps) => {
        if (!mounted || !mapRef.current) return;

        const chicago = { lat: 41.8781, lng: -87.6298 };

        mapInstanceRef.current = new maps.Map(mapRef.current, {
          center: chicago,
          zoom: 10,
          disableDefaultUI: true,
          zoomControl: true,
          styles: [
            { elementType: 'geometry', stylers: [{ color: '#111827' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#f9fafb' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#374151' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
          ],
        });

        directionsRendererRef.current = new maps.DirectionsRenderer({
          map: mapInstanceRef.current,
          suppressMarkers: true,
          polylineOptions: {
            strokeColor: '#facc15',
            strokeWeight: 5,
          },
        });

        const originAutocomplete = new maps.places.Autocomplete(originInputRef.current, {
          fields: ['formatted_address', 'geometry', 'name'],
        });

        const destAutocomplete = new maps.places.Autocomplete(destinationInputRef.current, {
          fields: ['formatted_address', 'geometry', 'name'],
        });

        originAutocomplete.addListener('place_changed', () => {
          const place = originAutocomplete.getPlace();
          if (!place.geometry?.location) return;

          setConfirming(false);
          setFares(null);

          setOrigin({
            address: place.formatted_address || place.name || '',
            coordinates: {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            },
          });
        });

        destAutocomplete.addListener('place_changed', () => {
          const place = destAutocomplete.getPlace();
          if (!place.geometry?.location) return;

          setConfirming(false);
          setFares(null);

          setDestination({
            address: place.formatted_address || place.name || '',
            coordinates: {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            },
          });
        });
      })
      .catch(() => setError('Google Maps could not load. Check API key.'));

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!origin.address || !destination.address) return;

    const maps = window.google?.maps;
    if (!maps || !mapInstanceRef.current) return;

    const originLatLng = new maps.LatLng(origin.coordinates.lat, origin.coordinates.lng);
    const destLatLng = new maps.LatLng(destination.coordinates.lat, destination.coordinates.lng);

    if (originMarkerRef.current) originMarkerRef.current.setMap(null);
    if (destinationMarkerRef.current) destinationMarkerRef.current.setMap(null);

    originMarkerRef.current = new maps.Marker({
      position: originLatLng,
      map: mapInstanceRef.current,
      label: 'A',
    });

    destinationMarkerRef.current = new maps.Marker({
      position: destLatLng,
      map: mapInstanceRef.current,
      label: 'B',
    });

    const directionsService = new maps.DirectionsService();

    directionsService.route(
      {
        origin: originLatLng,
        destination: destLatLng,
        travelMode: maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK') {
          directionsRendererRef.current.setDirections(result);
        } else {
          const bounds = new maps.LatLngBounds();
          bounds.extend(originLatLng);
          bounds.extend(destLatLng);
          mapInstanceRef.current.fitBounds(bounds);
        }
      }
    );

    getEstimate();
  }, [origin, destination]);

  const getEstimate = async () => {
    if (!origin.address || !destination.address) return;

    setEstimating(true);
    setError('');

    try {
      const { data } = await ridesAPI.estimate({
        originLat: origin.coordinates.lat,
        originLng: origin.coordinates.lng,
        destLat: destination.coordinates.lat,
        destLng: destination.coordinates.lng,
      });

      setFares(data.fares);
      setRoute(data.route);
    } catch (err) {
      setFares(null);
      setError(err.response?.data?.message || 'Could not calculate fare');
    } finally {
      setEstimating(false);
    }
  };

  const handleShowConfirmation = () => {
    setError('');

    if (!origin.address || !destination.address) {
      return setError('Fill in both addresses');
    }

    if (estimating && !fares) {
      return setError('Please wait, fare is still calculating');
    }

    if (!fares?.[rideType]) {
      return setError('Wait for the fare estimate first');
    }

    setConfirming(true);
  };

  const handleRequest = async () => {
    if (!origin.address || !destination.address) {
      return setError('Fill in both addresses');
    }

    if (!fares?.[rideType]) {
      return setError('Wait for the fare estimate first');
    }

    setLoading(true);
    setError('');

    try {
      await ridesAPI.request({ origin, destination, rideType });
      setConfirming(false);
      navigate('/passenger');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not request ride');
    } finally {
      setLoading(false);
    }
  };

  const selectedFare = fares?.[rideType];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Book a ride</h1>
      </div>

      <Card className="book-form">
        <div className="location-stack">
          <div className="location-row">
            <span className="dot dot--green" />
            <input
              ref={originInputRef}
              className="location-input"
              placeholder="Pickup location"
              value={origin.address}
              onChange={(e) => {
                setConfirming(false);
                setFares(null);
                setOrigin((o) => ({ ...o, address: e.target.value }));
              }}
            />
          </div>

          <div className="location-divider" />

          <div className="location-row">
            <span className="dot dot--red" />
            <input
              ref={destinationInputRef}
              className="location-input"
              placeholder="Where to?"
              value={destination.address}
              onChange={(e) => {
                setConfirming(false);
                setFares(null);
                setDestination((d) => ({ ...d, address: e.target.value }));
              }}
            />
          </div>
        </div>

        <div
          ref={mapRef}
          className="map-placeholder"
          style={{
            minHeight: 260,
            overflow: 'hidden',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 20,
          }}
        />

        {route && (
          <div className="fare-breakdown" style={{ marginBottom: 16 }}>
            <span>Distance: <b>{route.distanceText}</b></span>
            <span>Time: <b>{route.durationText}</b></span>
          </div>
        )}

        <p className="section-title">Choose ride type</p>

        <div className="ride-type-list">
          {RIDE_TYPES.map((t) => (
            <div
              key={t.id}
              className={`ride-type-row ${rideType === t.id ? 'active' : ''}`}
              onClick={() => {
                setConfirming(false);
                setRideType(t.id);
              }}
            >
              <span className="ride-type-icon">{t.icon}</span>

              <div className="ride-type-info">
                <span className="ride-type-name">{t.label}</span>
                <span className="ride-type-desc">{t.desc}</span>
              </div>

              {fares?.[t.id] ? (
                <span className="ride-type-price mono">${fares[t.id].totalFare}</span>
              ) : estimating ? (
                <Spinner size={14} />
              ) : null}
            </div>
          ))}
        </div>

        {selectedFare && (
          <div className="fare-breakdown">
            <span>Base: <b className="mono">${selectedFare.baseFare}</b></span>
            <span>Distance: <b className="mono">${selectedFare.distanceCost}</b></span>
            <span>Time: <b className="mono">${selectedFare.timeCost}</b></span>
            {selectedFare.surgeActive && (
              <Badge variant="warning">🔥 Surge ×{selectedFare.surgeMultiplier}</Badge>
            )}
          </div>
        )}

        {error && <Alert message={error} onClose={() => setError('')} />}

        {!confirming ? (
          <Button
            variant="primary"
            size="lg"
            className="btn--full"
            loading={loading}
            onClick={handleShowConfirmation}
          >
            {selectedFare ? `Confirm ${rideType} ride — $${selectedFare.totalFare}` : `Request ${rideType} ride`}
          </Button>
        ) : (
          <div style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.04)'
          }}>
            <h3 style={{ marginBottom: 8 }}>Confirm your ride</h3>
            <p style={{ marginBottom: 6 }}>📍 {origin.address}</p>
            <p style={{ marginBottom: 12 }}>🏁 {destination.address}</p>

            <div style={{ marginBottom: 14 }}>
              <b>Total:</b> <span className="mono">${selectedFare?.totalFare}</span>
            </div>

            <Button variant="primary" size="lg" className="btn--full" loading={loading} onClick={handleRequest}>
              Yes, request ride
            </Button>

            <div style={{ height: 10 }} />

            <Button variant="danger" size="sm" className="btn--full" onClick={() => setConfirming(false)} disabled={loading}>
              Cancel
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function RideHistory() {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ridesAPI.history()
      .then(({ data }) => setRides(data.rides))
      .finally(() => setLoading(false));
  }, []);

  const STATUS_COLOR = {
    completed: 'success',
    cancelled: 'danger',
    searching: 'warning',
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Ride history</h1>
      </div>

      {loading ? <Spinner size={28} /> : (
        <div className="history-list">
          {rides.length === 0 && <p className="empty-state">No rides yet</p>}

          {rides.map((r) => (
            <Card key={r._id} className="history-card">
              <div className="history-header">
                <Badge variant={STATUS_COLOR[r.status] || 'default'}>{r.status}</Badge>
                <span className="mono history-price">${r.finalPrice ?? r.estimatedPrice}</span>
              </div>

              <div className="history-route">
                <p>📍 {r.origin?.address}</p>
                <p>🏁 {r.destination?.address}</p>
              </div>

              <div className="history-meta">
                <span>{new Date(r.createdAt).toLocaleDateString()}</span>
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

function PassengerProfile() {
  const { user } = useAuth();

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Profile</h1>
      </div>

      <Card>
        <div className="profile-avatar-lg">{user?.name?.[0]?.toUpperCase()}</div>
        <h2 className="profile-name">{user?.name}</h2>
        <p className="profile-email">{user?.email}</p>

        <div className="stat-grid" style={{ marginTop: 24 }}>
          <Stat label="Total rides" value={user?.totalRides || 0} />
          <Stat label="Rating" value={`⭐ ${user?.rating}`} />
        </div>
      </Card>
    </div>
  );
}

export default function PassengerDashboard() {
  return (
    <AppShell>
      <Routes>
        <Route index element={<PassengerHome />} />
        <Route path="book" element={<BookRide />} />
        <Route path="history" element={<RideHistory />} />
        <Route path="profile" element={<PassengerProfile />} />
      </Routes>
    </AppShell>
  );
}