const mongoose = require('mongoose');

const tariffSchema = new mongoose.Schema(
  {
    rideType: { type: String, enum: ['economy', 'comfort', 'xl'], required: true, unique: true },
    label: { type: String, required: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '🚗' },
    maxPassengers: { type: Number, default: 4 },
    estimatedWaitMinutes: { type: Number, default: 5 },

    // Fare components (USD)
    baseFare: { type: Number, required: true },
    ratePerMile: { type: Number, required: true },
    ratePerMinute: { type: Number, required: true },
    minimumFare: { type: Number, required: true },

    // Surge
    surgeMultiplier: { type: Number, default: 1.0, min: 1.0 },
    surgeActive: { type: Boolean, default: false },

    // Commission
    platformCommissionPct: { type: Number, default: 30 },
    driverPayoutPct: { type: Number, default: 70 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Calculate fare from real Google Maps route data
tariffSchema.methods.calculateFare = function ({ distanceMiles, durationMinutes }) {
  const base = this.baseFare;
  const distanceCost = distanceMiles * this.ratePerMile;
  const timeCost = durationMinutes * this.ratePerMinute;

  const rideCost = this.surgeActive
    ? (distanceCost + timeCost) * this.surgeMultiplier
    : distanceCost + timeCost;

  const totalFare = Math.max(base + rideCost, this.minimumFare);
  const rounded = Math.round(totalFare * 100) / 100;

  const platformCut = Math.round(rounded * (this.platformCommissionPct / 100) * 100) / 100;
  const driverPayout = Math.round((rounded - platformCut) * 100) / 100;

  return {
    baseFare: Math.round(base * 100) / 100,
    distanceCost: Math.round(distanceCost * 100) / 100,
    timeCost: Math.round(timeCost * 100) / 100,
    surgeMultiplier: this.surgeActive ? this.surgeMultiplier : 1,
    totalFare: rounded,
    platformCut,
    driverPayout,
  };
};

const TariffConfig = mongoose.model('TariffConfig', tariffSchema);

TariffConfig.seedDefaults = async () => {
  const count = await TariffConfig.countDocuments();
  if (count > 0) return;
  await TariffConfig.insertMany([
    {
      rideType: 'economy', label: 'Economy', description: 'Affordable everyday rides',
      icon: '🚗', maxPassengers: 4, estimatedWaitMinutes: 4,
      baseFare: 2.00, ratePerMile: 1.15, ratePerMinute: 0.22, minimumFare: 5.00,
      platformCommissionPct: 30, driverPayoutPct: 70,
    },
    {
      rideType: 'comfort', label: 'Comfort', description: 'Newer cars, extra legroom',
      icon: '🚙', maxPassengers: 4, estimatedWaitMinutes: 6,
      baseFare: 3.50, ratePerMile: 1.75, ratePerMinute: 0.32, minimumFare: 8.00,
      platformCommissionPct: 30, driverPayoutPct: 70,
    },
    {
      rideType: 'xl', label: 'XL', description: 'SUVs for up to 6 passengers',
      icon: '🚐', maxPassengers: 6, estimatedWaitMinutes: 8,
      baseFare: 5.00, ratePerMile: 2.25, ratePerMinute: 0.45, minimumFare: 12.00,
      platformCommissionPct: 30, driverPayoutPct: 70,
    },
  ]);
  console.log('✅ Default tariffs seeded');
};

module.exports = TariffConfig;
