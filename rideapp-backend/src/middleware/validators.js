const { body, param, query } = require('express-validator');

const mongoIdParam = [
  param('id').isMongoId().withMessage('Invalid ride id'),
];

const estimateValidator = [
  query('originLat').optional().isFloat(),
  query('originLng').optional().isFloat(),
  query('destinationLat').optional().isFloat(),
  query('destinationLng').optional().isFloat(),
];

const rideRequestValidator = [
  body('origin').optional(),
  body('destination').optional(),
  body('origin.address').optional().isString(),
  body('destination.address').optional().isString(),
  body('origin.lat').optional().isFloat(),
  body('origin.lng').optional().isFloat(),
  body('destination.lat').optional().isFloat(),
  body('destination.lng').optional().isFloat(),
];

const ratingValidator = [
  body('rating').isInt({ min: 1, max: 5 }),
];

const cancelValidator = [
  body('reason').optional().isString(),
];

module.exports = {
  rideRequestValidator,
  estimateValidator,
 ratingValidator,
  cancelValidator,
  mongoIdParam,
};
