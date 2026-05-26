const User          = require('../models/User');
const DriverProfile = require('../models/DriverProfile');
const Vehicle       = require('../models/Vehicle');
const { getSignedUrl } = require('../services/cloudinaryService');
const { sendSMS }      = require('../services/twilioService');
const AppError   = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const logger     = require('../utils/logger');

// ── GET /api/admin/drivers/pending ────────────────────────────────────────
exports.getPendingDrivers = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const profiles = await DriverProfile.find({ verificationStatus: 'pending_verification' })
    .populate('user', 'firstName lastName email phone createdAt avatar')
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await DriverProfile.countDocuments({ verificationStatus: 'pending_verification' });

  res.json({ status: 'success', profiles, total, page: +page, pages: Math.ceil(total / limit) });
});

// ── GET /api/admin/drivers/:driverId/documents ────────────────────────────
// Returns signed URLs for private documents (valid 1 hour)
exports.getDriverDocuments = catchAsync(async (req, res, next) => {
  const profile = await DriverProfile.findOne({ user: req.params.driverId })
    .populate('user', 'firstName lastName email phone ssnLast4 dateOfBirth address');

  if (!profile) return next(new AppError('Driver not found', 404));

  const vehicle = await Vehicle.findOne({ driver: req.params.driverId, isActive: true });

  // Generate signed URLs for private docs
  const docs = {
    licenseFront:   profile.license?.frontPhoto?.publicId  ? getSignedUrl(profile.license.frontPhoto.publicId)  : null,
    licenseBack:    profile.license?.backPhoto?.publicId   ? getSignedUrl(profile.license.backPhoto.publicId)   : null,
    selfie:         profile.selfie?.publicId               ? getSignedUrl(profile.selfie.publicId)               : null,
    insurance:      profile.insurance?.publicId            ? getSignedUrl(profile.insurance.publicId)            : null,
    registration:   profile.registration?.publicId         ? getSignedUrl(profile.registration.publicId)         : null,
  };

  res.json({
    status: 'success',
    driver: profile.user,
    profile: {
      verificationStatus: profile.verificationStatus,
      license:   { ...profile.license?.toObject?.() || profile.license, ...{ frontPhoto: { url: docs.licenseFront }, backPhoto: { url: docs.licenseBack } } },
      selfie:    { ...profile.selfie?.toObject?.()   || profile.selfie,   url: docs.selfie },
      insurance: { ...profile.insurance?.toObject?.() || profile.insurance, url: docs.insurance },
      registration: { ...profile.registration?.toObject?.() || profile.registration, url: docs.registration },
      signatures: profile.signatures,
      activityLog: profile.activityLog,
    },
    vehicle,
  });
});

// ── POST /api/admin/drivers/:driverId/approve ─────────────────────────────
exports.approveDriver = catchAsync(async (req, res, next) => {
  const profile = await DriverProfile.findOne({ user: req.params.driverId }).populate('user');
  if (!profile) return next(new AppError('Driver not found', 404));

  profile.verificationStatus = 'approved';
  profile.approvedBy  = req.user._id;
  profile.approvedAt  = new Date();
  profile.activityLog.push({
    action:    'approved',
    by:        req.user._id,
    note:      req.body.note || 'Application approved',
    timestamp: new Date(),
  });

  await profile.save();

  // Update user status
  await User.findByIdAndUpdate(req.params.driverId, { status: 'active' });

  // Approve vehicle
  await Vehicle.updateMany({ driver: req.params.driverId }, { isApproved: true });

  // Notify driver via SMS
  if (profile.user?.phone) {
    await sendSMS(
      profile.user.phone,
      `🎉 GoRide: Your driver account has been approved! You can now start receiving rides. Open the app to go online.`
    );
  }

  logger.info(`Driver ${req.params.driverId} approved by admin ${req.user._id}`);
  res.json({ status: 'success', message: 'Driver approved and notified' });
});

