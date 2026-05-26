const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/driverRegistrationController');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { body } = require('express-validator');

// ── Step 1: Register ──────────────────────────────────────────────────────
router.post('/register', [
  body('firstName').trim().isLength({ min: 2, max: 50 }).withMessage('First name required'),
  body('lastName').trim().isLength({ min: 2, max: 50 }).withMessage('Last name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password min 8 characters')
    .matches(/[A-Z]/).withMessage('Password needs uppercase letter')
    .matches(/[0-9]/).withMessage('Password needs a number')
    .matches(/[^a-zA-Z0-9]/).withMessage('Password needs special character'),
  body('phone').matches(/^\+?[\d\s\-().]{7,20}$/).withMessage('Valid phone required'),
  body('dateOfBirth').notEmpty().withMessage('Date of birth required'),
  body('ssn').optional().matches(/^\d{9}$/).withMessage('SSN must be 9 digits'),
  validate,
], ctrl.registerStep1);

// ── All following steps require authentication ────────────────────────────
router.use(protect, restrictTo('driver'));

router.post('/verify-phone',       ctrl.verifyPhone);
router.post('/resend-otp',         ctrl.resendOTP);
router.post('/upload-license',     ctrl.uploadLicense);
router.post('/upload-selfie',      ctrl.uploadSelfie);
router.post('/upload-insurance',   ctrl.uploadInsurance);
router.post('/upload-registration', ctrl.uploadRegistration);
router.post('/add-vehicle',        ctrl.addVehicle);
router.post('/sign-terms',         ctrl.signTerms);
router.get('/status',              ctrl.getStatus);

module.exports = router;
