const Role = require("../models/Role");
const User = require("../models/User");
const mongoose = require("mongoose");

const roles = [
    { name: "Admin", permissions: ["create", "read", "update", "delete"] },
    { name: "Project Manager", permissions: ["create", "read", "update"] },
    { name: "Team Leader", permissions: ["read", "update"] },
    { name: "Team Member", permissions: ["read"] },
    { name: "Guest", permissions: [] },
];

// Liste des permissions valides
const VALID_PERMISSIONS = ["create", "read", "update", "delete"];

// Fonction pour initialiser les rôles
exports.initializeRoles = async () => {
    try {
        // Attendre que la connexion MongoDB soit prête
        let attempts = 0;
        const maxAttempts = 10;
        while (mongoose.connection.readyState !== 1 && attempts < maxAttempts) {
            console.log(`🔄 Tentative ${attempts + 1} d'attente de la connexion MongoDB...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            attempts++;
        }

        if (mongoose.connection.readyState !== 1) {
            throw new Error("❌ Impossible de se connecter à MongoDB pour initialiser les rôles.");
        }

        console.log("📢 Initialisation des rôles...");
        for (const roleData of roles) {
            // Valider les permissions
            const invalidPermissions = roleData.permissions.filter(perm => !VALID_PERMISSIONS.includes(perm));
            if (invalidPermissions.length > 0) {
                throw new Error(`❌ Permissions invalides pour le rôle ${roleData.name}: ${invalidPermissions.join(", ")}`);
            }

            await Role.findOneAndUpdate(
                { name: roleData.name },
                roleData,
                { upsert: true, new: true }
            );
            console.log(`📢 Rôle ${roleData.name} initialisé.`);
        }
        console.log("✅ Rôles initialisés avec succès");
    } catch (error) {
        console.error("❌ Erreur lors de l'initialisation des rôles:", error);
        throw error; // Propager l'erreur pour arrêter l'application
    }
};

// Récupérer tous les rôles
exports.getRoles = async (req, res) => {
    try {
        console.log("📢 Récupération des rôles...");
        const roles = await Role.find().populate('users', 'firstname lastname -_id');
        if (!roles || roles.length === 0) {
            console.log("❌ Aucun rôle trouvé.");
            return res.status(404).json({ message: "Aucun rôle trouvé" });
        }

        console.log(`📢 ${roles.length} rôles récupérés.`);
        res.status(200).json(roles);
    } catch (error) {
        console.error("❌ Erreur lors de la récupération des rôles:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des rôles", error: error.message });
    }
};

// Créer un rôle
exports.createRole = async (req, res) => {
    const { name, permissions } = req.body;

    if (!name || name.trim() === "") {
        console.log("❌ Le nom du rôle est requis.");
        return res.status(400).json({ message: "Le nom du rôle est requis." });
    }

    try {
        // Vérifier si le nom du rôle existe déjà
        const existingRole = await Role.findOne({ name });
        if (existingRole) {
            console.log(`❌ Le rôle ${name} existe déjà.`);
            return res.status(400).json({ message: "Un rôle avec ce nom existe déjà." });
        }

        // Valider les permissions
        if (permissions) {
            const invalidPermissions = permissions.filter(perm => !VALID_PERMISSIONS.includes(perm));
            if (invalidPermissions.length > 0) {
                console.log(`❌ Permissions invalides: ${invalidPermissions.join(", ")}`);
                return res.status(400).json({ message: `Permissions invalides: ${invalidPermissions.join(", ")}` });
            }
        }

        console.log("📢 Création du rôle avec ces données:", { name, permissions });
        const newRole = new Role({
            name,
            permissions: permissions || [],
        });

        await newRole.save();
        console.log("📢 Rôle créé:", newRole);
        res.status(201).json({ message: "Rôle créé avec succès", role: newRole });
    } catch (error) {
        console.error("❌ Erreur lors de la création du rôle:", error);
        res.status(500).json({ message: "Erreur serveur lors de la création du rôle", error: error.message });
    }
};

// Mettre à jour un rôle
exports.updateRole = async (req, res) => {
    const { roleId } = req.params;
    const { name, permissions } = req.body;

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
        console.log("❌ ID de rôle invalide:", roleId);
        return res.status(400).json({ message: "ID de rôle invalide" });
    }

    try {
        console.log("📢 Mise à jour du rôle avec ID:", roleId);
        const role = await Role.findById(roleId);
        if (!role) {
            console.log("❌ Rôle non trouvé avec ID:", roleId);
            return res.status(404).json({ message: "Rôle non trouvé" });
        }

        if (name && name.trim() === "") {
            console.log("❌ Le nom du rôle ne peut pas être vide.");
            return res.status(400).json({ message: "Le nom du rôle ne peut pas être vide." });
        }

        if (name && name !== role.name) {
            const existingRole = await Role.findOne({ name });
            if (existingRole) {
                console.log(`❌ Le rôle ${name} existe déjà.`);
                return res.status(400).json({ message: "Un rôle avec ce nom existe déjà." });
            }
        }

        if (permissions) {
            const invalidPermissions = permissions.filter(perm => !VALID_PERMISSIONS.includes(perm));
            if (invalidPermissions.length > 0) {
                console.log(`❌ Permissions invalides: ${invalidPermissions.join(", ")}`);
                return res.status(400).json({ message: `Permissions invalides: ${invalidPermissions.join(", ")}` });
            }
        }

        role.name = name || role.name;
        role.permissions = permissions || role.permissions;

        await role.save();
        console.log("📢 Rôle mis à jour:", role);
        res.status(200).json({ message: "Rôle mis à jour avec succès", role });
    } catch (error) {
        console.error("❌ Erreur lors de la mise à jour du rôle:", error);
        res.status(500).json({ message: "Erreur serveur lors de la mise à jour du rôle", error: error.message });
    }
};

// Supprimer un rôle
exports.deleteRole = async (req, res) => {
    const { roleId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
        console.log("❌ ID de rôle invalide:", roleId);
        return res.status(400).json({ message: "ID de rôle invalide" });
    }

    try {
        console.log("📢 Suppression du rôle avec ID:", roleId);
        const role = await Role.findById(roleId);
        if (!role) {
            console.log("❌ Rôle non trouvé avec ID:", roleId);
            return res.status(404).json({ message: "Rôle non trouvé" });
        }

        // Vérifier si le rôle est "Guest" (on ne veut pas le supprimer)
        if (role.name === "Guest") {
            console.log("❌ Le rôle Guest ne peut pas être supprimé.");
            return res.status(400).json({ message: "Le rôle Guest ne peut pas être supprimé." });
        }

        // Trouver le rôle "Guest" pour l'assigner par défaut
        const guestRole = await Role.findOne({ name: "Guest" });
        if (!guestRole) {
            console.log("❌ Rôle Guest non trouvé pour réassignation.");
            return res.status(500).json({ message: "Erreur serveur: Rôle Guest non trouvé." });
        }

        // Réassigner les utilisateurs à un rôle par défaut (Guest)
        await User.updateMany({ role: roleId }, { role: guestRole._id });
        console.log("📢 Utilisateurs réassignés au rôle Guest.");

        await Role.findByIdAndDelete(roleId);
        console.log("📢 Rôle supprimé:", roleId);

        res.status(200).json({ message: "Rôle supprimé avec succès" });
    } catch (error) {
        console.error("❌ Erreur lors de la suppression du rôle:", error);
        res.status(500).json({ message: "Erreur serveur lors de la suppression du rôle", error: error.message });
    }
};

// Assigner un rôle à un utilisateur
exports.assignRoleToUser = async (req, res) => {
    const { roleId, userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
        console.log("❌ ID de rôle invalide:", roleId);
        return res.status(400).json({ message: "ID de rôle invalide" });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.log("❌ ID d'utilisateur invalide:", userId);
        return res.status(400).json({ message: "ID d'utilisateur invalide" });
    }

    try {
        console.log("📢 Assignation du rôle", roleId, "à l'utilisateur", userId);
        const role = await Role.findById(roleId);
        if (!role) {
            console.log("❌ Rôle non trouvé avec ID:", roleId);
            return res.status(404).json({ message: "Rôle non trouvé" });
        }

        const user = await User.findById(userId);
        if (!user) {
            console.log("❌ Utilisateur non trouvé avec ID:", userId);
            return res.status(404).json({ message: "Utilisateur non trouvé" });
        }

        // Retirer l'utilisateur de son ancien rôle
        if (user.role && user.role.toString() !== roleId.toString()) {
            const oldRole = await Role.findById(user.role);
            if (oldRole) {
                oldRole.users = oldRole.users.filter(id => id.toString() !== userId.toString());
                await oldRole.save();
                console.log("📢 Utilisateur retiré de l'ancien rôle:", oldRole.name);
            }
        }

        user.role = role._id;
        await user.save();
        console.log("📢 Rôle assigné à l'utilisateur:", user.email);

        if (!role.users.includes(userId)) {
            role.users.push(userId);
            await role.save();
            console.log("📢 Utilisateur ajouté au rôle:", role.name);
        }

        res.status(200).json({ message: "Rôle attribué avec succès", user });
    } catch (error) {
        console.error("❌ Erreur lors de l'assignation du rôle:", error);
        res.status(500).json({ message: "Erreur serveur lors de l'assignation du rôle", error: error.message });
    }
};