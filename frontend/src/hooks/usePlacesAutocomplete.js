import { useState, useEffect, useCallback, useRef } from 'react';

// Debounce helper
const useDebounce = (value, delay) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};

// Uses Google Maps Places Autocomplete Service (loaded via @react-google-maps/api)
const usePlacesAutocomplete = () => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debouncedInput = useDebounce(inputValue, 350);
  const serviceRef = useRef(null);

  useEffect(() => {
    if (!window.google) return;
    serviceRef.current = new window.google.maps.places.AutocompleteService();
  }, []);

  useEffect(() => {
    if (!debouncedInput || debouncedInput.length < 3 || !serviceRef.current) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    serviceRef.current.getPlacePredictions(
      { input: debouncedInput, types: ['geocode', 'establishment'] },
      (results, status) => {
        setLoading(false);
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
          setSuggestions(results);
        } else {
          setSuggestions([]);
        }
      }
    );
  }, [debouncedInput]);

  // Get lat/lng from a place_id
  const getPlaceDetails = useCallback((placeId) => {
    return new Promise((resolve, reject) => {
      if (!window.google) return reject(new Error('Google Maps not loaded'));
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ placeId }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location;
          resolve({
            address: results[0].formatted_address,
            placeId,
            coordinates: { lat: loc.lat(), lng: loc.lng() },
          });
        } else {
          reject(new Error(`Geocode failed: ${status}`));
        }
      });
    });
  }, []);

  const clearSuggestions = useCallback(() => setSuggestions([]), []);

  return { inputValue, setInputValue, suggestions, loading, getPlaceDetails, clearSuggestions };
};

export default usePlacesAutocomplete;