// ── POST /api/admin/drivers/:driverId/reject ──────────────────────────────
exports.rejectDriver = catchAsync(async (req, res, next) => {
  const { reason, documents } = req.body;
  // documents: array of rejected doc types e.g. ['license', 'selfie']

  const profile = await DriverProfile.findOne({ user: req.params.driverId }).populate('user');
  if (!profile) return next(new AppError('Driver not found', 404));

  profile.verificationStatus = 'rejected';
  profile.verificationNotes  = reason;
  profile.activityLog.push({
    action:    'rejected',
    by:        req.user._id,
    note:      reason,
    timestamp: new Date(),
  });

  // Mark specific documents as rejected
  if (documents?.includes('license'))      profile.license.status      = 'rejected';
  if (documents?.includes('insurance'))    profile.insurance.status    = 'rejected';
  if (documents?.includes('registration')) profile.registration.status = 'rejected';

  await profile.save();

  // Notify driver
  if (profile.user?.phone) {
    await sendSMS(
      profile.user.phone,
      `GoRide: Your driver application needs attention. Reason: ${reason}. Please log in to re-submit your documents.`
    );
  }

  logger.info(`Driver ${req.params.driverId} rejected: ${reason}`);
  res.json({ status: 'success', message: 'Driver rejected and notified' });
});

// ── POST /api/admin/drivers/:driverId/suspend ─────────────────────────────
exports.suspendDriver = catchAsync(async (req, res, next) => {
  const { reason } = req.body;

  const profile = await DriverProfile.findOne({ user: req.params.driverId }).populate('user');
  if (!profile) return next(new AppError('Driver not found', 404));

  profile.verificationStatus = 'suspended';
  profile.suspendedBy   = req.user._id;
  profile.suspendedAt   = new Date();
  profile.suspendReason = reason;
  profile.activityLog.push({ action: 'suspended', by: req.user._id, note: reason, timestamp: new Date() });

  await profile.save();
  await User.findByIdAndUpdate(req.params.driverId, { status: 'suspended', isOnline: false });

  if (profile.user?.phone) {
    await sendSMS(profile.user.phone, `GoRide: Your account has been suspended. Reason: ${reason}. Contact support.`);
  }

  logger.info(`Driver ${req.params.driverId} suspended: ${reason}`);
  res.json({ status: 'success', message: 'Driver suspended' });
});

// ── POST /api/admin/drivers/:driverId/unsuspend ───────────────────────────
exports.unsuspendDriver = catchAsync(async (req, res, next) => {
  const profile = await DriverProfile.findOne({ user: req.params.driverId }).populate('user');
  if (!profile) return next(new AppError('Driver not found', 404));

  profile.verificationStatus = 'approved';
  profile.activityLog.push({ action: 'unsuspended', by: req.user._id, timestamp: new Date() });
  await profile.save();

  await User.findByIdAndUpdate(req.params.driverId, { status: 'active' });

  if (profile.user?.phone) {
    await sendSMS(profile.user.phone, `GoRide: Your account has been reinstated. You can go online again.`);
  }

  res.json({ status: 'success', message: 'Driver reinstated' });
});

// ── GET /api/admin/drivers ────────────────────────────────────────────────
exports.listDrivers = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status, search } = req.query;

  const filter = {};
  if (status) filter.verificationStatus = status;

  let profiles = DriverProfile.find(filter)
    .populate({
      path: 'user',
      select: 'firstName lastName email phone avatar rating totalRides totalEarnings isOnline status createdAt',
      match: search ? {
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName:  { $regex: search, $options: 'i' } },
          { email:     { $regex: search, $options: 'i' } },
        ],
      } : {},
    })
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const [results, total] = await Promise.all([
    profiles,
    DriverProfile.countDocuments(filter),
  ]);

  // Filter out null users (didn't match search)
  const filtered = results.filter((p) => p.user !== null);

  res.json({ status: 'success', drivers: filtered, total, page: +page, pages: Math.ceil(total / limit) });
});
