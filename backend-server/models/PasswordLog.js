const mongoose = require('mongoose');

const passwordLogSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: { type: String, required: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    changedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PasswordLog', passwordLogSchema);
