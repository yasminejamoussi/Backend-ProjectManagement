const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true, 
    trim: true,
    maxlength: 100
  },
  description: { 
    type: String, 
    maxlength: 500,
    trim: true
  },
  status: { 
    type: String, 
    enum: ["To Do", "In Progress", "Done", "Review", "Tested"], 
    default: "To Do",
    index: true
  },
  priority: { 
    type: String, 
    enum: ["Low", "Medium", "High", "Urgent"], 
    default: "Medium" 
  },
  project: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Project", 
    required: true,
    index: true
  },
  assignedTo: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: false
  }],
  dueDate: { 
    type: Date, 
    required: false 
  },
  startDate: { 
    type: Date, 
    required: false
  },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true
  },
  importance: { type: Number, default: 0 },
  urgency: { type: Number, default: 0 },
  effort: { type: Number, default: 0 }
}, { timestamps: true });

// Validation personnalisée pour dueDate
taskSchema.pre('save', function(next) {
  if (this.dueDate && this.startDate && this.dueDate < this.startDate) {
    next(new Error("La date d'échéance ne peut pas être antérieure à la date de début."));
  } else {
    next();
  }
});

// Hook avant sauvegarde pour synchroniser assignedTasks
taskSchema.pre('save', async function (next) {
  try {
    const User = mongoose.model('User');
    for (const userId of this.assignedTo) {
      const user = await User.findById(userId);
      if (user && !user.assignedTasks.includes(this._id)) {
        user.assignedTasks.push(this._id);
        await user.save();
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Hook avant suppression pour nettoyer assignedTasks
taskSchema.pre('remove', async function (next) {
  try {
    const User = mongoose.model('User');
    for (const userId of this.assignedTo) {
      const user = await User.findById(userId);
      if (user) {
        user.assignedTasks.pull(this._id);
        await user.save();
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("Task", taskSchema);