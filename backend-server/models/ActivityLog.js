const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    adminId: { type: String, required: true, index: true },
    employeeId: { type: String, required: true },
    employeeName: { type: String, default: 'Unknown' },
    pcName: { type: String, default: 'Unknown' },
    event: { 
        type: String, 
        enum: [
            'connected', 'disconnected',
            'idle_start', 'idle_end',
            'screenshot_taken',
            'pc_locked',
            'website_blocked',
            'keylog_session',
            'alert_triggered',
            'monitor_switched',
            'message_sent'
        ],
        required: true 
    },
    detail: { type: String, default: '' }, // Extra info (e.g. "Idle 18 min", "facebook.com blocked")
    timestamp: { type: Date, default: Date.now, index: true }
});

// Auto-delete logs older than 30 days
activityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
