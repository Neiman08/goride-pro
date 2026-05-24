const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

// Run after express-validator chains — returns 422 with field errors if invalid
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => `${e.path}: ${e.msg}`).join('; ');
    return next(new AppError(`Validation failed: ${messages}`, 422));
  }
  next();
};

module.exports = validate;
