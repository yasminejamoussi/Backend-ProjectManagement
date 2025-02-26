const mongoose = require('mongoose');

const loginAttemptSchema = new mongoose.Schema({
    email: { type: String, required: true },
    ip: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    success: { type: Boolean, required: true },
    anomaly: { type: Boolean, default: false }
});

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);