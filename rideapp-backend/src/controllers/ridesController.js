const Ride = require('../models/Ride');
const User = require('../models/User');
const Commission = require('../models/Commission');
const { getPriceEstimates, getFareForRideType } = require('../services/pricingService');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const logger = require('../utils/logger');

// ── GET /api/rides/estimate ────────────────────────────────────────────────
// Returns fare breakdown for all ride types before booking. No auth required.
exports.getEstimate = catchAsync(async (req, res) => {
  const { originLat, originLng, destLat, destLng } = req.query;

  if (!originLat || !originLng || !destLat || !destLng) {
    throw new AppError('originLat, originLng, destLat, destLng are required', 400);
  }

  const origin = { lat: parseFloat(originLat), lng: parseFloat(originLng) };
  const destination = { lat: parseFloat(destLat), lng: parseFloat(destLng) };

  const { route, fares } = await getPriceEstimates(origin, destination);
  res.json({ status: 'success', route, fares });
});

// ── POST /api/rides/request ────────────────────────────────────────────────
exports.requestRide = catchAsync(async (req, res, next) => {
  const { origin, destination, rideType = 'economy' } = req.body;

  if (!origin?.coordinates?.lat || !destination?.coordinates?.lat) {
    return next(new AppError('origin and destination with coordinates required', 400));
  }

  // One active ride at a time
  const existing = await Ride.findOne({
    passenger: req.user._id,
    status: { $in: ['searching', 'accepted', 'in_progress'] },
  });
  if (existing) return next(new AppError('You already have an active ride', 409));

  // Real price from Google Maps
  const { route, fareBreakdown } = await getFareForRideType(
    origin.coordinates,
    destination.coordinates,
    rideType
  );

  const ride = await Ride.create({
    passenger: req.user._id,
    origin,
    destination,
    rideType,
    distanceMiles: route.distanceMiles,
    distanceText: route.distanceText,
    durationMinutes: route.durationMinutes,
    durationText: route.durationText,
    estimatedPrice: fareBreakdown.totalFare,
    fareBreakdown: {
      baseFare: fareBreakdown.baseFare,
      distanceCost: fareBreakdown.distanceCost,
      timeCost: fareBreakdown.timeCost,
      surgeMultiplier: fareBreakdown.surgeMultiplier,
    },
    platformCut: fareBreakdown.platformCut,
    driverPayout: fareBreakdown.driverPayout,
  });

  const populated = await ride.populate('passenger', 'name phone rating avatar');

  // Geo-targeted dispatch via socket
  const dispatched = await req.io.dispatchRideToNearbyDrivers(populated, origin.coordinates);

  // Notify admin dashboard
  req.io.to('admin').emit('admin:new_ride', populated);

  logger.info(`Ride ${ride._id} requested by ${req.user.email}, dispatched to ${dispatched} drivers`);
  res.status(201).json({ status: 'success', ride: populated, nearbyDrivers: dispatched });
});

// ── POST /api/rides/:id/accept ─────────────────────────────────────────────
exports.acceptRide = catchAsync(async (req, res, next) => {
  const ride = await Ride.findById(req.params.id);
  if (!ride) return next(new AppError('Ride not found', 404));
  if (ride.status !== 'searching') return next(new AppError('Ride no longer available', 409));

  // One active ride per driver at a time
  const driverBusy = await Ride.findOne({
    driver: req.user._id,
    status: { $in: ['accepted', 'in_progress'] },
  });
  if (driverBusy) return next(new AppError('Finish your current ride first', 409));

  ride.driver = req.user._id;
  ride.status = 'accepted';
  ride.acceptedAt = new Date();
  await ride.save();

  await User.findByIdAndUpdate(req.user._id, { isOnline: false }); // driver no longer dispatched

  const populated = await ride.populate([
    { path: 'passenger', select: 'name phone rating avatar' },
    { path: 'driver', select: 'name phone rating avatar vehicleInfo currentLocation' },
  ]);

  // Notify passenger
  req.io.to(`user:${ride.passenger}`).emit('ride:accepted', populated);
  // Cancel pending dispatch for other drivers
  req.io.emit('ride:taken', { rideId: ride._id });
  // Notify admin
  req.io.to('admin').emit('admin:ride_updated', { rideId: ride._id, status: 'accepted', driver: populated.driver });

  logger.info(`Ride ${ride._id} accepted by driver ${req.user.email}`);
  res.json({ status: 'success', ride: populated });
});

