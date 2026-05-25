const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();
const ctrl = require('../controllers/ridesController');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');

// Estimate is public (no auth needed for price lookup)
router.get('/estimate', ctrl.getEstimate);

// All other ride routes require auth
router.use(protect);

router.get('/active', ctrl.getActiveRide);
router.get('/history', ctrl.getRideHistory);

// Passenger only
router.post('/request', restrictTo('passenger'), [
  body('origin.address').notEmpty().withMessage('Origin address required'),
  body('origin.coordinates.lat').isFloat().withMessage('Origin lat required'),
  body('origin.coordinates.lng').isFloat().withMessage('Origin lng required'),
  body('destination.address').notEmpty().withMessage('Destination address required'),
  body('destination.coordinates.lat').isFloat().withMessage('Destination lat required'),
  body('destination.coordinates.lng').isFloat().withMessage('Destination lng required'),
  body('rideType').optional().isIn(['economy', 'comfort', 'xl']),
  validate,
], ctrl.requestRide);

// Driver only
router.get('/available', restrictTo('driver'), ctrl.getAvailableRides);
router.post('/:id/accept', restrictTo('driver'), ctrl.acceptRide);
router.post('/:id/reject', restrictTo('driver'), ctrl.rejectRide);
router.post('/:id/start', restrictTo('driver'), ctrl.startRide);
router.post('/:id/complete', restrictTo('driver'), ctrl.completeRide);

// Both passenger and driver (+ admin)
router.post('/:id/cancel', ctrl.cancelRide);
router.post('/:id/rate', [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1–5'),
  body('comment').optional().isString().isLength({ max: 300 }),
  validate,
], ctrl.rateRide);

module.exports = router;
