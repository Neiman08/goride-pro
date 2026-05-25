import React, { useEffect, useRef, useCallback } from 'react';
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from '@react-google-maps/api';

const LIBRARIES = ['places', 'geometry'];
const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0f0f1a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f0f1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0a15' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 }; // NYC fallback

const RideMap = ({
  origin,        // { lat, lng }
  destination,   // { lat, lng }
  driverLocation,// { lat, lng }
  userLocation,  // { lat, lng }
  height = '100%',
}) => {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_KEY || '',
    libraries: LIBRARIES,
  });

  const mapRef = useRef(null);
  const [directions, setDirections] = React.useState(null);

  const onMapLoad = useCallback((map) => { mapRef.current = map; }, []);

  // Draw route when origin + destination set
  useEffect(() => {
    if (!isLoaded || !origin || !destination) return;

    const svc = new window.google.maps.DirectionsService();
    svc.route(
      {
        origin: new window.google.maps.LatLng(origin.lat, origin.lng),
        destination: new window.google.maps.LatLng(destination.lat, destination.lng),
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK') setDirections(result);
      }
    );
  }, [isLoaded, origin, destination]);

  // Pan to driver when moving
  useEffect(() => {
    if (driverLocation && mapRef.current) {
      mapRef.current.panTo(driverLocation);
    }
  }, [driverLocation]);

  if (!isLoaded) {
    return (
      <div style={{ height, background: '#0a0a15', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
        Loading map...
      </div>
    );
  }

  const center = userLocation || origin || DEFAULT_CENTER;

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height }}
      center={center}
      zoom={13}
      onLoad={onMapLoad}
      options={{ styles: MAP_STYLE, disableDefaultUI: true, zoomControl: true }}
    >
      {/* Route */}
      {directions && (
        <DirectionsRenderer
          directions={directions}
          options={{ suppressMarkers: true, polylineOptions: { strokeColor: '#7c4dff', strokeWeight: 4 } }}
        />
      )}

      {/* User / passenger location */}
      {userLocation && !origin && (
        <Marker
          position={userLocation}
          icon={{ path: window.google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#7c4dff', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 }}
        />
      )}

      {/* Pickup pin */}
      {origin && (
        <Marker
          position={origin}
          icon={{ url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' }}
          label={{ text: 'A', color: '#fff', fontWeight: 'bold' }}
        />
      )}

      {/* Destination pin */}
      {destination && (
        <Marker
          position={destination}
          icon={{ url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' }}
          label={{ text: 'B', color: '#fff', fontWeight: 'bold' }}
        />
      )}

      {/* Live driver position */}
      {driverLocation && (
        <Marker
          position={driverLocation}
          icon={{
            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: '#10b981',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 1.5,
            rotation: 0,
          }}
        />
      )}
    </GoogleMap>
  );
};

export default RideMap;
