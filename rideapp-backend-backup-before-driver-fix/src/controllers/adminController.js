const User = require('../models/User');
const Ride = require('../models/Ride');
const Commission = require('../models/Commission');
const TariffConfig = require('../models/TariffConfig');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const logger = require('../utils/logger');

// ── Dashboard metrics ──────────────────────────────────────────────────────
exports.getMetrics = catchAsync(async (req, res) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    totalDrivers,
    activeDrivers,
    pendingDrivers,
    totalPassengers,

    ridesTotal,
    ridesToday,
    ridesThisWeek,
    ridesThisMonth,
    ridesLive,

    commissionToday,
    commissionMonth,
    commissionTotal,

    recentRides,
  ] = await Promise.all([
    User.countDocuments({ role: { $ne: 'admin' }, isActive: true }),
    User.countDocuments({ role: 'driver', isActive: true }),
    User.countDocuments({ role: 'driver', isOnline: true }),
    User.countDocuments({ role: 'driver', isApproved: false }),
    User.countDocuments({ role: 'passenger', isActive: true }),

    Ride.countDocuments(),
    Ride.countDocuments({ createdAt: { $gte: startOfDay } }),
    Ride.countDocuments({ createdAt: { $gte: startOfWeek } }),
    Ride.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Ride.countDocuments({ status: { $in: ['searching', 'accepted', 'in_progress'] } }),

    Commission.aggregate([
      { $match: { createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$totalFare' }, platform: { $sum: '$platformCut' }, drivers: { $sum: '$driverPayout' }, count: { $sum: 1 } } },
    ]),
    Commission.aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$totalFare' }, platform: { $sum: '$platformCut' }, drivers: { $sum: '$driverPayout' }, count: { $sum: 1 } } },
    ]),
    Commission.aggregate([
      { $group: { _id: null, total: { $sum: '$totalFare' }, platform: { $sum: '$platformCut' }, drivers: { $sum: '$driverPayout' }, count: { $sum: 1 } } },
    ]),

    Ride.find({ status: { $in: ['searching', 'accepted', 'in_progress'] } })
      .populate('passenger', 'name')
      .populate('driver', 'name')
      .sort('-createdAt')
      .limit(10),
  ]);

  const fmt = (arr) => arr[0] || { total: 0, platform: 0, drivers: 0, count: 0 };

  res.json({
    status: 'success',
    metrics: {
      users: { total: totalUsers, drivers: totalDrivers, passengers: totalPassengers, activeDrivers, pendingDrivers },
      rides: { total: ridesTotal, today: ridesToday, week: ridesThisWeek, month: ridesThisMonth, live: ridesLive },
      revenue: {
        today: fmt(commissionToday),
        month: fmt(commissionMonth),
        allTime: fmt(commissionTotal),
      },
      recentLiveRides: recentRides,
    },
  });
});

// ── Revenue chart data (last 30 days) ─────────────────────────────────────
exports.getRevenueChart = catchAsync(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const data = await Commission.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        totalFare: { $sum: '$totalFare' },
        platformCut: { $sum: '$platformCut' },
        driverPayout: { $sum: '$driverPayout' },
        rides: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({ status: 'success', chart: data });
});

// ── Users list ─────────────────────────────────────────────────────────────
exports.listUsers = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, role, search, isActive } = req.query;
  const filter = {};

  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-password -refreshToken')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit)),
    User.countDocuments(filter),
  ]);

  res.json({ status: 'success', users, total, page: +page, pages: Math.ceil(total / limit) });
});

// ── Single user ────────────────────────────────────────────────────────────
exports.getUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('-password -refreshToken');
  if (!user) return next(new AppError('User not found', 404));

  // Get their ride history
  const recentRides = await Ride.find({
    $or: [{ passenger: user._id }, { driver: user._id }],
    status: { $in: ['completed', 'cancelled'] },
  })
    .populate('passenger', 'name')
    .populate('driver', 'name')
    .sort('-createdAt')
    .limit(10);

  // If driver, get their commission summary
  let commissionSummary = null;
  if (user.role === 'driver') {
    const agg = await Commission.aggregate([
      { $match: { driver: user._id } },
      { $group: { _id: null, totalEarnings: { $sum: '$driverPayout' }, totalRides: { $sum: 1 }, avgFare: { $avg: '$totalFare' } } },
    ]);
    commissionSummary = agg[0] || null;
  }

  res.json({ status: 'success', user, recentRides, commissionSummary });
});

// ── Update user (suspend/activate/approve driver) ──────────────────────────
exports.updateUser = catchAsync(async (req, res, next) => {
  const { isActive, isApproved, role } = req.body;

  // Don't allow role escalation to admin via API
  if (role === 'admin') return next(new AppError('Cannot assign admin role via API', 403));

  const updates = {};
  if (isActive !== undefined) updates.isActive = isActive;
  if (isApproved !== undefined) updates.isApproved = isApproved;
  if (role) updates.role = role;

  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password -refreshToken');
  if (!user) return next(new AppError('User not found', 404));

  logger.info(`Admin ${req.user.email} updated user ${user.email}: ${JSON.stringify(updates)}`);
  res.json({ status: 'success', user });
});

// ── Drivers list (with online status) ─────────────────────────────────────
exports.listDrivers = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, isOnline, isApproved, search } = req.query;
  const filter = { role: 'driver' };

  if (isOnline !== undefined) filter.isOnline = isOnline === 'true';
  if (isApproved !== undefined) filter.isApproved = isApproved === 'true';
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { 'vehicleInfo.plate': { $regex: search, $options: 'i' } },
    ];
  }

  const [drivers, total] = await Promise.all([
    User.find(filter)
      .select('name email phone vehicleInfo rating totalRides totalEarnings isOnline isApproved isActive currentLocation createdAt')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit)),
    User.countDocuments(filter),
  ]);

  res.json({ status: 'success', drivers, total, page: +page, pages: Math.ceil(total / limit) });
});

