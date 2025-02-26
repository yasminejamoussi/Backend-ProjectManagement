const mongoose = require("mongoose");
const argon2 = require("argon2");

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
      type: String, 
      enum: ["Admin", "Project Manager", "Team Leader", "Team Member", "Guest"], 
      default: "Guest" 
    },
    resetCode: { type: String },  
    resetCodeExpires: { type: Date },
    faceLabel: { type: String },
    isTwoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String }, 
    twoFactorTempSecret: { type: String }, 
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
