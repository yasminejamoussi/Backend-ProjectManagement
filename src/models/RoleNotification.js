const mongoose = require('mongoose');

const roleNotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notificationType: { type: String, required: true, enum: ['role_assignment'] },
  message: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('RoleNotification', roleNotificationSchema);