// ── POST /api/rides/:id/reject ─────────────────────────────────────────────
// Driver explicitly rejects a ride request (doesn't affect ride status)
exports.rejectRide = catchAsync(async (req, res, next) => {
  const ride = await Ride.findById(req.params.id);
  if (!ride) return next(new AppError('Ride not found', 404));
  if (ride.status !== 'searching') return next(new AppError('Ride no longer available', 409));

  // Just acknowledge — ride stays in 'searching' for other drivers
  logger.info(`Driver ${req.user.email} rejected ride ${ride._id}`);
  res.json({ status: 'success', message: 'Ride rejected' });
});


// ── POST /api/rides/:id/arrived ────────────────────────────────────────────
exports.arrivedAtPickup = catchAsync(async (req, res, next) => {
  const ride = await Ride.findById(req.params.id);
  if (!ride) return next(new AppError('Ride not found', 404));
  if (ride.driver.toString() !== req.user._id.toString())
    return next(new AppError('Not your ride', 403));
  if (ride.status !== 'accepted')
    return next(new AppError('Ride must be accepted first', 400));

  ride.status = 'arrived';
  await ride.save();

  req.io.to(`user:${ride.passenger}`).emit('ride:driver_arrived', {
    rideId: ride._id,
    driverName: req.user.name,
    vehicleInfo: req.user.vehicleInfo,
  });

  logger.info(`Driver arrived at pickup for ride ${ride._id}`);
  res.json({ status: 'success', ride });
});

// ── POST /api/rides/:id/start ──────────────────────────────────────────────
exports.startRide = catchAsync(async (req, res, next) => {
  const ride = await Ride.findById(req.params.id);
  if (!ride) return next(new AppError('Ride not found', 404));
  if (ride.driver.toString() !== req.user._id.toString())
    return next(new AppError('Not your ride', 403));
  if (!['accepted', 'arrived'].includes(ride.status))
    return next(new AppError('Ride must be accepted before starting', 400));

  ride.status = 'in_progress';
  ride.startedAt = new Date();
  await ride.save();

  req.io.to(`user:${ride.passenger}`).emit('ride:started', { rideId: ride._id });
  req.io.to('admin').emit('admin:ride_updated', { rideId: ride._id, status: 'in_progress' });

  logger.info(`Ride ${ride._id} started`);
  res.json({ status: 'success', ride });
});

// ── POST /api/rides/:id/complete ───────────────────────────────────────────
exports.completeRide = catchAsync(async (req, res, next) => {
  const ride = await Ride.findById(req.params.id);
  if (!ride) return next(new AppError('Ride not found', 404));
  if (ride.driver.toString() !== req.user._id.toString())
    return next(new AppError('Not your ride', 403));
  if (ride.status !== 'in_progress')
    return next(new AppError('Ride is not in progress', 400));

  const completedAt = new Date();
  const actualMinutes = ride.startedAt
    ? Math.round(((completedAt - ride.startedAt) / 60000) * 10) / 10
    : ride.durationMinutes;

  ride.status = 'completed';
  ride.completedAt = completedAt;
  ride.finalPrice = ride.estimatedPrice;
  await ride.save();

  // Immutable financial record
  const commission = await Commission.create({
    ride: ride._id,
    driver: ride.driver,
    passenger: ride.passenger,
    rideType: ride.rideType,
    baseFare: ride.fareBreakdown?.baseFare || 0,
    distanceCost: ride.fareBreakdown?.distanceCost || 0,
    timeCost: ride.fareBreakdown?.timeCost || 0,
    surgeMultiplier: ride.fareBreakdown?.surgeMultiplier || 1,
    totalFare: ride.finalPrice,
    platformCut: ride.platformCut,
    driverPayout: ride.driverPayout,
    distanceMiles: ride.distanceMiles,
    durationMinutes: actualMinutes,
  });

  // Update earnings and ride counts
  await Promise.all([
    User.findByIdAndUpdate(ride.driver, {
      isOnline: true, // driver available again
      $inc: { totalRides: 1, totalEarnings: ride.driverPayout },
    }),
    User.findByIdAndUpdate(ride.passenger, { $inc: { totalRides: 1 } }),
  ]);

  req.io.to(`user:${ride.passenger}`).emit('ride:completed', {
    rideId: ride._id,
    finalPrice: ride.finalPrice,
    driverPayout: ride.driverPayout,
    platformCut: ride.platformCut,
  });
  req.io.to('admin').emit('admin:ride_updated', {
    rideId: ride._id,
    status: 'completed',
    totalFare: ride.finalPrice,
    platformCut: ride.platformCut,
  });

  logger.info(`Ride ${ride._id} completed. Fare: $${ride.finalPrice}, platform: $${ride.platformCut}`);
  res.json({ status: 'success', ride, commission });
});

