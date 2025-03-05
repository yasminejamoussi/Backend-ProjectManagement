const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, maxlength: 500 },
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
        return value >= this.startDate;
      },
      message: "End date must be after start date."
    }
  },
  deliverables: { type: [String], default: [] },
  projectManager: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  teamMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }]
}, { timestamps: true });

// Hook avant sauvegarde pour synchroniser managedProjects
projectSchema.pre('save', async function (next) {
  try {
    const User = mongoose.model('User');
    // Synchroniser projectManager
    const projectManager = await User.findById(this.projectManager);
    if (projectManager && !projectManager.managedProjects.includes(this._id)) {
      projectManager.managedProjects.push(this._id);
      await projectManager.save();
    }

    // Synchroniser teamMembers (optionnel, si vous voulez aussi suivre les projets des membres)
    for (const memberId of this.teamMembers) {
      const member = await User.findById(memberId);
      if (member && !member.managedProjects.includes(this._id) && member._id.toString() !== this.projectManager.toString()) {
        member.managedProjects.push(this._id);
        await member.save();
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Hook avant suppression pour nettoyer managedProjects
projectSchema.pre('remove', async function (next) {
  try {
    const User = mongoose.model('User');
    // Retirer le projet de projectManager
    const projectManager = await User.findById(this.projectManager);
    if (projectManager) {
      projectManager.managedProjects.pull(this._id);
      await projectManager.save();
    }

    // Retirer le projet des teamMembers
    for (const memberId of this.teamMembers) {
      const member = await User.findById(memberId);
      if (member) {
        member.managedProjects.pull(this._id);
        await member.save();
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("Project", projectSchema);