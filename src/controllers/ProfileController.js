const User = require("../models/User");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");

// Cloudinary configuration
cloudinary.config({
  cloud_name: "dtn7sr0k5",
  api_key: "218928741933615",
  api_secret: "4Q5w13NQb8CBjfSfgosna0QR7ao",
});

// Cloudinary storage configuration
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "user_images",
    format: async () => "jpg",
    public_id: (req, file) => Date.now() + "-" + file.originalname,
  },
});

const upload = multer({ storage }).single("image");

// 📌 **1. Upload and update profile image**
exports.uploadProfileImage = (req, res) => {
  console.log("📤 Requête reçue pour l'upload d'image");

  upload(req, res, async (err) => {
    if (err) {
      console.error("❌ Erreur Multer :", err);
      return res.status(400).json({ message: "Upload failed", error: err.message });
    }

    if (!req.file) {
      console.warn("⚠️ Aucune image reçue");
      return res.status(400).json({ message: "No image provided" });
    }

    try {
      // Utiliser l'utilisateur à partir du middleware (il est dans req.user)
      const userId = req.user.id;  // Accède à l'ID utilisateur à partir de req.user
      console.log("🔍 Recherche de l'utilisateur avec ID :", userId);
      const user = await User.findById(userId);

      if (!user) {
        console.warn("⚠️ Utilisateur introuvable");
        return res.status(404).json({ message: "User not found" });
      }

      console.log("✅ Image bien uploadée sur Cloudinary :", req.file.path);
      user.profileImage = req.file.path;
      await user.save();

      console.log("✔️ Profil mis à jour avec succès !");
      res.json({ imageUrl: req.file.path, message: "Image successfully updated" });

    } catch (error) {
      console.error("❌ Erreur serveur :", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });
};

// 📌 **2. Get user profile info**
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;  // Utilise l'ID de l'utilisateur extrait du token
    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
exports.updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { firstname, lastname, phone } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.firstname = firstname || user.firstname;
    user.lastname = lastname || user.lastname;
    user.phone = phone || user.phone;

    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
