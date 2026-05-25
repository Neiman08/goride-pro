import { useState, useEffect, useCallback } from 'react';

const DEFAULT_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 30000,
};

export const useGeolocation = (watchPosition = false) => {
  const [location, setLocation] = useState(null); // { lat, lng }
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const onSuccess = useCallback((pos) => {
    setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    setError(null);
    setLoading(false);
  }, []);

  const onError = useCallback((err) => {
    setError(err.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setLoading(false);
      return;
    }

    if (watchPosition) {
      const id = navigator.geolocation.watchPosition(onSuccess, onError, DEFAULT_OPTIONS);
      return () => navigator.geolocation.clearWatch(id);
    } else {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, DEFAULT_OPTIONS);
    }
  }, [watchPosition, onSuccess, onError]);

  return { location, error, loading };
};
