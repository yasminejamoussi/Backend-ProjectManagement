const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const profileController = require("../controllers/ProfileController"); // Vérifie bien ce chemin !
const { uploadProfileImage, getUserProfile, updateUserProfile } = require("../controllers/ProfileController");

// Vérification temporaire pour voir si le controller est bien chargé
console.log("🔎 ProfileController:", profileController);

// Route pour récupérer les informations de l'utilisateur
router.get("/",authMiddleware,getUserProfile);

// Route pour uploader l'image de profil
router.post("/upload", authMiddleware, uploadProfileImage);

// Route pour mettre à jour le profil de l'utilisateur connecté
router.put("/update", authMiddleware, updateUserProfile);

router.post("/upload-cv", authMiddleware, profileController.uploadCV);

module.exports = router;
