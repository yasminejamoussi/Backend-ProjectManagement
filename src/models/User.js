const mongoose = require("mongoose");
const argon2 = require("argon2");
const Role = require("./Role");

const UserSchema = new mongoose.Schema(
  {
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { 
      type: String, 
      required: function () { return !this.googleId; } 
    },
    googleId: { type: String, required: false },
    facebookId: String,
    githubId: String,
    role: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Role',
      default: async () => {
        const guestRole = await Role.findOne({ name: 'Guest' });
        return guestRole ? guestRole._id : null;
      } 
    },
    resetCode: { type: String },
    resetCodeExpires: { type: Date },
    faceLabel: { type: String },
    isTwoFactorEnabled: { type: Boolean, default: true },
    twoFactorSecret: { type: String },
    twoFactorTempSecret: { type: String },
    profileImage: { type: String, default: "" },
    cv: { type: String, default: "" }, // Nouveau champ pour l'URL du CV
    skills: [{ type: String, default: [] }], // Nouveau champ pour les compétences
    managedProjects: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Project", 
      default: [] 
    }],
    assignedTasks: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Task", 
      default: [] 
    }]
  },
  { timestamps: true }
);

// Hashage du mot de passe avec Argon2 avant de sauvegarder
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await argon2.hash(this.password);
  next();
});

module.exports = mongoose.model("User", UserSchema);