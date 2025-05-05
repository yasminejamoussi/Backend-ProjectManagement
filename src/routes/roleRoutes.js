const express = require("express");
const { getRoles, createRole, updateRole, deleteRole,assignRoleToUser,initializeRoles } = require("../controllers/roleController");
const { validateRoleData } = require("../middleware/validateRole");
const { checkRole } = require("../middleware/roleMiddleware");
const router = express.Router();
initializeRoles();

// Route pour obtenir la liste des rôles
router.get("/", getRoles);

// Route pour créer un rôle
//router.post("/", checkRole(['Admin']), validateRoleData, createRole);
router.post("/", createRole);

// Route pour mettre à jour un rôle
router.put("/:roleId", checkRole(['Admin']), updateRole);

// Route pour supprimer un rôle
router.delete("/:roleId", checkRole(['Admin']), deleteRole);

router.post('/assign-user', assignRoleToUser);

module.exports = router;