const User = require("../models/User");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { exec } = require("child_process");
const util = require("util");

// Promisify exec pour une gestion asynchrone
const execPromise = util.promisify(exec);

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dtn7sr0k5",
  api_key: process.env.CLOUDINARY_API_KEY || "218928741933615",
  api_secret: process.env.CLOUDINARY_API_SECRET || "4Q5w13NQb8CBjfSfgosna0QR7ao",
});

// Cloudinary storage configuration pour les images
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "user_images",
    format: async () => "jpg",
    public_id: (req, file) => Date.now() + "-" + file.originalname,
  },
});

const imageUpload = multer({ storage: imageStorage }).single("image");

// Configuration Multer pour les CV avec memoryStorage
const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("cv");

// 📌 **1. Upload and update profile image**
exports.uploadProfileImage = (req, res) => {
  console.log("📤 Requête reçue pour l'upload d'image");

  imageUpload(req, res, async (err) => {
    if (err) {
      console.error("❌ Erreur Multer :", err);
      return res.status(400).json({ message: "Upload failed", error: err.message });
    }

    if (!req.file) {
      console.warn("⚠️ Aucune image reçue");
      return res.status(400).json({ message: "No image provided" });
    }

    try {
      const userId = req.user.id;
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
    const userId = req.user.id;
    const user = await User.findById(userId)
      .select("-password")
      .populate("role", "name")
      .populate("managedProjects", "name status projectManager startDate endDate")
      .populate({
        path: "assignedTasks",
        select: "title status priority project startDate dueDate assignedTo",
        populate: { path: "project", select: "name" },
      });

    if (!user) return res.status(404).json({ message: "User not found" });

    console.log("User data sent to frontend:", user);
    res.json(user);
  } catch (error) {
    console.error("Error in getUserProfile:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// 📌 **3. Update user profile**
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

// 📌 **4. Upload CV and extract skills**
exports.uploadCV = (req, res) => {
  console.log("📤 Requête reçue pour l'upload de CV");

  cvUpload(req, res, async (err) => {
    if (err) {
      console.error("❌ Erreur Multer :", err);
      return res.status(400).json({ message: "Upload failed", error: err.message });
    }

    if (!req.file) {
      console.warn("⚠️ Aucun CV reçu");
      return res.status(400).json({ message: "No CV provided" });
    }

    try {
      const userId = req.user.id;
      console.log("🔍 Recherche de l'utilisateur avec ID :", userId);
      const user = await User.findById(userId);

      if (!user) {
        console.warn("⚠️ Utilisateur introuvable");
        return res.status(404).json({ message: "User not found" });
      }

      // Extraction du texte du CV
      let cvText = "";
      try {
        console.log("📜 Extraction du texte du CV...");
        const pdfBuffer = req.file.buffer;
        const pdfData = await pdfParse(pdfBuffer);
        cvText = pdfData.text;
        console.log("✅ Texte extrait :", cvText.substring(0, 100) + "...");
      } catch (pdfError) {
        console.error("❌ Erreur lors de l'extraction du texte :", pdfError);
        return res.status(500).json({ message: "Failed to extract text from CV", error: pdfError.message });
      }

      // Upload manuel du fichier sur Cloudinary avec une Promise
      let cvUrl = "";
      try {
        console.log("📤 Upload du CV sur Cloudinary...");
        cvUrl = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: "user_cvs",
              resource_type: "auto",
              public_id: Date.now() + "-" + req.file.originalname,
            },
            (error, result) => {
              if (error) {
                return reject(new Error("Erreur lors de l'upload sur Cloudinary : " + error.message));
              }
              resolve(result.secure_url);
            }
          );
          stream.end(req.file.buffer);
        });
        console.log("✅ CV uploadé sur Cloudinary :", cvUrl);
      } catch (uploadError) {
        console.error("❌ Erreur lors de l'upload sur Cloudinary :", uploadError);
        return res.status(500).json({ message: "Failed to upload CV to Cloudinary", error: uploadError.message });
      }

      // Exécuter le script Python extract_skills.py pour extraire les compétences
      let extractedSkills = [];
      try {
        console.log("🤖 Exécution du script Python pour extraire les compétences...");
        const escapedText = cvText.replace(/"/g, '\\"'); // Échapper les guillemets
        const command = `python scripts/extract_skills.py "${escapedText}"`;
        const { stdout, stderr } = await execPromise(command);

        if (stderr) {
          console.error("❌ Erreur lors de l'exécution du script Python :", stderr);
          throw new Error(stderr);
        }

        const result = JSON.parse(stdout);
        extractedSkills = result.skills || [];
        console.log("✅ Compétences extraites :", extractedSkills);
      } catch (scriptError) {
        console.error("❌ Erreur lors de l'exécution du script Python :", scriptError.message);
        // Fallback : utiliser une liste prédéfinie
        const skillKeywords = ["react", "javascript", "python", "sql", "project management"];
        extractedSkills = skillKeywords.filter((skill) =>
          cvText.toLowerCase().includes(skill.toLowerCase())
        );
        console.log("⚠️ Fallback utilisé, compétences extraites :", extractedSkills);
      }

      // Mise à jour du CV et des compétences
      user.cv = cvUrl;
      user.skills = extractedSkills.length > 0 ? extractedSkills : user.skills;
      await user.save();

      console.log("✔️ CV et compétences mis à jour avec succès !");
      res.json({
        cvUrl: user.cv,
        skills: user.skills,
        message: "CV successfully uploaded and skills extracted",
      });
    } catch (error) {
      console.error("❌ Erreur serveur :", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });
};