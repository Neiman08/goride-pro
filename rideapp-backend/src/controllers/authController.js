const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const logger = require('../utils/logger');

// ── Token helpers ──────────────────────────────────────────────────────────
const signAccess = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '15m' });

const signRefresh = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
  });

const sendTokens = async (user, statusCode, res) => {
  const accessToken = signAccess(user._id);
  const refreshToken = signRefresh(user._id);

  // Store hashed refresh token in DB for rotation
  user.refreshToken = refreshToken;
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  res.status(statusCode).json({
    status: 'success',
    accessToken,
    refreshToken,
    user,
  });
};

// ── POST /api/auth/register ────────────────────────────────────────────────
exports.register = catchAsync(async (req, res, next) => {
  const { name, email, password, phone, role, vehicleInfo, licenseNumber } = req.body;

  // Only allow passenger/driver self-registration. Admin created by seed.
  if (role === 'admin') return next(new AppError('Admin accounts cannot be self-registered.', 403));

  const user = await User.create({
    name,
    email,
    password,
    phone,
    role: role || 'passenger',
    vehicleInfo: role === 'driver' ? vehicleInfo : undefined,
    licenseNumber: role === 'driver' ? licenseNumber : undefined,
    isApproved: role === 'driver' ? false : true, // drivers need admin approval
  });

  logger.info(`New ${user.role} registered: ${user.email}`);
  await sendTokens(user, 201, res);
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) return next(new AppError('Email and password required.', 400));

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Invalid email or password.', 401));
  }
  if (!user.isActive) return next(new AppError('Account suspended. Contact support.', 403));
  if (user.role === 'driver' && !user.isApproved) {
    return next(new AppError('Driver account pending admin approval.', 403));
  }

  logger.info(`Login: ${user.email} (${user.role})`);
  await sendTokens(user, 200, res);
});

// ── POST /api/auth/refresh ─────────────────────────────────────────────────
exports.refresh = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return next(new AppError('Refresh token required.', 400));

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    return next(new AppError('Invalid or expired refresh token.', 401));
  }

  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user || user.refreshToken !== refreshToken) {
    return next(new AppError('Refresh token reuse detected. Please log in again.', 401));
  }

  await sendTokens(user, 200, res);
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────
exports.logout = catchAsync(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { refreshToken: null, socketId: null });
  res.json({ status: 'success', message: 'Logged out successfully.' });
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
exports.getMe = catchAsync(async (req, res) => {
  res.json({ status: 'success', user: req.user });
});

// ── PATCH /api/auth/update-profile ────────────────────────────────────────
exports.updateProfile = catchAsync(async (req, res, next) => {
  // Block password changes here — must use dedicated endpoint
  if (req.body.password || req.body.role) {
    return next(new AppError('Cannot update password or role via this route.', 400));
  }

  const allowedFields = ['name', 'phone', 'avatar', 'vehicleInfo'];
  const updates = {};
  allowedFields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  res.json({ status: 'success', user });
});

// ── PATCH /api/auth/change-password ───────────────────────────────────────
exports.changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return next(new AppError('Current and new password required.', 400));
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    return next(new AppError('Current password incorrect.', 401));
  }

  user.password = newPassword;
  await user.save();

  logger.info(`Password changed: ${user.email}`);
  await sendTokens(user, 200, res);
});
