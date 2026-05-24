import React, { useState, useEffect, useCallback } from 'react';
import PlacesInput from '../common/PlacesInput';
import { ridesAPI } from '../../api/rides';
import { useRide } from '../../context/RideContext';

const RIDE_ICONS = { economy: '🚗', comfort: '🚙', xl: '🚐' };

const BookingPanel = ({ onRideRequested }) => {
  const { notify } = useRide();
  const [origin, setOrigin]           = useState(null);
  const [destination, setDestination] = useState(null);
  const [estimates, setEstimates]     = useState(null);
  const [route, setRoute]             = useState(null);
  const [selectedType, setSelectedType] = useState('economy');
  const [loading, setLoading]         = useState(false);
  const [estimating, setEstimating]   = useState(false);
  // NEW: confirmation step before creating the ride
  const [confirming, setConfirming]   = useState(false);

  // Fetch price estimate when both points selected
  useEffect(() => {
    if (!origin || !destination) { setEstimates(null); setRoute(null); return; }
    setEstimating(true);
    setEstimates(null); // clear stale estimates while refetching
    ridesAPI
      .getEstimate(
        origin.coordinates.lat, origin.coordinates.lng,
        destination.coordinates.lat, destination.coordinates.lng
      )
      .then(({ data }) => {
        setEstimates(data.fares);
        setRoute(data.route);
      })
      .catch(() => notify('Could not fetch price estimate', 'error'))
      .finally(() => setEstimating(false));
  }, [origin, destination, notify]);

  // Step 1: show confirmation sheet
  const handleShowConfirmation = useCallback(() => {
    if (!origin || !destination) return notify('Select origin and destination', 'warning');
    if (estimating) return notify('Still calculating fare, please wait...', 'warning');
    if (!estimates) return notify('Please wait for fare estimate to load', 'warning');

    const fare = estimates[selectedType];
    if (!fare || typeof fare.totalFare !== 'number' || isNaN(fare.totalFare)) {
      return notify('Fare calculation failed. Please try again.', 'error');
    }
    setConfirming(true);
  }, [origin, destination, selectedType, estimates, estimating, notify]);

  // Step 2: actually create the ride after user confirms
  const handleConfirmRequest = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await ridesAPI.requestRide({ origin, destination, rideType: selectedType });
      setConfirming(false);
      onRideRequested(data.ride);
      notify('🔍 Searching for nearby drivers...', 'info');
    } catch (err) {
      notify(err.response?.data?.message || 'Error requesting ride', 'error');
    } finally {
      setLoading(false);
    }
  }, [origin, destination, selectedType, notify, onRideRequested]);

  const selectedFare = estimates?.[selectedType];
  const canRequest   = origin && destination && !estimating && !!estimates;

  const s = {
    panel: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24 },
    title: { fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, marginBottom: 20, color: '#fff' },
    locInputs: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 },
    divider: { height: 1, background: 'rgba(255,255,255,0.06)', marginLeft: 22 },
    sectionLabel: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
    rideTypes: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 },
    rideCard: (active) => ({
      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
      background: active ? 'rgba(124,77,255,0.1)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${active ? 'rgba(124,77,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 14, cursor: 'pointer', transition: 'all 0.15s',
    }),
    btn: (disabled) => ({
      width: '100%', padding: '16px',
      background: disabled ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #7c4dff, #5c35cc)',
      border: 'none', borderRadius: 14, color: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
      fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
    }),
    // Confirmation overlay
    overlay: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      zIndex: 200, display: 'flex', alignItems: 'flex-end',
      backdropFilter: 'blur(4px)',
    },
    sheet: {
      width: '100%', maxWidth: 480, margin: '0 auto',
      background: '#141420', borderRadius: '24px 24px 0 0',
      padding: '28px 24px 40px',
      border: '1px solid rgba(255,255,255,0.1)',
      animation: 'slideUp 0.25s ease',
    },
    sheetHandle: {
      width: 40, height: 4, background: 'rgba(255,255,255,0.15)',
      borderRadius: 2, margin: '0 auto 24px',
    },
    fareRow: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
      fontSize: 14, color: 'rgba(255,255,255,0.6)',
    },
    fareTotal: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '16px 0 0',
    },
  };

  return (
    <>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

      <div style={s.panel}>
        <div style={s.title}>Where to?</div>

        <div style={s.locInputs}>
          <PlacesInput placeholder="Pickup location" icon="origin" onSelect={setOrigin} value={origin?.address || ''} />
          <div style={s.divider} />
          <PlacesInput placeholder="Destination" icon="dest" onSelect={setDestination} value={destination?.address || ''} />
        </div>

        {estimating && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 16 }}>
            ⏳ Calculating fare...
          </div>
        )}

        {route && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            <span>📍 {route.distanceText}</span>
            <span>⏱ {route.durationText}</span>
          </div>
        )}

        {estimates && (
          <>
            <div style={s.sectionLabel}>Choose ride type</div>
            <div style={s.rideTypes}>
              {Object.entries(estimates).map(([type, fare]) => (
                <div key={type} style={s.rideCard(selectedType === type)} onClick={() => setSelectedType(type)}>
                  <span style={{ fontSize: 24 }}>{RIDE_ICONS[type]}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>{fare.label}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{fare.description}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                      ~{fare.estimatedWaitMinutes} min away · up to {fare.maxPassengers} passengers
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, color: '#fff' }}>
                      ${fare.totalFare}
                    </div>
                    {fare.surgeActive && (
                      <div style={{ fontSize: 10, color: '#f59e0b' }}>⚡ Surge ×{fare.surgeMultiplier}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Primary CTA — opens confirmation sheet */}
        <button
          style={s.btn(!canRequest)}
          onClick={handleShowConfirmation}
          disabled={!canRequest}
        >
          {estimating
            ? '⏳ Calculating fare...'
            : !origin || !destination
            ? 'Enter pickup & destination'
            : estimates
            ? `Confirm ${estimates[selectedType]?.label} — $${estimates[selectedType]?.totalFare}`
            : 'Loading fare...'}
        </button>
      </div>

      {/* ── Confirmation bottom sheet ── */}
      {confirming && selectedFare && (
        <div style={s.overlay} onClick={() => !loading && setConfirming(false)}>
          <div style={s.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={s.sheetHandle} />

            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 20 }}>
              {RIDE_ICONS[selectedType]} Confirm your ride
            </div>

            {/* Route summary */}
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                <span style={{ color: '#10b981' }}>●</span>
                <span>{origin?.address}</span>
              </div>
              <div style={{ width: 2, height: 12, background: 'rgba(255,255,255,0.1)', marginLeft: 5, marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                <span style={{ color: '#ef4444' }}>●</span>
                <span>{destination?.address}</span>
              </div>
            </div>

            {/* Fare breakdown */}
            <div style={{ marginBottom: 20 }}>
              <div style={s.fareRow}>
                <span>Base fare</span>
                <span>${selectedFare.baseFare}</span>
              </div>
              <div style={s.fareRow}>
                <span>Distance ({route?.distanceText})</span>
                <span>${selectedFare.distanceCost}</span>
              </div>
              <div style={s.fareRow}>
                <span>Time ({route?.durationText})</span>
                <span>${selectedFare.timeCost}</span>
              </div>
              {selectedFare.surgeActive && (
                <div style={{ ...s.fareRow, color: '#f59e0b' }}>
                  <span>⚡ Surge multiplier</span>
                  <span>×{selectedFare.surgeMultiplier}</span>
                </div>
              )}
              <div style={s.fareTotal}>
                <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16, color: '#fff' }}>Total</span>
                <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 26, color: '#fff' }}>
                  ${selectedFare.totalFare}
                </span>
              </div>
            </div>

            {/* Confirm button */}
            <button
              onClick={handleConfirmRequest}
              disabled={loading}
              style={{
                width: '100%', padding: 16,
                background: loading ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #7c4dff, #5c35cc)',
                border: 'none', borderRadius: 14, color: '#fff',
                fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 800,
                cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 12,
              }}
            >
              {loading ? 'Requesting...' : `Request ${selectedFare.label}`}
            </button>

            <button
              onClick={() => setConfirming(false)}
              disabled={loading}
              style={{
                width: '100%', padding: 14,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 14, color: 'rgba(255,255,255,0.5)',
                fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default BookingPanel;
