import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { ridesAPI } from '../api/rides';
import { useAuth } from './AuthContext';

const RideContext = createContext(null);

export const RideProvider = ({ children }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [activeRide, setActiveRide] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [notification, setNotification] = useState(null);
  const [loadingRide, setLoadingRide] = useState(true);

  // Load existing active ride on mount
  useEffect(() => {
    if (!user) { setLoadingRide(false); return; }
    ridesAPI.getActive()
      .then(({ data }) => {
        if (data.ride) {
          setActiveRide(data.ride);
          // Join ride room for real-time updates
          socket?.emit('ride:join', { rideId: data.ride._id });
        }
      })
      .catch(console.error)
      .finally(() => setLoadingRide(false));
  }, [user, socket]);

  const notify = useCallback((message, type = 'info') => {
    setNotification({ message, type, id: Date.now() });
    setTimeout(() => setNotification(null), 4500);
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    // Passenger events
    socket.on('ride:accepted', (ride) => {
      setActiveRide(ride);
      socket.emit('ride:join', { rideId: ride._id });
      notify(`🎉 ${ride.driver?.name} accepted your ride!`, 'success');
    });

    socket.on('ride:driver_moved', ({ lat, lng }) => {
      setDriverLocation({ lat, lng });
    });

    socket.on('ride:started', () => {
      setActiveRide((prev) => prev ? { ...prev, status: 'in_progress' } : prev);
      notify('🚗 Your ride has started!', 'info');
    });

    socket.on('ride:completed', ({ finalPrice }) => {
      setActiveRide((prev) => prev ? { ...prev, status: 'completed', finalPrice } : prev);
      notify(`✅ Ride complete! $${finalPrice}`, 'success');
    });

    socket.on('ride:cancelled', ({ cancelledBy }) => {
      setActiveRide((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
      notify(`❌ Ride cancelled by ${cancelledBy}`, 'warning');
    });

    // Driver events
    socket.on('ride:new_request', (ride) => {
      // Handled in DriverContext — ignore here
    });

    socket.on('ride:taken', ({ rideId }) => {
      // Also handled in DriverContext
    });

    return () => {
      socket.off('ride:accepted');
      socket.off('ride:driver_moved');
      socket.off('ride:started');
      socket.off('ride:completed');
      socket.off('ride:cancelled');
      socket.off('ride:new_request');
      socket.off('ride:taken');
    };
  }, [socket, notify]);

  const clearRide = useCallback(() => {
    setActiveRide(null);
    setDriverLocation(null);
  }, []);

  return (
    <RideContext.Provider value={{
      activeRide, setActiveRide,
      driverLocation,
      notification,
      loadingRide,
      notify,
      clearRide,
    }}>
      {children}
    </RideContext.Provider>
  );
};

export const useRide = () => {
  const ctx = useContext(RideContext);
  if (!ctx) throw new Error('useRide must be inside RideProvider');
  return ctx;
};
