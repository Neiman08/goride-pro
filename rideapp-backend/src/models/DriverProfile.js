const mongoose = require('mongoose');

const DRIVER_STATUS = Object.freeze({
  PENDING:   'pending_verification',
  APPROVED:  'approved',
  REJECTED:  'rejected',
  SUSPENDED: 'suspended',
  OFFLINE:   'offline',
  ONLINE:    'online',
  BUSY:      'busy',
});

// ── Driver license ─────────────────────────────────────────────────────────
const licenseSchema = new mongoose.Schema({
  number:       { type: String, trim: true },
  state:        { type: String, trim: true },
  expiryDate:   { type: Date },
  frontPhoto: {
    url:      { type: String },
    publicId: { type: String },
  },
  backPhoto: {
    url:      { type: String },
    publicId: { type: String },
  },
}, { _id: false });

// ── Document schema (insurance, registration, etc.) ───────────────────────
const documentSchema = new mongoose.Schema({
  url:        { type: String },
  publicId:   { type: String },
  expiryDate: { type: Date },
  uploadedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  rejectionReason: { type: String },
}, { _id: false });

// ── Selfie / face verification ─────────────────────────────────────────────
const selfieSchema = new mongoose.Schema({
  url:      { type: String },
  publicId: { type: String },
  matchScore: { type: Number },      // 0-1 confidence score
  verified:   { type: Boolean, default: false },
  verifiedAt: { type: Date },
}, { _id: false });

// ── Digital signature ──────────────────────────────────────────────────────
const signatureSchema = new mongoose.Schema({
  document:  { type: String, required: true }, // e.g. 'terms', 'privacy', 'conduct'
  accepted:  { type: Boolean, default: false },
  timestamp: { type: Date },
  ip:        { type: String },
  userAgent: { type: String },
  version:   { type: String },
}, { _id: false });

// ── Main DriverProfile schema ──────────────────────────────────────────────
const driverProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // ── Verification status ────────────────────────────────────────────────
    verificationStatus: {
      type: String,
      enum: Object.values(DRIVER_STATUS),
      default: DRIVER_STATUS.PENDING,
      index: true,
    },
    verificationNotes: { type: String }, // admin notes on rejection

    // ── Operating status ───────────────────────────────────────────────────
    operatingStatus: {
      type: String,
      enum: ['offline', 'online', 'busy'],
      default: 'offline',
    },

    // ── Documents ─────────────────────────────────────────────────────────
    license:      { type: licenseSchema, default: () => ({}) },
    insurance:    { type: documentSchema, default: () => ({}) },
    registration: { type: documentSchema, default: () => ({}) },
    selfie:       { type: selfieSchema, default: () => ({}) },

    // ── Signatures ─────────────────────────────────────────────────────────
    signatures: [signatureSchema],

    // ── Admin actions ──────────────────────────────────────────────────────
    approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt:  { type: Date },
    suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    suspendedAt: { type: Date },
    suspendReason: { type: String },

    // ── Activity log ──────────────────────────────────────────────────────
    activityLog: [{
      action:    { type: String },
      by:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      note:      { type: String },
      timestamp: { type: Date, default: Date.now },
    }],

    // ── Document expiry alerts ─────────────────────────────────────────────
    licenseExpiryAlertSent:    { type: Boolean, default: false },
    insuranceExpiryAlertSent:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ── Computed: is fully verified and can receive rides ─────────────────────
driverProfileSchema.virtual('canReceiveRides').get(function () {
  return this.verificationStatus === DRIVER_STATUS.APPROVED;
});

// ── Check for expiring documents (called by cron) ─────────────────────────
driverProfileSchema.methods.getExpiringDocuments = function (daysAhead = 30) {
  const cutoff = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const expiring = [];
  if (this.license?.expiryDate && this.license.expiryDate < cutoff) expiring.push('license');
  if (this.insurance?.expiryDate && this.insurance.expiryDate < cutoff) expiring.push('insurance');
  if (this.registration?.expiryDate && this.registration.expiryDate < cutoff) expiring.push('registration');
  return expiring;
};

const DriverProfile = mongoose.model('DriverProfile', driverProfileSchema);
DriverProfile.STATUS = DRIVER_STATUS;
module.exports = DriverProfile;
