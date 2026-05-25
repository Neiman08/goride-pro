const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/ridesController');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  rideRequestValidator, estimateValidator,
  ratingValidator, cancelValidator, mongoIdParam,
} = require('../middleware/validators');

// Public
router.get('/estimate', estimateValidator, validate, ctrl.getEstimate);

router.use(protect);

router.get('/active',    ctrl.getActiveRide);
router.get('/history',   ctrl.getRideHistory);

// Passenger
router.post('/request', restrictTo('passenger'), rideRequestValidator, validate, ctrl.requestRide);

// Driver
router.get('/available',         restrictTo('driver'), ctrl.getAvailableRides);
router.post('/:id/accept',       restrictTo('driver'), mongoIdParam, validate, ctrl.acceptRide);
router.post('/:id/reject',       restrictTo('driver'), mongoIdParam, validate, ctrl.rejectRide);
router.post('/:id/arrived',      restrictTo('driver'), mongoIdParam, validate, ctrl.arrivedAtPickup);
router.post('/:id/start',        restrictTo('driver'), mongoIdParam, validate, ctrl.startRide);
router.post('/:id/complete',     restrictTo('driver'), mongoIdParam, validate, ctrl.completeRide);

// Both + admin
router.post('/:id/cancel', mongoIdParam, cancelValidator, validate, ctrl.cancelRide);
router.post('/:id/rate',   mongoIdParam, ratingValidator,  validate, ctrl.rateRide);

module.exports = router;
