const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, maxlength: 500 }, // Limite de caractères pour éviter les descriptions trop longues
  objectives: { type: [String], default: [] },
  status: { 
    type: String, 
    enum: ["Pending", "In Progress", "Completed"], 
    default: "Pending" 
  },
  startDate: { type: Date, required: true },
  endDate: { 
    type: Date, 
    required: true,
    validate: {
      validator: function(value) {
        return value >= this.startDate; // Vérifie que l'endDate est après startDate
      },
      message: "End date must be after start date."
    }
  },
  deliverables: { type: [String], default: [] },
  projectManager: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Remplace owner par projectManager
  teamMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });

module.exports = mongoose.model("Project", projectSchema);
