const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(protect, restrictTo('admin'));

// Dashboard
router.get('/metrics', ctrl.getMetrics);
router.get('/revenue-chart', ctrl.getRevenueChart);

// Users
router.get('/users', ctrl.listUsers);
router.get('/users/:id', ctrl.getUser);
router.patch('/users/:id', ctrl.updateUser);

// Drivers
router.get('/drivers', ctrl.listDrivers);
router.get('/drivers/live', ctrl.getLiveDrivers);
router.get('/drivers/:id/earnings', ctrl.getDriverEarnings);

// Rides
router.get('/rides', ctrl.listRides);
router.get('/rides/:id', ctrl.getRide);

// Commissions
router.get('/commissions', ctrl.listCommissions);

// Tariffs
router.get('/tariffs', ctrl.getTariffs);
router.patch('/tariffs/:id', ctrl.updateTariff);

module.exports = router;
