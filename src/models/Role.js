const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  permissions: {
    type: [String],
    default: []
  },
  users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',  // Assurez-vous que le modèle 'User' est correctement référencé
  }]
});

const Role = mongoose.model('Role', roleSchema);
module.exports = Role;
