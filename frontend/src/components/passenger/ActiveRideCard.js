import React, { useState } from 'react';
import { ridesAPI } from '../../api/rides';
import { useRide } from '../../context/RideContext';

const STATUS_CONFIG = {
  searching:   { label: 'Finding your driver...', color: '#f59e0b', icon: '🔍' },
  accepted:    { label: 'Driver on the way',       color: '#3b82f6', icon: '🚗' },
  in_progress: { label: 'Ride in progress',        color: '#10b981', icon: '🛣️' },
  completed:   { label: 'Ride completed',          color: '#6b7280', icon: '✅' },
  cancelled:   { label: 'Cancelled',               color: '#ef4444', icon: '❌' },
};

const ActiveRideCard = ({ ride, onCancelled, onCompleted }) => {
  const { notify } = useRide();
  const [cancelling, setCancelling] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);

  const cfg = STATUS_CONFIG[ride.status] || STATUS_CONFIG.searching;

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await ridesAPI.cancel(ride._id, 'Cancelled by passenger');
      onCancelled?.();
    } catch (err) {
      notify(err.response?.data?.message || 'Cannot cancel', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const handleRate = async (stars) => {
    try {
      await ridesAPI.rate(ride._id, stars, '');
      setShowRating(false);
      notify('⭐ Thanks for rating!', 'success');
      onCompleted?.();
    } catch {
      notify('Rating failed', 'error');
    }
  };

  const s = {
    card: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 20 },
    statusRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 },
    dot: { width: 10, height: 10, borderRadius: '50%', background: cfg.color, animation: ['searching','accepted','in_progress'].includes(ride.status) ? 'pulse 2s infinite' : 'none' },
    statusLabel: { fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: '#fff' },
    route: { marginBottom: 16 },
    routeRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 13, color: 'rgba(255,255,255,0.7)' },
    meta: { display: 'flex', gap: 16, fontSize: 13, color: 'rgba(255,255,255,0.5)', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 },
    driverCard: { display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, marginBottom: 16 },
    cancelBtn: { width: '100%', padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, color: '#ef4444', cursor: 'pointer', fontSize: 14, fontWeight: 500 },
  };

  return (
    <div style={s.card}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>

      <div style={s.statusRow}>
        <div style={s.dot} />
        <span style={{ fontSize: 18 }}>{cfg.icon}</span>
        <span style={s.statusLabel}>{cfg.label}</span>
      </div>

      <div style={s.route}>
        <div style={s.routeRow}><span style={{ color: '#10b981', fontSize: 10 }}>●</span> {ride.origin?.address}</div>
        <div style={{ width: 2, height: 16, background: 'rgba(255,255,255,0.1)', marginLeft: 5 }} />
        <div style={s.routeRow}><span style={{ color: '#ef4444', fontSize: 10 }}>●</span> {ride.destination?.address}</div>
      </div>

      <div style={s.meta}>
        <span>💰 ${ride.estimatedPrice}</span>
        <span>📍 {ride.distanceText}</span>
        <span>⏱ {ride.durationText}</span>
        <span style={{ textTransform: 'capitalize' }}>{ride.rideType}</span>
      </div>

      {ride.driver && (
        <div style={s.driverCard}>
          <div style={{ fontSize: 36 }}>🧑‍✈️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: '#fff' }}>{ride.driver.name}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>⭐ {ride.driver.rating}</div>
            {ride.driver.vehicleInfo && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                {ride.driver.vehicleInfo.color} {ride.driver.vehicleInfo.brand} · {ride.driver.vehicleInfo.plate}
              </div>
            )}
          </div>
          <a href={`tel:${ride.driver.phone}`} style={{ fontSize: 22, textDecoration: 'none' }}>📞</a>
        </div>
      )}

      {ride.status === 'completed' && !showRating && (
        <button style={{ ...s.cancelBtn, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }} onClick={() => setShowRating(true)}>
          ⭐ Rate your ride
        </button>
      )}

      {showRating && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 12 }}>How was your ride?</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            {[1,2,3,4,5].map((star) => (
              <button key={star} onClick={() => handleRate(star)}
                style={{ background: 'none', border: 'none', fontSize: 32, cursor: 'pointer',
                  opacity: rating >= star ? 1 : 0.4, transition: 'opacity 0.15s' }}
                onMouseEnter={() => setRating(star)} onMouseLeave={() => setRating(0)}>
                ⭐
              </button>
            ))}
          </div>
        </div>
      )}

      {['searching', 'accepted'].includes(ride.status) && (
        <button style={s.cancelBtn} onClick={handleCancel} disabled={cancelling}>
          {cancelling ? 'Cancelling...' : 'Cancel Ride'}
        </button>
      )}
    </div>
  );
};

export default ActiveRideCard;
