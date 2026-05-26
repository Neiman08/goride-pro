const User          = require('../models/User');
const DriverProfile = require('../models/DriverProfile');
const Vehicle       = require('../models/Vehicle');
const { uploadFile, uploadBase64 } = require('../services/cloudinaryService');
const { generateOTP, sendOTP }     = require('../services/twilioService');
const AppError   = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const logger     = require('../utils/logger');
const jwt        = require('jsonwebtoken');

const signAccess   = (id) => jwt.sign({ id }, process.env.JWT_SECRET,         { expiresIn: process.env.JWT_EXPIRE || '15m' });
const signRefresh  = (id) => jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' });

// ── POST /api/driver/register ──────────────────────────────────────────────
// Step 1: Basic info + credentials
exports.registerStep1 = catchAsync(async (req, res, next) => {
  const {
    firstName, lastName, email, password, phone,
    dateOfBirth, address, ssn,
  } = req.body;

  if (await User.findOne({ email })) {
    return next(new AppError('Email already registered', 400));
  }

  const user = new User({
    firstName, lastName, email, password, phone,
    role: 'driver',
    status: 'pending_verification',
    dateOfBirth,
    address,
  });

  if (ssn) {
    user.setSSN(ssn);
  }

  await user.save();

  // Create empty driver profile
  await DriverProfile.create({ user: user._id });

  // Send phone OTP
  if (phone) {
    const otp     = generateOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await User.findByIdAndUpdate(user._id, {
      phoneOTP: otp,
      phoneOTPExpires: expires,
    });

    await sendOTP(phone, otp).catch((err) =>
      logger.warn(`OTP send failed for ${phone}: ${err.message}`)
    );
  }

  const accessToken  = signAccess(user._id);
  const refreshToken = signRefresh(user._id);
  user.refreshToken  = refreshToken;
  user.lastLoginAt   = new Date();
  await user.save({ validateBeforeSave: false });

  logger.info(`Driver registered (step 1): ${email}`);
  res.status(201).json({
    status: 'success',
    message: 'Account created. Please complete verification.',
    accessToken,
    refreshToken,
    user,
    nextStep: 'verify_phone',
  });
});

// ── POST /api/driver/verify-phone ──────────────────────────────────────────
exports.verifyPhone = catchAsync(async (req, res, next) => {
  const { otp } = req.body;
  const user = await User.findById(req.user._id).select('+phoneOTP +phoneOTPExpires');

  if (!user.phoneOTP || !user.phoneOTPExpires) {
    return next(new AppError('No OTP requested. Request a new one.', 400));
  }
  if (new Date() > user.phoneOTPExpires) {
    return next(new AppError('OTP expired. Request a new one.', 400));
  }
  if (user.phoneOTP !== otp.trim()) {
    return next(new AppError('Incorrect OTP', 400));
  }

  user.phoneVerified  = true;
  user.phoneOTP       = undefined;
  user.phoneOTPExpires = undefined;
  await user.save({ validateBeforeSave: false });

  res.json({ status: 'success', message: 'Phone verified', nextStep: 'upload_documents' });
});

// ── POST /api/driver/resend-otp ────────────────────────────────────────────
exports.resendOTP = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user.phone) return next(new AppError('No phone number on file', 400));

  const otp     = generateOTP();
  const expires = new Date(Date.now() + 10 * 60 * 1000);

  await User.findByIdAndUpdate(user._id, { phoneOTP: otp, phoneOTPExpires: expires });
  await sendOTP(user.phone, otp);

  res.json({ status: 'success', message: 'OTP sent' });
});

// ── POST /api/driver/upload-license ───────────────────────────────────────
exports.uploadLicense = catchAsync(async (req, res, next) => {
  const { licenseNumber, state, expiryDate, frontBase64, backBase64 } = req.body;

  const profile = await DriverProfile.findOne({ user: req.user._id });
  if (!profile) return next(new AppError('Driver profile not found', 404));

  const uploads = await Promise.all([
    frontBase64 ? uploadBase64(frontBase64, 'license', `license_front_${req.user._id}`) : null,
    backBase64  ? uploadBase64(backBase64,  'license', `license_back_${req.user._id}`)  : null,
  ]);

  profile.license = {
    number:     licenseNumber,
    state,
    expiryDate: new Date(expiryDate),
    frontPhoto: uploads[0] || profile.license?.frontPhoto,
    backPhoto:  uploads[1] || profile.license?.backPhoto,
  };

  await profile.save();
  logger.info(`License uploaded for driver ${req.user._id}`);
  res.json({ status: 'success', message: 'License uploaded', nextStep: 'upload_selfie' });
});

// ── POST /api/driver/upload-selfie ────────────────────────────────────────
exports.uploadSelfie = catchAsync(async (req, res, next) => {
  const { selfieBase64 } = req.body;
  if (!selfieBase64) return next(new AppError('Selfie image required', 400));

  const profile = await DriverProfile.findOne({ user: req.user._id });
  if (!profile) return next(new AppError('Driver profile not found', 404));

  const uploaded = await uploadBase64(selfieBase64, 'selfie', `selfie_${req.user._id}`);

  profile.selfie = {
    url:      uploaded.url,
    publicId: uploaded.publicId,
    verified: false, // admin verifies manually
  };

  await profile.save();

  // Also update user avatar with selfie
  await User.findByIdAndUpdate(req.user._id, {
    avatar: { url: uploaded.url, publicId: uploaded.publicId },
  });

  res.json({ status: 'success', message: 'Selfie uploaded', nextStep: 'upload_insurance' });
});

