const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ["Admin", "Project Manager", "Team Leader", "Team Member", "Guest"], 
  },
  permissions: {
    type: [String],
    default: []
  },
  users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',  
  }]
});

const Role = mongoose.model('Role', roleSchema);
module.exports = Role;
