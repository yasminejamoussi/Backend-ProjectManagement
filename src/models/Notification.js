const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notificationType: { type: String, required: true, enum: ['project', 'task', 'ANOMALY','role_assignment'] }, // Adjusted to match your types
  message: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, refPath: 'notificationType' }, // Reference to project or task
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Notification', notificationSchema);