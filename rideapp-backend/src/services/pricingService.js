const TariffConfig = require('../models/TariffConfig');
const logger = require('../utils/logger');

const METERS_PER_MILE = 1609.344;
const GMAPS_KEY = () => process.env.GOOGLE_MAPS_API_KEY;

// ── Coordinate validation ──────────────────────────────────────────────────
function validateCoords(origin, destination) {
  const isValid = (c) =>
    c &&
    typeof c.lat === 'number' && !isNaN(c.lat) && c.lat >= -90  && c.lat <= 90 &&
    typeof c.lng === 'number' && !isNaN(c.lng) && c.lng >= -180 && c.lng <= 180;

  if (!isValid(origin))      throw new Error('Invalid origin coordinates');
  if (!isValid(destination)) throw new Error('Invalid destination coordinates');

  if (Math.abs(origin.lat - destination.lat) < 0.0001 &&
      Math.abs(origin.lng - destination.lng) < 0.0001) {
    throw new Error('Origin and destination are the same location');
  }
}

// ── Google Maps Distance Matrix ────────────────────────────────────────────
async function fetchGoogleRoute(origin, destination) {
  const key = GMAPS_KEY();
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY not set');

  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${origin.lat},${origin.lng}` +
    `&destinations=${destination.lat},${destination.lng}` +
    `&units=imperial&mode=driving&key=${key}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Maps API HTTP ${res.status}`);

  const data = await res.json();
  if (data.status !== 'OK') throw new Error(`Maps API: ${data.status}`);

  const el = data.rows?.[0]?.elements?.[0];
  if (!el || el.status !== 'OK') throw new Error(`Route element: ${el?.status}`);

  const distanceMiles  = Math.round((el.distance.value / METERS_PER_MILE) * 100) / 100;
  const durationMinutes = Math.round((el.duration.value / 60) * 10) / 10;

  // Guard against Maps returning 0 or NaN
  if (!distanceMiles || !durationMinutes) throw new Error('Maps returned zero distance/duration');

  return {
    distanceMiles,
    distanceText: el.distance.text,
    durationMinutes,
    durationText: el.duration.text,
    source: 'google',
  };
}

// ── Haversine fallback ─────────────────────────────────────────────────────
function haversineFallback(origin, destination) {
  const R = 3958.8;
  const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
  const dLng = ((destination.lng - origin.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((origin.lat * Math.PI) / 180) *
      Math.cos((destination.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const miles   = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
  const minutes = Math.round((miles / 20) * 60 * 10) / 10;

  if (!miles || isNaN(miles)) throw new Error('Haversine returned invalid distance');

  return {
    distanceMiles: miles,
    distanceText:  `${miles} mi`,
    durationMinutes: minutes,
    durationText:  `${Math.round(minutes)} min`,
    source: 'haversine',
  };
}

// ── Get route (validates first, then tries Maps, then Haversine) ───────────
async function getRoute(origin, destination) {
  validateCoords(origin, destination);

  try {
    return await fetchGoogleRoute(origin, destination);
  } catch (err) {
    logger.warn(`Google Maps failed, using Haversine: ${err.message}`);
    return haversineFallback(origin, destination);
  }
}

// ── Price estimates for all active ride types ──────────────────────────────
async function getPriceEstimates(origin, destination) {
  const [route, tariffs] = await Promise.all([
    getRoute(origin, destination),
    TariffConfig.find({ isActive: true }),
  ]);

  if (!tariffs.length) throw new Error('No active tariffs configured');

  const fares = {};
  for (const t of tariffs) {
    const breakdown = t.calculateFare(route);
    // Final NaN guard before sending to client
    if (isNaN(breakdown.totalFare)) {
      logger.error(`NaN fare for ${t.rideType}`, { route, tariff: t.toObject() });
      continue;
    }
    fares[t.rideType] = {
      ...breakdown,
      label: t.label,
      icon: t.icon,
      description: t.description,
      maxPassengers: t.maxPassengers,
      estimatedWaitMinutes: t.estimatedWaitMinutes,
      surgeActive: t.surgeActive,
    };
  }

  return { route, fares };
}

// ── Fare for a specific ride type ──────────────────────────────────────────
async function getFareForRideType(origin, destination, rideType) {
  const [route, tariff] = await Promise.all([
    getRoute(origin, destination),
    TariffConfig.findOne({ rideType, isActive: true }),
  ]);

  if (!tariff) throw new Error(`No active tariff for: ${rideType}`);

  const fareBreakdown = tariff.calculateFare(route);

  // Catch NaN before it reaches Mongoose and causes confusing cast errors
  const numericFields = ['baseFare', 'distanceCost', 'timeCost', 'totalFare', 'platformCut', 'driverPayout'];
  for (const field of numericFields) {
    if (isNaN(fareBreakdown[field])) {
      throw new Error(`Fare calculation error: ${field} is NaN. Route: ${JSON.stringify(route)}`);
    }
  }

  return { route, fareBreakdown, tariff };
}

module.exports = { getPriceEstimates, getFareForRideType, getRoute };
