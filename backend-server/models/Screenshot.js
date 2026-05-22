const mongoose = require('mongoose');

const screenshotSchema = new mongoose.Schema({
    adminId: { type: String, required: true, index: true },
    employeeId: { type: String, required: true, index: true },
    employeeName: { type: String },
    pcName: { type: String },
    image: { type: String, required: true }, // Base64
    takenAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Screenshot', screenshotSchema);
