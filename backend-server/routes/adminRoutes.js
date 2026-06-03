const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authenticate = require('../middleware/authMiddleware');

router.post('/create', authenticate, adminController.createAdmin);
router.get('/list', authenticate, adminController.listAdmins);
router.get('/password-logs', authenticate, adminController.getPasswordLogs);
router.patch('/:id/toggle-status', authenticate, adminController.toggleStatus);
router.patch('/:id/extend-expiry', authenticate, adminController.extendExpiry);
router.put('/:id', authenticate, adminController.updateAdmin);
router.delete('/:id', authenticate, adminController.deleteAdmin);

module.exports = router;
