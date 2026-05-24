const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

// Handle specific Mongoose/JWT errors by converting to AppError
const handleCastError = (err) => new AppError(`Invalid ${err.path}: ${err.value}`, 400);
const handleDuplicateKey = (err) => {
  const field = Object.keys(err.keyValue)[0];
  return new AppError(`${field} already in use.`, 400);
};
const handleValidationError = (err) => {
  const messages = Object.values(err.errors).map((e) => e.message).join('; ');
  return new AppError(`Validation error: ${messages}`, 400);
};
const handleJWTError = () => new AppError('Invalid token. Please log in again.', 401);
const handleJWTExpired = () => new AppError('Token expired. Please log in again.', 401);

const errorHandler = (err, req, res, next) => {
  let error = { ...err, message: err.message, stack: err.stack };

  // Convert known error types
  if (err.name === 'CastError') error = handleCastError(err);
  if (err.code === 11000) error = handleDuplicateKey(err);
  if (err.name === 'ValidationError') error = handleValidationError(err);
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpired();

  const statusCode = error.statusCode || 500;
  const status = error.status || 'error';

  // Log server errors
  if (statusCode >= 500) {
    logger.error(err.message, { stack: err.stack, url: req.originalUrl, method: req.method });
  }

  res.status(statusCode).json({
    status,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
};

module.exports = errorHandler;
