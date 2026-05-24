// Wraps async route handlers so unhandled rejections go to Express error middleware
const catchAsync = (fn) => (req, res, next) => fn(req, res, next).catch(next);
module.exports = catchAsync;