// ── POST /api/rides/:id/cancel ─────────────────────────────────────────────
exports.cancelRide = catchAsync(async (req, res, next) => {
  const ride = await Ride.findById(req.params.id);
  if (!ride) return next(new AppError('Ride not found', 404));

  if (!['searching', 'accepted'].includes(ride.status))
    return next(new AppError(`Cannot cancel a ${ride.status} ride`, 400));

  const isPassenger = ride.passenger.toString() === req.user._id.toString();
  const isDriver = ride.driver && ride.driver.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isPassenger && !isDriver && !isAdmin)
    return next(new AppError('Not authorized to cancel this ride', 403));

  ride.status = 'cancelled';
  ride.cancelledAt = new Date();
  ride.cancelReason = req.body.reason || 'No reason provided';
  ride.cancelledBy = req.user.role === 'admin' ? 'admin' : req.user.role;
  await ride.save();

  if (ride.driver) {
    await User.findByIdAndUpdate(ride.driver, { isOnline: true });
    req.io.to(`user:${ride.driver}`).emit('ride:cancelled', { rideId: ride._id, cancelledBy: ride.cancelledBy });
  }
  req.io.to(`user:${ride.passenger}`).emit('ride:cancelled', { rideId: ride._id, cancelledBy: ride.cancelledBy });
  req.io.to('admin').emit('admin:ride_updated', { rideId: ride._id, status: 'cancelled' });

  logger.info(`Ride ${ride._id} cancelled by ${req.user.role}`);
  res.json({ status: 'success', ride });
});

// ── GET /api/rides/active ──────────────────────────────────────────────────
exports.getActiveRide = catchAsync(async (req, res) => {
  const query = req.user.role === 'driver'
    ? { driver: req.user._id, status: { $in: ['accepted', 'in_progress'] } }
    : { passenger: req.user._id, status: { $in: ['searching', 'accepted', 'in_progress'] } };

  const ride = await Ride.findOne(query)
    .populate('passenger', 'name phone rating avatar')
    .populate('driver', 'name phone rating avatar vehicleInfo currentLocation');

  res.json({ status: 'success', ride });
});

// ── GET /api/rides/available (drivers only) ────────────────────────────────
exports.getAvailableRides = catchAsync(async (req, res) => {
  const rides = await Ride.find({ status: 'searching' })
    .populate('passenger', 'name rating avatar')
    .sort('-createdAt')
    .limit(20);

  res.json({ status: 'success', rides });
});

// ── GET /api/rides/history ─────────────────────────────────────────────────
exports.getRideHistory = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const filter = req.user.role === 'driver'
    ? { driver: req.user._id }
    : { passenger: req.user._id };

  filter.status = status ? status : { $in: ['completed', 'cancelled'] };

  const [rides, total] = await Promise.all([
    Ride.find(filter)
      .populate('passenger', 'name avatar')
      .populate('driver', 'name avatar vehicleInfo')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit)),
    Ride.countDocuments(filter),
  ]);

  res.json({ status: 'success', rides, total, page: +page, pages: Math.ceil(total / limit) });
});

// ── POST /api/rides/:id/rate ───────────────────────────────────────────────
exports.rateRide = catchAsync(async (req, res, next) => {
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) return next(new AppError('Rating must be 1–5', 400));

  const ride = await Ride.findById(req.params.id);
  if (!ride) return next(new AppError('Ride not found', 404));
  if (ride.status !== 'completed') return next(new AppError('Can only rate completed rides', 400));

  const isPassenger = ride.passenger.toString() === req.user._id.toString();
  const isDriver = ride.driver && ride.driver.toString() === req.user._id.toString();

  if (!isPassenger && !isDriver) return next(new AppError('Not authorized', 403));

  if (isPassenger) {
    if (ride.driverRating) return next(new AppError('Already rated this ride', 400));
    ride.driverRating = rating;
    ride.driverRatingComment = comment;
    const driver = await User.findById(ride.driver);
    driver.updateRating(rating);
    await driver.save({ validateBeforeSave: false });
  } else {
    if (ride.passengerRating) return next(new AppError('Already rated this ride', 400));
    ride.passengerRating = rating;
    ride.passengerRatingComment = comment;
    const passenger = await User.findById(ride.passenger);
    passenger.updateRating(rating);
    await passenger.save({ validateBeforeSave: false });
  }

  await ride.save();
  res.json({ status: 'success', ride });
});
