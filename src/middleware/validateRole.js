const User = require("../models/User");

const VALID_ROLES = ["Admin", "Project Manager", "Team Leader", "Team Member", "Guest"];

exports.validateRoleData = async (req, res, next) => {
  const { name, users } = req.body;

  // Vérifier si le rôle est valide
  if (!VALID_ROLES.includes(name)) {
    return res.status(400).json({ message: "Rôle non valide." });
  }

  // Vérifier si les utilisateurs existent
  const existingUsers = await User.find({ _id: { $in: users } });
  if (existingUsers.length !== users.length) {
    return res.status(400).json({ message: "Un ou plusieurs utilisateurs n'existent pas." });
  }

  next();
};
