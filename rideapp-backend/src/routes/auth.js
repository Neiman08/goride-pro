const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const ctrl = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

const passwordRules = body('password')
  .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
  .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
  .matches(/[0-9]/).withMessage('Password must contain a number');

router.post('/register', [
  body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Name must be 2–60 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  passwordRules,
  body('role').optional().isIn(['passenger', 'driver']).withMessage('Role must be passenger or driver'),
  validate,
], ctrl.register);

router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
  validate,
], ctrl.login);

router.post('/refresh', ctrl.refresh);

// Protected routes
router.use(protect);
router.post('/logout', ctrl.logout);
router.get('/me', ctrl.getMe);
router.patch('/update-profile', ctrl.updateProfile);
router.patch('/change-password', [
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be 8+ characters'),
  validate,
], ctrl.changePassword);

module.exports = router;
