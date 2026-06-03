const mongoose = require('mongoose');

const keylogSchema = new mongoose.Schema({
    adminId: { type: String, required: true },
    employeeId: { type: String, required: true },
    employeeName: { type: String, default: 'Unknown' },
    pcName: { type: String, default: 'Unknown' },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

// Auto-delete keylogs after 7 days
keylogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('Keylog', keylogSchema);