// ── POST /api/driver/upload-insurance ─────────────────────────────────────
exports.uploadInsurance = catchAsync(async (req, res, next) => {
  const { expiryDate, documentBase64 } = req.body;

  const profile = await DriverProfile.findOne({ user: req.user._id });
  if (!profile) return next(new AppError('Driver profile not found', 404));

  const uploaded = await uploadBase64(documentBase64, 'insurance', `insurance_${req.user._id}`);

  profile.insurance = {
    url:        uploaded.url,
    publicId:   uploaded.publicId,
    expiryDate: new Date(expiryDate),
    status:     'pending',
    uploadedAt: new Date(),
  };

  await profile.save();
  res.json({ status: 'success', message: 'Insurance uploaded', nextStep: 'add_vehicle' });
});

// ── POST /api/driver/upload-registration ──────────────────────────────────
exports.uploadRegistration = catchAsync(async (req, res, next) => {
  const { expiryDate, documentBase64 } = req.body;

  const profile = await DriverProfile.findOne({ user: req.user._id });
  if (!profile) return next(new AppError('Driver profile not found', 404));

  const uploaded = await uploadBase64(documentBase64, 'registration', `registration_${req.user._id}`);

  profile.registration = {
    url:        uploaded.url,
    publicId:   uploaded.publicId,
    expiryDate: new Date(expiryDate),
    status:     'pending',
    uploadedAt: new Date(),
  };

  await profile.save();
  res.json({ status: 'success', message: 'Registration uploaded' });
});

// ── POST /api/driver/add-vehicle ──────────────────────────────────────────
exports.addVehicle = catchAsync(async (req, res, next) => {
  const { make, model, year, color, plate, vin, type, photoBase64 } = req.body;

  // Deactivate previous primary vehicle
  await Vehicle.updateMany({ driver: req.user._id }, { isActive: false });

  const vehicle = new Vehicle({ driver: req.user._id, make, model, year, color, plate, vin, type, isActive: true });

  if (photoBase64) {
    const uploaded = await uploadBase64(photoBase64, 'vehicle', `vehicle_${req.user._id}_${Date.now()}`);
    vehicle.photos.push({ url: uploaded.url, publicId: uploaded.publicId, isPrimary: true });
  }

  await vehicle.save();
  res.status(201).json({ status: 'success', message: 'Vehicle added', vehicle, nextStep: 'sign_terms' });
});

// ── POST /api/driver/sign-terms ───────────────────────────────────────────
exports.signTerms = catchAsync(async (req, res, next) => {
  const { documents, ip, userAgent } = req.body;
  // documents: ['terms', 'privacy', 'conduct']

  const profile = await DriverProfile.findOne({ user: req.user._id });
  if (!profile) return next(new AppError('Driver profile not found', 404));

  const timestamp = new Date();
  const sigDocs = (documents || ['terms', 'privacy', 'conduct']).map((doc) => ({
    document:  doc,
    accepted:  true,
    timestamp,
    ip:        ip || req.ip,
    userAgent: userAgent || req.headers['user-agent'],
    version:   '2026-01',
  }));

  profile.signatures = sigDocs;
  profile.activityLog.push({ action: 'terms_signed', note: `Signed: ${documents?.join(', ')}`, timestamp });
  await profile.save();

  // Mark user terms accepted
  await User.findByIdAndUpdate(req.user._id, {
    termsAccepted: { accepted: true, timestamp, ip: ip || req.ip, userAgent, version: '2026-01' },
  });

  res.json({
    status: 'success',
    message: 'Terms signed. Your application is under review.',
    verificationStatus: 'pending_verification',
  });
});

// ── GET /api/driver/status ────────────────────────────────────────────────
exports.getStatus = catchAsync(async (req, res, next) => {
  const profile = await DriverProfile.findOne({ user: req.user._id });
  if (!profile) return next(new AppError('Driver profile not found', 404));

  const vehicle = await Vehicle.findOne({ driver: req.user._id, isActive: true });

  const completedSteps = {
    basicInfo:    !!(req.user.firstName && req.user.email),
    phoneVerified: req.user.phoneVerified,
    license:      !!(profile.license?.frontPhoto?.url),
    selfie:       !!(profile.selfie?.url),
    insurance:    !!(profile.insurance?.url),
    registration: !!(profile.registration?.url),
    vehicle:      !!vehicle,
    termsSigned:  profile.signatures?.length > 0,
  };

  const totalSteps     = Object.keys(completedSteps).length;
  const completedCount = Object.values(completedSteps).filter(Boolean).length;

  res.json({
    status: 'success',
    verificationStatus: profile.verificationStatus,
    verificationNotes:  profile.verificationNotes,
    completedSteps,
    progress: Math.round((completedCount / totalSteps) * 100),
    canReceiveRides: profile.canReceiveRides,
  });
});
