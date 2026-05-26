const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ── Vehicle info ───────────────────────────────────────────────────────
    make:   { type: String, required: true, trim: true },   // e.g. Toyota
    model:  { type: String, required: true, trim: true },   // e.g. Camry
    year:   { type: Number, required: true, min: 2000 },
    color:  { type: String, required: true, trim: true },
    plate:  { type: String, required: true, trim: true, uppercase: true },
    vin:    { type: String, trim: true, uppercase: true },

    // ── Type ──────────────────────────────────────────────────────────────
    type: {
      type: String,
      enum: ['sedan', 'suv', 'van', 'truck', 'luxury'],
      default: 'sedan',
    },
    maxPassengers: { type: Number, default: 4 },

    // ── Photos ────────────────────────────────────────────────────────────
    photos: [{
      url:      { type: String },
      publicId: { type: String },
      isPrimary: { type: Boolean, default: false },
    }],

    // ── Status ────────────────────────────────────────────────────────────
    isActive:  { type: Boolean, default: true },   // driver's current vehicle
    isApproved: { type: Boolean, default: false },  // admin approved

    // ── Registration & insurance ───────────────────────────────────────────
    registrationExpiry: { type: Date },
    insuranceExpiry:    { type: Date },
  },
  { timestamps: true }
);

// Only one active vehicle per driver at a time
vehicleSchema.index({ driver: 1, isActive: 1 });

// ── Get primary photo ─────────────────────────────────────────────────────
vehicleSchema.virtual('primaryPhoto').get(function () {
  const primary = this.photos.find((p) => p.isPrimary);
  return primary?.url || this.photos[0]?.url || '';
});

// ── Display string ────────────────────────────────────────────────────────
vehicleSchema.virtual('displayName').get(function () {
  return `${this.year} ${this.make} ${this.model} · ${this.color} · ${this.plate}`;
});

vehicleSchema.set('toJSON', { virtuals: true });
vehicleSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Vehicle', vehicleSchema);
