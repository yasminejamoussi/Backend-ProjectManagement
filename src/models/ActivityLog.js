const mongoose = require('mongoose');
const User = require("./User");

const activityLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { 
    type: String, 
    enum: ['CREATE', 'UPDATE', 'DELETE', 'PREDICT_DELAY'], 
    required: true 
  },
  targetType: { 
    type: String, 
    enum: ['PROJECT', 'TASK', 'USER'], 
    required: true 
  },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  message: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed }, 
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('ActivityLog', activityLogSchema);