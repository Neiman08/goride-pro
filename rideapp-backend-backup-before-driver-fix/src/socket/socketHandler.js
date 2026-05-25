const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const NEARBY_RADIUS_METERS = 12875; // ~8 miles

const initSocket = (io) => {
  // ── Auth middleware for every socket connection ──────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('AUTH_REQUIRED'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user || !user.isActive) return next(new Error('USER_NOT_FOUND'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.user;
    logger.info(`Socket connected: ${user.role} ${user.name} (${socket.id})`);

    // Every user joins their personal room (for direct notifications)
    socket.join(`user:${user._id}`);

    // Admins join admin room (for real-time dashboard updates)
    if (user.role === 'admin') socket.join('admin');

    // Save socket ID to DB
    await User.findByIdAndUpdate(user._id, { socketId: socket.id });

    // ── DRIVER EVENTS ──────────────────────────────────────────────────────

    // Driver goes online — saves location + marks available
    socket.on('driver:go_online', async ({ lat, lng }) => {
      if (user.role !== 'driver') return;
      await User.findByIdAndUpdate(user._id, {
        isOnline: true,
        currentLocation: { type: 'Point', coordinates: [lng, lat] },
      });
      socket.join('drivers:online');
      io.to('admin').emit('admin:driver_online', { driverId: user._id, name: user.name, lat, lng });
      logger.info(`Driver online: ${user.name}`);
    });

    // Driver goes offline
    socket.on('driver:go_offline', async () => {
      if (user.role !== 'driver') return;
      await User.findByIdAndUpdate(user._id, { isOnline: false });
      socket.leave('drivers:online');
      io.to('admin').emit('admin:driver_offline', { driverId: user._id });
    });

    // Driver location update — called every few seconds while on a trip
    socket.on('driver:location_update', async ({ lat, lng, rideId }) => {
      if (user.role !== 'driver') return;

      await User.findByIdAndUpdate(user._id, {
        currentLocation: { type: 'Point', coordinates: [lng, lat] },
      });

      // Notify the passenger on this ride
      if (rideId) {
        io.to(`ride:${rideId}`).emit('ride:driver_moved', {
          driverId: user._id,
          lat,
          lng,
          timestamp: Date.now(),
        });
      }

      // Notify admin dashboard
      io.to('admin').emit('admin:driver_moved', { driverId: user._id, lat, lng });
    });

    // ── PASSENGER EVENTS ───────────────────────────────────────────────────

    // Passenger joins a ride room (for real-time updates on that ride)
    socket.on('ride:join', ({ rideId }) => {
      socket.join(`ride:${rideId}`);
    });

    socket.on('ride:leave', ({ rideId }) => {
      socket.leave(`ride:${rideId}`);
    });

    // ── IN-RIDE CHAT ───────────────────────────────────────────────────────
    socket.on('chat:message', ({ rideId, message }) => {
      if (!rideId || !message?.trim()) return;
      const payload = {
        from: { id: user._id, name: user.name, role: user.role },
        message: message.trim().substring(0, 500), // cap message length
        timestamp: new Date(),
      };
      // Send to everyone in the ride room except sender
      socket.to(`ride:${rideId}`).emit('chat:message', payload);
    });

    // ── DISCONNECT ─────────────────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      logger.info(`Socket disconnected: ${user.role} ${user.name} — ${reason}`);
      await User.findByIdAndUpdate(user._id, { socketId: null });

      if (user.role === 'driver') {
        await User.findByIdAndUpdate(user._id, { isOnline: false });
        io.to('admin').emit('admin:driver_offline', { driverId: user._id });
      }
    });
  });

  // ── Utility: dispatch ride request to nearby drivers ────────────────────
  // Called from ridesController — not a socket event
  io.dispatchRideToNearbyDrivers = async (ride, passengerLocation) => {
    const nearbyDrivers = await User.find({
      role: 'driver',
      isOnline: true,
      isApproved: true,
      socketId: { $ne: null },
      currentLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [passengerLocation.lng, passengerLocation.lat] },
          $maxDistance: NEARBY_RADIUS_METERS,
        },
      },
    }).select('socketId name');

    if (nearbyDrivers.length === 0) {
      logger.warn(`No nearby drivers for ride ${ride._id} — broadcasting to all online drivers`);
      io.to('drivers:online').emit('ride:new_request', ride);
      return 0;
    }

    nearbyDrivers.forEach((d) => {
      io.to(d.socketId).emit('ride:new_request', ride);
    });

    logger.info(`Dispatched ride ${ride._id} to ${nearbyDrivers.length} nearby drivers`);
    return nearbyDrivers.length;
  };

  return io;
};

module.exports = initSocket;
