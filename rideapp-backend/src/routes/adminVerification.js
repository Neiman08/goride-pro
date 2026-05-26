const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/adminVerificationController');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect, restrictTo('admin'));

router.get('/drivers',                        ctrl.listDrivers);
router.get('/drivers/pending',                ctrl.getPendingDrivers);
router.get('/drivers/:driverId/documents',    ctrl.getDriverDocuments);
router.post('/drivers/:driverId/approve',     ctrl.approveDriver);
router.post('/drivers/:driverId/reject',      ctrl.rejectDriver);
router.post('/drivers/:driverId/suspend',     ctrl.suspendDriver);
router.post('/drivers/:driverId/unsuspend',   ctrl.unsuspendDriver);

module.exports = router;
