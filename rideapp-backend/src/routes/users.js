const express = require('express');
const router = express.Router();
const User = require('../models/User');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);

// PATCH /api/users/location — driver updates GPS position (HTTP fallback; prefer socket)
router.patch('/location', restrictTo('driver'), catchAsync(async (req, res, next) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return next(new AppError('lat and lng required', 400));

  await User.findByIdAndUpdate(req.user._id, {
    currentLocation: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
  });

  req.io.to('admin').emit('admin:driver_moved', { driverId: req.user._id, lat, lng });
  res.json({ status: 'success' });
}));

// PATCH /api/users/availability — driver toggle online/offline
router.patch('/availability', restrictTo('driver'), catchAsync(async (req, res) => {
  const { isOnline } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { isOnline: Boolean(isOnline) },
    { new: true }
  );
  res.json({ status: 'success', isOnline: user.isOnline });
}));

// GET /api/users/drivers/nearby — passenger sees nearby drivers before booking
router.get('/drivers/nearby', catchAsync(async (req, res, next) => {
  const { lat, lng, radius = 8000 } = req.query;
  if (!lat || !lng) return next(new AppError('lat and lng required', 400));

  const drivers = await User.find({
    role: 'driver',
    isOnline: true,
    isApproved: true,
    currentLocation: {
      $near: {
        $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
        $maxDistance: parseInt(radius),
      },
    },
  }).select('name rating vehicleInfo currentLocation avatar');

  res.json({ status: 'success', drivers });
}));

module.exports = router;
