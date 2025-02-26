const Role = require("../models/Role"); // Assure-toi que le chemin est correct

// Récupérer tous les rôles
exports.getRoles = async (req, res) => {
  try {
    const roles = await Role.find()
      .populate('users', 'firstname lastname')  // Peupler les utilisateurs avec leurs prénom et nom
      .exec();

    // Si aucun rôle n'est trouvé
    if (!roles) {
      return res.status(404).json({ message: 'Aucun rôle trouvé' });
    }

    res.json(roles);
  } catch (error) {
    console.error("Erreur lors de la récupération des rôles:", error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des rôles.' });
  }
};


// Créer un rôle
exports.createRole = async (req, res) => {
  const { name, permissions, users } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ message: "Le nom du rôle est requis." });
  }

  console.log("Création du rôle avec ces données :", { name, permissions, users });

  try {
    const newRole = new Role({
      name: name,
      permissions: permissions || [],
      users: users || [],
    });

    await newRole.save();
    res.status(201).json({ message: "Rôle créé avec succès", role: newRole });
  } catch (error) {
    console.error("Erreur lors de la création du rôle:", error);
    res.status(500).json({ message: "Erreur serveur lors de la création du rôle", error: error.message });
  }
};



// Mettre à jour un rôle
exports.updateRole = async (req, res) => {
  const { name, permissions, users } = req.body;
  try {
    const updatedRole = await Role.findByIdAndUpdate(req.params.id, { name, permissions, users }, { new: true });
    res.json(updatedRole);
  } catch (error) {
    res.status(400).json({ message: "Impossible de modifier le rôle" });
  }
};

// Supprimer un rôle
exports.deleteRole = async (req, res) => {
  try {
    await Role.findByIdAndDelete(req.params.id);
    res.json({ message: "Rôle supprimé avec succès" });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la suppression" });
  }
};
