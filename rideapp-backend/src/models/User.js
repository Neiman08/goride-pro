const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = Object.freeze({ PASSENGER: 'passenger', DRIVER: 'driver', ADMIN: 'admin' });

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [60, 'Name cannot exceed 60 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[\d\s\-().]{7,20}$/, 'Invalid phone number'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // never returned by default
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.PASSENGER,
      index: true,
    },
    avatar: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },

    // ── Driver-specific ────────────────────────────────────────────────────
    vehicleInfo: {
      brand: { type: String, trim: true },
      model: { type: String, trim: true },
      year: { type: Number, min: 2000, max: new Date().getFullYear() + 1 },
      plate: { type: String, trim: true, uppercase: true },
      color: { type: String, trim: true },
    },
    licenseNumber: { type: String, trim: true },
    isApproved: { type: Boolean, default: false }, // admin must approve drivers

    // ── Status (drivers) ───────────────────────────────────────────────────
    isOnline: { type: Boolean, default: false, index: true },
    currentLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
    socketId: { type: String, default: null },

    // ── Stats ──────────────────────────────────────────────────────────────
    rating: { type: Number, default: 5.0, min: 1, max: 5 },
    ratingCount: { type: Number, default: 0 },
    totalRides: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 }, // drivers only (70% cut sum)

    // ── Auth ───────────────────────────────────────────────────────────────
    refreshToken: { type: String, select: false },
    passwordChangedAt: Date,
    lastLoginAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Geo-index for $near queries on driver location
userSchema.index({ currentLocation: '2dsphere' });
userSchema.index({ role: 1, isOnline: 1, isApproved: 1 });

// ── Hash password before save ─────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date();
  next();
});

// ── Instance methods ──────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.changedPasswordAfter = function (jwtTimestamp) {
  if (this.passwordChangedAt) {
    return Math.floor(this.passwordChangedAt.getTime() / 1000) > jwtTimestamp;
  }
  return false;
};

userSchema.methods.updateRating = function (newRating) {
  const total = this.rating * this.ratingCount + newRating;
  this.ratingCount += 1;
  this.rating = Math.round((total / this.ratingCount) * 10) / 10;
};

// ── Remove sensitive fields from JSON output ──────────────────────────────
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.__v;
  return obj;
};

const User = mongoose.model('User', userSchema);
User.ROLES = ROLES;
module.exports = User;
