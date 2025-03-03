const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true, 
    trim: true,
    maxlength: 100 // Limite raisonnable pour un titre
  },
  description: { 
    type: String, 
    maxlength: 500,
    trim: true // Ajout de trim pour cohérence
  },
  status: { 
    type: String, 
    enum: ["To Do", "In Progress", "Done", "Review", "Tested"], 
    default: "To Do",
    index: true // Index pour filtrer rapidement par statut
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
    index: true // Index pour filtrer par projet
  },
  assignedTo: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: false // Tableau pour plusieurs assignés, optionnel
  }],
  dueDate: { 
    type: Date, 
    required: false 
  },
  startDate: { 
    type: Date, 
    required: false // Optionnel, pas de Date.now par défaut
  },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true // Qui a créé la tâche
  }
}, { timestamps: true });

// Validation personnalisée pour dueDate
taskSchema.pre('save', function(next) {
  if (this.dueDate && this.startDate && this.dueDate < this.startDate) {
    next(new Error("La date d'échéance ne peut pas être antérieure à la date de début."));
  } else {
    next();
  }
});

module.exports = mongoose.model("Task", taskSchema);