const Role = require("../models/Role");
const User = require("../models/User"); 
const mongoose = require("mongoose"); // Ajoute cette ligne
const roles = [
  { name: "Admin", permissions: ["create", "read", "update", "delete"] },
  { name: "Project Manager", permissions: ["create", "read", "update"] },
  { name: "Team Leader", permissions: ["read", "update"] },
  { name: "Team Member", permissions: ["read"] },
  { name: "Guest", permissions: [] },
];

// Fonction pour initialiser les rôles
/*exports.initializeRoles = async () => {
  try {
    for (const roleData of roles) {
      await Role.findOneAndUpdate(
        { name: roleData.name }, 
        roleData, 
        { upsert: true, new: true } 
      );
    }
    console.log("Rôles initialisés avec succès");
  } catch (error) {
    console.error("Erreur lors de l'initialisation des rôles :", error);
  }
};*/

exports.initializeRoles = async () => {
  if (mongoose.connection.readyState !== 1) {
      throw new Error("Impossible de se connecter à MongoDB pour initialiser les rôles.");
  }
  try {
      for (const roleData of roles) {
          await Role.findOneAndUpdate(
              { name: roleData.name },
              roleData,
              { upsert: true, new: true }
          );
      }
      console.log("Rôles initialisés avec succès");
  } catch (error) {
      console.error("Erreur lors de l'initialisation des rôles :", error);
      throw error;
  }
};
// Récupérer tous les rôles
exports.getRoles = async (req, res) => {
  try {
    console.log("Fetching roles...");

    const roles = await Role.find().populate('users', 'firstname lastname -_id');
    console.log('Fetched roles:', roles);  // Log the roles to see if they are fetched correctly
    
    if (!roles || roles.length === 0) {
      return res.status(404).json({ message: "Aucun rôle trouvé" });
    }

    res.status(200).json(roles);
  } catch (error) {
    console.error("Erreur lors de la récupération des rôles:", error);
    res.status(500).json({ message: "Erreur serveur lors de la récupération des rôles." });
  }
};

// Créer un rôle
/*exports.createRole = async (req, res) => {
  const { name, permissions } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ message: "Le nom du rôle est requis." });
  }

  console.log("Création du rôle avec ces données :", { name, permissions });

  try {
    const newRole = new Role({
      name: name,
      permissions: permissions || [],
    });

    await newRole.save();
    res.status(201).json({ message: "Rôle créé avec succès", role: newRole });
  } catch (error) {
    console.error("Erreur lors de la création du rôle:", error);
    res.status(500).json({ message: "Erreur serveur lors de la création du rôle", error: error.message });
  }
};*/

exports.createRole = async (req, res) => {
  const { name, permissions } = req.body;

  if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Le nom du rôle est requis." });
  }

  const validPermissions = ["create", "read", "update", "delete"]; // Liste des permissions valides
  if (permissions && !permissions.every(p => validPermissions.includes(p))) {
      return res.status(400).json({ message: "Permissions invalides" });
  }

  try {
      const existingRole = await Role.findOne({ name });
      if (existingRole) {
          return res.status(400).json({ message: "Un rôle avec ce nom existe déjà." });
      }

      const newRole = new Role({ name, permissions: permissions || [] });
      await newRole.save();
      res.status(201).json({ message: "Rôle créé avec succès", role: newRole });
  } catch (error) {
      res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

// Mettre à jour un rôle
/*exports.updateRole = async (req, res) => {
  const { roleId } = req.params;
  const { name, permissions } = req.body;

  try {
    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ message: "Rôle non trouvé" });
    }

    role.name = name || role.name;
    role.permissions = permissions || role.permissions;

    await role.save();
    res.status(200).json({ message: "Rôle mis à jour avec succès", role });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};*/

exports.updateRole = async (req, res) => {
  const { roleId } = req.params;
  const { name, permissions } = req.body;

  if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return res.status(400).json({ message: "ID de rôle invalide" });
  }

  try {
      const role = await Role.findById(roleId);
      if (!role) {
          return res.status(404).json({ message: "Rôle non trouvé" });
      }

      role.name = name || role.name;
      role.permissions = permissions || role.permissions;
      await role.save();
      res.status(200).json({ message: "Rôle mis à jour avec succès", role });
  } catch (error) {
      res.status(500).json({ message: error.message });
  }
};
// Supprimer un rôle
exports.deleteRole = async (req, res) => {
  const { roleId } = req.params;

  try {
    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ message: "Rôle non trouvé" });
    }

    // Retirer ce rôle de tous les utilisateurs qui l'ont
    await User.updateMany({ role: roleId }, { role: null });

    await Role.findByIdAndDelete(roleId);

    res.status(200).json({ message: "Rôle supprimé avec succès" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.assignRoleToUser = async (req, res) => {
  const { roleName, userId } = req.body; 

  try {
    // 🔍 Trouver le rôle par son nom pour récupérer son ID
    const role = await Role.findOne({ name: roleName });
    if (!role) {
      return res.status(404).json({ message: "Rôle non trouvé" });
    }

    // 🔍 Trouver l'utilisateur
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // Retirer l'utilisateur de son ancien rôle s'il en a un
    if (user.role) {
      const oldRole = await Role.findById(user.role);
      if (oldRole) {
        oldRole.users = oldRole.users.filter(id => id.toString() !== userId.toString());
        await oldRole.save();
      }
    }

    // ✅ Mettre à jour `user.role` avec l'ObjectId du rôle
    user.role = role._id;
    await user.save();

    // ✅ Ajouter l'utilisateur dans le tableau `users` du rôle
    if (!role.users.includes(userId)) {
      role.users.push(userId);
      await role.save();
    }

    res.status(200).json({ message: "Rôle attribué avec succès", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};