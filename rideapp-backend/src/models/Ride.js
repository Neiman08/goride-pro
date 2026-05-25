const mongoose = require('mongoose');

const STATUSES = Object.freeze({
  SEARCHING: 'searching',
  ACCEPTED: 'accepted',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

const coordinateSchema = new mongoose.Schema(
  { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    address: { type: String, required: true },
    coordinates: { type: coordinateSchema, required: true },
    placeId: { type: String }, // Google Places ID for future use
  },
  { _id: false }
);

const rideSchema = new mongoose.Schema(
  {
    // ── Parties ──────────────────────────────────────────────────────────
    passenger: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    // ── Locations ─────────────────────────────────────────────────────────
    origin: { type: locationSchema, required: true },
    destination: { type: locationSchema, required: true },

    // ── Lifecycle ─────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: Object.values(STATUSES),
      default: STATUSES.SEARCHING,
      index: true,
    },
    rideType: {
      type: String,
      enum: ['economy', 'comfort', 'xl'],
      default: 'economy',
    },

    // ── Route (from Google Maps) ──────────────────────────────────────────
    distanceMiles: { type: Number },
    distanceText: { type: String },   // "3.2 mi"
    durationMinutes: { type: Number },
    durationText: { type: String },   // "12 min"
    routePolyline: { type: String },  // encoded polyline for map display

    // ── Pricing (USD) ─────────────────────────────────────────────────────
    estimatedPrice: { type: Number },
    finalPrice: { type: Number },
    fareBreakdown: {
      baseFare: { type: Number },
      distanceCost: { type: Number },
      timeCost: { type: Number },
      surgeMultiplier: { type: Number, default: 1 },
    },

    // ── Commission (70/30) ────────────────────────────────────────────────
    platformCut: { type: Number },
    driverPayout: { type: Number },

    // ── Ratings ───────────────────────────────────────────────────────────
    passengerRating: { type: Number, min: 1, max: 5 },
    driverRating: { type: Number, min: 1, max: 5 },
    passengerRatingComment: { type: String },
    driverRatingComment: { type: String },

    // ── Cancellation ──────────────────────────────────────────────────────
    cancelReason: { type: String },
    cancelledBy: { type: String, enum: ['passenger', 'driver', 'admin'] },

    // ── Timestamps ────────────────────────────────────────────────────────
    acceptedAt: Date,
    arrivedAt: Date,
    startedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
  },
  { timestamps: true }
);

// Compound indexes for the most common query patterns
rideSchema.index({ passenger: 1, status: 1, createdAt: -1 });
rideSchema.index({ driver: 1, status: 1, createdAt: -1 });
rideSchema.index({ status: 1, createdAt: -1 });
rideSchema.index({ createdAt: -1 }); // admin list

const Ride = mongoose.model('Ride', rideSchema);
Ride.STATUSES = STATUSES;
module.exports = Ride;