// ── Live drivers map data ──────────────────────────────────────────────────
exports.getLiveDrivers = catchAsync(async (req, res) => {
  const drivers = await User.find({ role: 'driver', isOnline: true })
    .select('name rating vehicleInfo currentLocation totalRides');

  res.json({ status: 'success', drivers });
});

// ── Rides list ─────────────────────────────────────────────────────────────
exports.listRides = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status, rideType, driverId, passengerId, from, to } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (rideType) filter.rideType = rideType;
  if (driverId) filter.driver = driverId;
  if (passengerId) filter.passenger = passengerId;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const [rides, total] = await Promise.all([
    Ride.find(filter)
      .populate('passenger', 'name phone')
      .populate('driver', 'name phone')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit)),
    Ride.countDocuments(filter),
  ]);

  res.json({ status: 'success', rides, total, page: +page, pages: Math.ceil(total / limit) });
});

// ── Single ride ────────────────────────────────────────────────────────────
exports.getRide = catchAsync(async (req, res, next) => {
  const ride = await Ride.findById(req.params.id)
    .populate('passenger', 'name email phone rating')
    .populate('driver', 'name email phone rating vehicleInfo');
  if (!ride) return next(new AppError('Ride not found', 404));

  const commission = await Commission.findOne({ ride: ride._id });
  res.json({ status: 'success', ride, commission });
});

// ── Commissions list ───────────────────────────────────────────────────────
exports.listCommissions = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, driverId, from, to, paymentStatus } = req.query;
  const filter = {};

  if (driverId) filter.driver = driverId;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const [commissions, total, summary] = await Promise.all([
    Commission.find(filter)
      .populate('driver', 'name email')
      .populate('passenger', 'name')
      .populate('ride', 'rideType origin destination createdAt')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit)),
    Commission.countDocuments(filter),
    Commission.aggregate([
      { $match: filter },
      { $group: { _id: null, totalFare: { $sum: '$totalFare' }, platformCut: { $sum: '$platformCut' }, driverPayout: { $sum: '$driverPayout' } } },
    ]),
  ]);

  res.json({
    status: 'success',
    commissions,
    total,
    page: +page,
    pages: Math.ceil(total / limit),
    summary: summary[0] || { totalFare: 0, platformCut: 0, driverPayout: 0 },
  });
});

// ── Driver earnings breakdown ──────────────────────────────────────────────
exports.getDriverEarnings = catchAsync(async (req, res, next) => {
  const driver = await User.findOne({ _id: req.params.id, role: 'driver' });
  if (!driver) return next(new AppError('Driver not found', 404));

  const { from, to } = req.query;
  const match = { driver: driver._id };
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }

  const [byDay, byRideType, totals] = await Promise.all([
    Commission.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, rides: { $sum: 1 }, earnings: { $sum: '$driverPayout' }, platformCut: { $sum: '$platformCut' } } },
      { $sort: { _id: -1 } },
      { $limit: 30 },
    ]),
    Commission.aggregate([
      { $match: match },
      { $group: { _id: '$rideType', rides: { $sum: 1 }, earnings: { $sum: '$driverPayout' }, avgFare: { $avg: '$totalFare' } } },
    ]),
    Commission.aggregate([
      { $match: match },
      { $group: { _id: null, totalRides: { $sum: 1 }, totalEarnings: { $sum: '$driverPayout' }, totalPlatform: { $sum: '$platformCut' }, totalFare: { $sum: '$totalFare' } } },
    ]),
  ]);

  res.json({
    status: 'success',
    driver: { id: driver._id, name: driver.name, email: driver.email, rating: driver.rating },
    byDay,
    byRideType,
    totals: totals[0] || {},
  });
});

// ── Tariffs: get all ───────────────────────────────────────────────────────
exports.getTariffs = catchAsync(async (req, res) => {
  const tariffs = await TariffConfig.find().sort('rideType');
  res.json({ status: 'success', tariffs });
});

// ── Tariffs: update one ────────────────────────────────────────────────────
exports.updateTariff = catchAsync(async (req, res, next) => {
  const allowed = [
    'baseFare', 'ratePerMile', 'ratePerMinute', 'minimumFare',
    'surgeMultiplier', 'surgeActive', 'platformCommissionPct',
    'driverPayoutPct', 'isActive', 'estimatedWaitMinutes', 'label', 'description',
  ];

  // Validate commission adds up to 100
  if (req.body.platformCommissionPct !== undefined || req.body.driverPayoutPct !== undefined) {
    const tariff = await TariffConfig.findById(req.params.id);
    if (!tariff) return next(new AppError('Tariff not found', 404));
    const platform = req.body.platformCommissionPct ?? tariff.platformCommissionPct;
    const driver = req.body.driverPayoutPct ?? tariff.driverPayoutPct;
    if (Math.abs(platform + driver - 100) > 0.01) {
      return next(new AppError('platformCommissionPct + driverPayoutPct must equal 100', 400));
    }
  }

  const updates = {};
  allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  const tariff = await TariffConfig.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!tariff) return next(new AppError('Tariff not found', 404));

  logger.info(`Admin ${req.user.email} updated tariff ${tariff.rideType}: ${JSON.stringify(updates)}`);
  res.json({ status: 'success', tariff });
});
