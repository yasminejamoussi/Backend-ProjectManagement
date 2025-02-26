const express = require("express");
const { getRoles, createRole, updateRole, deleteRole } = require("../controllers/roleController");
const { validateRoleData } = require("../middleware/validateRole");
const { checkRole } = require("../middleware/roleMiddleware");
const router = express.Router();

// Route pour obtenir la liste des rôles
router.get("/", checkRole(['Admin', 'Team Leader', 'Project Manager']), getRoles);

// Route pour créer un rôle
router.post("/", checkRole(['Admin']), validateRoleData, createRole);

// Route pour mettre à jour un rôle
router.put("/:id", checkRole(['Admin']), updateRole);

// Route pour supprimer un rôle
router.delete("/:id", checkRole(['Admin']), deleteRole);

module.exports = router;