const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Verify access token, attach req.user
exports.protect = catchAsync(async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return next(new AppError('No token provided. Please log in.', 401));
  }

  const token = auth.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') return next(new AppError('Token expired. Please log in again.', 401));
    return next(new AppError('Invalid token.', 401));
  }

  const user = await User.findById(decoded.id).select('+passwordChangedAt');
  if (!user) return next(new AppError('User no longer exists.', 401));
  if (!user.isActive) return next(new AppError('Account suspended. Contact support.', 403));
  if (user.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('Password recently changed. Please log in again.', 401));
  }

  req.user = user;
  next();
});

// Role-based access control
exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError(`Access denied. Required role: ${roles.join(' or ')}.`, 403));
  }
  next();
};

// Optional auth — attaches user if token present, but doesn't block
exports.optionalAuth = catchAsync(async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return next();
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
  } catch {
    // silently ignore invalid token in optional auth
  }
  next();
});
