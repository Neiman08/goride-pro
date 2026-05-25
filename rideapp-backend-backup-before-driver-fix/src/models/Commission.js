const mongoose = require('mongoose');

// Immutable financial record. Created on ride completion. Never modified.
const commissionSchema = new mongoose.Schema(
  {
    ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true, unique: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    passenger: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rideType: { type: String, required: true },

    // Fare breakdown
    baseFare: { type: Number, required: true },
    distanceCost: { type: Number, required: true },
    timeCost: { type: Number, required: true },
    surgeMultiplier: { type: Number, default: 1 },
    totalFare: { type: Number, required: true },

    // Split
    platformCut: { type: Number, required: true },
    driverPayout: { type: Number, required: true },

    // Route stats
    distanceMiles: { type: Number, required: true },
    durationMinutes: { type: Number, required: true },

    // Payment (Stripe integration ready)
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
    },
    stripePaymentIntentId: { type: String, default: null },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'commissions' }
);

commissionSchema.index({ driver: 1, createdAt: -1 });
commissionSchema.index({ createdAt: -1 });
commissionSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('Commission', commissionSchema);
