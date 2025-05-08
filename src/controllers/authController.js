const User = require("../models/User");
const argon2 = require('argon2'); 
const jwt = require("jsonwebtoken");
const axios = require('axios');
const { oauth2Client } = require('../utils/googleClient');  // Assuming oauth2Client is set up
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const LoginAttempt = require('../models/LoginAttempt');
const { spawn } = require("child_process");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const Role = require('../models/Role'); // Assure-toi d'importer le modèle de rôle
const path = require("path");
const Project = require('../models/Project'); 
const Task = require('../models/Task');

// Fonction pour générer un mot de passe fort
exports.generateStrongPassword = (req, res) => {
    console.log("Démarrage de la génération du mot de passe...");

    // Définition du chemin vers le script Python
    const scriptPath = path.join(__dirname, "..", "scripts", "generate_password.py");
    console.log("Chemin vers le script Python:", scriptPath);  // Log pour vérifier le chemin du script

    const pythonProcess = spawn("python", [scriptPath, "16"]); // Longueur du mot de passe : 16 caractères
    let password = "";

    // Gérer la sortie standard
    pythonProcess.stdout.on("data", (data) => {
        console.log("Sortie du processus Python:", data.toString());
        password += data.toString();
    });

    // Gérer les erreurs
    pythonProcess.stderr.on("data", (data) => {
        console.error("Erreur dans le processus Python:", data.toString());
        return res.status(500).json({ error:`Erreur Python : ${data.toString()}`  });
    });

    // Lorsque le processus Python se termine
    pythonProcess.on("close", (code) => {
        if (code === 0) {
            console.log("Mot de passe généré :", password.trim());
            res.json({ password: password.trim() }); // Répondre avec le mot de passe généré
        } else {
            return res.status(500).json({ error: ` Le processus Python s'est terminé avec le code ${code} ` });
        }
    });
};

// Générer le QR Code pour 2FA
exports.generate2FA = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email requis." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé." });
    }

    // Générer un nouveau secret TOTP
    const secret = speakeasy.generateSecret({ length: 20 });
    const otpAuthUrl = `otpauth://totp/MyApp:${email}?secret=${secret.base32}&issuer=MyApp`;

    // Stocker temporairement le secret et s'assurer que l'ancien est effacé
    user.twoFactorTempSecret = secret.base32;
    user.twoFactorSecret = null; // S'assurer que l'ancien secret permanent est effacé
    await user.save();

    // Générer le QR Code
    QRCode.toDataURL(otpAuthUrl, (err, qrCodeDataUrl) => {
      if (err) {
        return res.status(500).json({ message: "Erreur lors de la génération du QR Code" });
      }
      res.json({ qrCode: qrCodeDataUrl, secret: secret.base32 });
    });
  } catch (error) {
    console.error("Erreur lors de la génération du 2FA:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};
// Activer le 2FA après validation du code
exports.enable2FA = async (req, res) => {
  try {
    const { email, token } = req.body;
    if (!email || !token) {
      return res.status(400).json({ message: "Email et code requis." });
    }

    const user = await User.findOne({ email });
    if (!user || !user.twoFactorTempSecret) {
      return res.status(400).json({ message: "Aucun 2FA temporaire trouvé." });
    }

    // Vérifier le code entré
    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorTempSecret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (!isValid) {
      return res.status(400).json({ message: "Code de vérification invalide." });
    }

    // Activer définitivement le 2FA
    user.twoFactorSecret = user.twoFactorTempSecret;
    user.isTwoFactorEnabled = true;
    user.twoFactorTempSecret = null;
    await user.save();

    res.json({ message: "2FA activé avec succès !" });
  } catch (error) {
    console.error("Erreur lors de l'activation du 2FA:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// Désactiver le 2FA
exports.disable2FA = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email requis." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé." });
    }

    // Réinitialiser tous les champs liés au 2FA
    user.isTwoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.twoFactorTempSecret = null;
    await user.save();

    res.json({ message: "2FA désactivé avec succès !" });
  } catch (error) {
    console.error("Erreur lors de la désactivation du 2FA:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// Vérifier le 2FA à la connexion
exports.verify2FA = async (req, res) => {
  try {
    const { email, token } = req.body;
    if (!email || !token) {
      return res.status(400).json({ message: "Email et code requis." });
    }

    const user = await User.findOne({ email }).populate("role");
    if (!user || !user.isTwoFactorEnabled) {
      return res.status(400).json({ message: "2FA non activé pour cet utilisateur." });
    }

    // Vérifier le code TOTP
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ message: "Code de vérification invalide." });
    }

    // Générer un token JWT après validation
    const authToken = jwt.sign(
      { id: user._id, role: user.role.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({ message: "Authentification réussie", token: authToken });
  } catch (error) {
    console.error("Erreur lors de la vérification du 2FA:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// Register a new user
exports.register = async (req, res) => {
    try {
        const { firstname, lastname, phone, email, password } = req.body;
        
        // Validation checks
        if (!firstname || !lastname || !phone || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }

        // Validate phone number format
        const phoneRegex = /^[+]?[\d\s-]{8,15}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ message: "Invalid phone number" });
        }

        // Validate password strength
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{5,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ message: "Password must be at least 8 characters long, and contain 1 uppercase letter, 1 lowercase letter, and 1 number" });
        }

        // Check if user already exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "Email already exists" });
        }

        // Vérifier si le rôle "Guest" existe, sinon le créer
        let guestRole = await Role.findOne({ name: 'Guest' });
        if (!guestRole) {
            guestRole = new Role({ name: 'Guest' });
            await guestRole.save();
        }

       
        // Create new user
        const user = new User({
            firstname,
            lastname,
            phone,
            email,
            password,
            role: guestRole._id // Assigner le rôle "Guest" par défaut
        });
        await user.save();

        res.status(201).json({ message: "User registered successfully", user: { email: user.email, id: user._id } });
    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip;

    console.log("Login Request:", { email });

    // Vérifier si l'utilisateur existe
    console.log("Recherche de l'utilisateur...");
    const user = await User.findOne({ email }).populate('role');
    if (!user) {
      console.log("User not found for email:", email);
      return res.status(400).json({ message: "Invalid credentials" });
    }
    console.log("Utilisateur trouvé:", user.email);

    // Vérifier si l'utilisateur est bloqué
    if (user.blocked && new Date() < user.blocked_until) {
      console.log(`User ${email} is blocked until ${user.blocked_until}.`);
      return res.status(403).json({ message: `Your account is blocked until ${user.blocked_until}.` });
    }

    // Débloquer si le temps de blocage est écoulé
    if (user.blocked && new Date() >= user.blocked_until) {
      console.log(`Déblocage de l'utilisateur ${email}...`);
      await User.updateOne(
        { email },
        { $set: { blocked: false, blocked_until: null, anomaly_count: 0 } }
      );
      console.log(`User ${email} débloqué.`);
    }

    if (!user.role || !user.role.name) {
      console.log("Rôle non trouvé pour l'utilisateur:", email);
      return res.status(500).json({ message: "Role not found" });
    }

    // Vérifier le mot de passe
    console.log("Vérification du mot de passe...");
    const isMatch = await argon2.verify(user.password, password);
    console.log("Résultat de la vérification du mot de passe:", isMatch);

    // Appeler le script Python
    console.log("Appel du script Python pour:", email);
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error("MONGO_URI is not defined in environment variables");
      return res.status(500).json({ message: "Server configuration error: Missing MONGO_URI" });
    }
    const pythonProcess = spawn("/venv/bin/python3", [
      "src/scripts/detect_anomalies.py",
      email,
      ip,
      isMatch.toString(),
      mongoUri
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let pythonOutput = "";

    pythonProcess.stdout.on("data", (data) => {
      pythonOutput += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      console.error(`Erreur Python: ${data.toString()}`);
    });

    pythonProcess.on("error", (err) => {
      console.error('Erreur lors du lancement du script Python:', err);
      return res.status(500).json({ message: "Error launching anomaly detection" });
    });

    pythonProcess.on("close", async (code) => {
      console.log(`Python process exited with code ${code}`);
      console.log(`Sortie brute Python: ${pythonOutput}`);

      let output;
      try {
        output = JSON.parse(pythonOutput.trim());
        console.log("Sortie Python parsée:", output);
      } catch (err) {
        console.error("Erreur lors de l'analyse de la sortie Python:", err);
        console.error("Sortie brute reçue:", pythonOutput);
        return res.status(500).json({ message: "Error while analyzing anomalies" });
      }

      if (output.error) {
        console.error(`Erreur Python: ${output.error}`);
        return res.status(500).json({ message: `Erreur dans le script Python: ${output.error}` });
      }

      if (output.status === "blocked") {
        console.log(`🚨 User ${email} is now blocked.`);
        return res.status(403).json({ message: "Your account is blocked due to too many anomalies." });
      }

      if (!isMatch) {
        await User.updateOne({ email }, { $inc: { anomaly_count: 1 } });
        const updatedUser = await User.findOne({ email });
        if (updatedUser.anomaly_count >= 3) {
          const blockedUntil = new Date(Date.now() + 60000);
          await User.updateOne(
            { email },
            { $set: { blocked: true, blocked_until: blockedUntil } }
          );
          console.log(`User ${email} blocked until ${blockedUntil}.`);
          return res.status(403).json({ message: `Your account is blocked until ${blockedUntil}.` });
        }
        return res.status(400).json({ message: "Invalid credentials" });
      }

      // Générer le token JWT
      const authToken = jwt.sign(
        { id: user._id, role: user.role.name },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      if (user.isTwoFactorEnabled) {
        return res.status(200).json({
          message: "2FA required",
          token: authToken, // Inclure le token
          user: {
            _id: user._id,
            email: user.email,
            role: user.role
          }
        });
      }

      const refreshedUser = await User.findOne({ email });
      if (refreshedUser.blocked) {
        console.log(`User ${email} is now blocked. No token will be generated.`);
        return res.status(403).json({ message: `Your account is blocked until ${refreshedUser.blocked_until}.` });
      }

      console.log("Token Generated:", authToken);
      return res.json({ message: "Login successful", token: authToken, user });
    });
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.loginWithFace = async (req, res) => {
  try {
    const { faceLabel } = req.body;

    console.log("Face ID Login Request:", { faceLabel });

    const user = await User.findOne({ faceLabel }).populate('role');
    if (!user) {
      console.log("User not found for face label:", faceLabel);
      return res.status(400).json({ message: "Face ID not recognized" });
    }

    // Générer le token JWT
    const authToken = jwt.sign(
      { id: user._id, role: user.role.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    if (user.isTwoFactorEnabled) {
      return res.status(200).json({
        message: "2FA required",
        token: authToken, // Inclure le token
        user: {
          _id: user._id,
          email: user.email,
          role: user.role
        }
      });
    }

    console.log("Token Generated (Face ID Login):", authToken);
    res.json({ message: "Login successful", token: authToken, user });
  } catch (error) {
    console.error("Error logging in with Face ID:", error.message);
    console.error("Stack Trace:", error.stack);
    res.status(500).json({ message: "Server error" });
  }
};

/*exports.loginWithFace = async (req, res) => {
  try {
    const { faceLabel } = req.body;

    console.log("Face ID Login Request:", { faceLabel });

    const user = await User.findOne({ faceLabel }).populate('role');
    if (!user) {
      console.log("User not found for face label:", faceLabel);
      return res.status(400).json({ message: "Face ID not recognized" });
    }

    // Générer le token JWT
    const authToken = jwt.sign(
      { id: user._id, role: user.role.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    if (user.isTwoFactorEnabled) {
      return res.status(200).json({
        message: "2FA required",
        token: authToken, // Inclure le token
        user: {
          _id: user._id,
          email: user.email,
          role: user.role
        }
      });
    }

    console.log("Token Generated (Face ID Login):", authToken);
    res.json({ message: "Login successful", token: authToken, user });
  } catch (error) {
    console.error("Error logging in with Face ID:", error.message);
    console.error("Stack Trace:", error.stack);
    res.status(500).json({ message: "Server error" });
  }
};*/

// Login with Face ID
exports.loginWithFace = async (req, res) => {
    try {
        const { faceLabel } = req.body;

        console.log("Face ID Login Request:", { faceLabel });

        // Trouver l'utilisateur par son label de visage
        const user = await User.findOne({ faceLabel });
        if (!user) {
            console.log("User not found for face label:", faceLabel);
            return res.status(400).json({ message: "Face ID not recognized" });
        }

        // Générer un token JWT
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN,
        });

        console.log("Token Generated (Face ID Login):", token);

        res.json({ token, user });
    } catch (error) {
        console.error("Error logging in with Face ID:", error.message);
        console.error("Stack Trace:", error.stack);
        res.status(500).json({ message: "Server error" });
    }
};
// Google Auth
exports.googleAuth = async (req, res) => {
    const code = req.query.code;
    console.log("Received Authorization Code:", code);

    try {
        if (!code) {
            console.error("Error: Authorization code is missing");
            return res.status(400).json({ message: "Authorization code is required" });
        }

        const googleRes = await oauth2Client.getToken(code);
        console.log("Google Token Response:", googleRes.tokens);

        oauth2Client.setCredentials(googleRes.tokens);
        const userRes = await axios.get(
           ` https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${googleRes.tokens.access_token}`
        );
        console.log("Google User Info:", userRes.data);

        const { email, name, id: googleId } = userRes.data;
        let user = await User.findOne({ email });

        if (!user) {
            const guestRole = await Role.findOne({ name: 'Guest' });

            if (!guestRole) {
                console.error("Error: 'Guest' role not found");
                return res.status(500).json({ message: "Internal Server Error: Guest role not found" });
            }
            user = await User.create({
                firstname: name.split(' ')[0],
                lastname: name.split(' ')[1] || '',
                email,
                phone :'00000000',
                googleId,
                role: guestRole._id, // You can assign roles based on your requirements
            });
            console.log("New user created:", user);
        } else {
            console.log("Existing user found:", user);
        }

        const { _id } = user;
        const token = jwt.sign({ _id, email }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_TIMEOUT || 3600,
        });

        console.log("Generated JWT Token:", token);

        res.status(200).json({ message: "success", token, user });
    } catch (err) {
        console.error("Google Auth Error:", err);
        res.status(500).json({ message: "Internal Server Error" });
    }
};


const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

//authface
exports.registerFaceLabel = async (req, res) => {
    try {
        const { email, faceLabel } = req.body;

        // Vérifier si l'utilisateur existe
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Vérifier si le faceLabel est déjà utilisé
        const existingUser = await User.findOne({ faceLabel });
        if (existingUser) {
            return res.status(400).json({ message: "Face label already in use" });
        }

        // Enregistrer le faceLabel
        user.faceLabel = faceLabel;
        await user.save();

        res.status(200).json({ message: "Face label registered successfully", user });
    } catch (error) {
        console.error("Error registering face label:", error);
        res.status(500).json({ message: "Server error" });
    }
};
// 1. Envoyer le code de vérification
exports.sendResetCode = async (req, res) => {
    try {
      const { email } = req.body;
  
      // Check if the email exists in the database
      const user = await User.findOne({ email });
  
      if (!user) {
        return res.status(404).json({ message: "Email not found" });
      }
  
      // Generate a 6-digit reset code
      const resetCode = Math.floor(10000 + Math.random() * 90000).toString();
      const resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // Expires in 10 minutes
  
      user.resetCode = resetCode;
      user.resetCodeExpires = resetCodeExpires;
      await user.save();
  
      // Send the reset code via email
      const mailOptions = {
        from: process.env.EMAIL_USER, // Sender email
        to: email, // Recipient email
        subject: "Password Reset Code", // Email subject
        text: `Your password reset code is: ${resetCode}` // Email content
      };
  
      // Send email using Nodemailer
      await transporter.sendMail(mailOptions);
  
      res.status(200).json({ message: "Reset code sent to email" });
    } catch (error) {
      console.error("Error sending reset code:", error);
      res.status(500).json({ message: "Server error" });
    }
  };

// 2. Vérifier le code de réinitialisation
exports.verifyResetCode = async (req, res) => {
    try {
        const { email, resetCode } = req.body;
        const user = await User.findOne({ email, resetCode });

        if (!user || user.resetCodeExpires < new Date()) {
            return res.status(400).json({ message: "Invalid or expired reset code" });
        }

        res.status(200).json({ message: "Reset code verified" });
    } catch (error) {
        console.error("Error verifying reset code:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// 3. Réinitialiser le mot de passe
exports.resetPassword = async (req, res) => {
    try {
        const { email, resetCode, newPassword } = req.body;
        const user = await User.findOne({ email, resetCode });

        if (!user || user.resetCodeExpires < new Date()) {
            return res.status(400).json({ message: "Invalid or expired reset code" });
        }
        user.password = newPassword; 

        user.resetCode = null;
        user.resetCodeExpires = null;
        await user.save();

        res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
        console.error("Error resetting password:", error);
        res.status(500).json({ message: "Server error" });
    }
};

/*exports.getUsers = async (req, res) => {
    try {
      // Récupérer les rôles Team Leader et Team Member
      const teamRoles = await Role.find({ name: { $in: ['Team Leader', 'Team Member'] } });
      const teamRoleIds = teamRoles.map(role => role._id);
  
      // Récupérer les utilisateurs avec ces rôles
      const users = await User.find({ role: { $in: teamRoleIds } }).populate('role', 'name');
  
      // Si aucun utilisateur n'est trouvé
      if (!users || users.length === 0) {
        return res.status(404).json({ message: "No users with role Team Leader or Team Member found" });
      }
  
      // Renvoi des utilisateurs trouvés
      res.status(200).json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Server error" });
    }
  };*/
  
  exports.getUsers = async (req, res) => {
    try {
      // Récupérer tous les utilisateurs dans la base de données
      const users = await User.find().populate('role','name');
  
      // Si aucun utilisateur n'est trouvé
      if (!users || users.length === 0) {
        return res.status(404).json({ message: "No users found" });
      }
  
      // Renvoi des utilisateurs trouvés
      res.status(200).json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Server error" });
    }
  };
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^[+]?\d[\d\s-]{8,15}$/;

  // Mettre à jour un utilisateur
  exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Validation de l'email
        if (updates.email && !emailRegex.test(updates.email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }

        // Validation du numéro de téléphone
        if (updates.phone && !phoneRegex.test(updates.phone)) {
            return res.status(400).json({ message: "Invalid phone number format" });
        }

        // Hachage du mot de passe si fourni
        if (updates.password) {
          updates.password = updates.password.trim();
      } 

        const updatedUser = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json(updatedUser);
    } catch (error) {
        res.status(500).json({ message: "Update error", error: error.message });
    }
};
  exports.getUserById = async (req, res) => {
    try {
        const { id } = req.params;
  
        // Vérifier si l'ID est valide (optionnel si Mongoose gère déjà)
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }
  
        // Rechercher l'utilisateur par son ID en excluant le mot de passe
        const user = await User.findById(id).select("-password");
  
        // Vérifier si l'utilisateur existe
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
  
        // Retourner les informations de l'utilisateur
        res.status(200).json(user);
    } catch (error) {
        console.error("Error fetching user by ID:", error);
        res.status(500).json({ message: "Server error" });
    }
  };
   
  // Supprimer un utilisateur
  exports.deleteUser = async (req, res) => {
      try {
          const { id } = req.params;
          const deletedUser = await User.findByIdAndDelete(id);
  
          if (!deletedUser) {
              return res.status(404).json({ message: "User not found" });
          }
  
          res.status(200).json({ message: "User deleted successfully" });
      } catch (error) {
          res.status(500).json({ message: "Delete error", error: error.message });
      }
  };

 const calculateProjectManagerBonus = async (userId, weekStart, weekEnd) => {
   const projects = await Project.find({
       projectManager: userId,
       status: 'Completed',
       startDate: { $lte: weekEnd },
       endDate: { $gte: weekStart },
   });
 
   let bonus = 0;
   projects.forEach((project) => {
       bonus += 0.1;
       console.log(`Projet terminé trouvé pour bonus: ${project.name}, bonus ajouté: 0.1`);
   });
 
   console.log(`Bonus total pour user ${userId}: ${bonus}`);
   return bonus;
 };
 
 // Fonction pour calculer le score d'une tâche
 const calculateTaskScore = (task) => {
   const priorityWeights = { Urgent: 4, High: 3, Medium: 2, Low: 1, undefined: 1 };
   const effortByPriority = { Urgent: 4, High: 3, Medium: 2, Low: 1, undefined: 1 };
   let score = 0;
 
   console.log(`Calcul du score pour la tâche "${task.title}": status=${task.status}, priority=${task.priority}`);
 
   if (["Done", "Tested", "Completed"].includes(task.status)) {
       score = priorityWeights[task.priority] || 1;
   } else if (["In Progress", "Review"].includes(task.status)) {
       const progress = task.status === "In Progress" ? 0.5 : 0.8;
       score = progress * (priorityWeights[task.priority] || 1);
   }
 
   const effort = effortByPriority[task.priority] || 0;
   const effortBonus = effort * 0.5;
   score += effortBonus;
   console.log(`Effort dérivé pour priorité ${task.priority}: ${effort}, bonus effort: ${effortBonus}`);
 
   let statusBonus = 0;
   if (["Done", "Tested", "Completed"].includes(task.status)) {
       statusBonus = 1;
   } else if (task.status === "Review") {
       statusBonus = 0.5;
   } else if (task.status === "In Progress") {
       statusBonus = 0.2;
   }
   score += statusBonus;
   console.log(`Bonus basé sur le statut ${task.status}: ${statusBonus}`);
 
   console.log(`Score calculé pour la tâche "${task.title}": ${score}`);
   return score;
 };
 
 // Route : Meilleur utilisateur global
 exports.getBestWeeklyUser = async (req, res) => {
   try {
       console.log("Requête reçue pour getBestWeeklyUser avec weekStart:", req.query.weekStart);
       const { weekStart, role } = req.query;
       if (!weekStart) {
           return res.status(400).json({ message: "Le paramètre weekStart est requis" });
       }
 
       const startDate = new Date(weekStart);
       if (isNaN(startDate.getTime())) {
           console.log("Invalid weekStart format:", weekStart);
           return res.status(400).json({ message: "Format de weekStart invalide" });
       }
       startDate.setUTCHours(0, 0, 0, 0);
       const endDate = new Date(startDate);
       endDate.setDate(startDate.getDate() + 6);
       endDate.setUTCHours(23, 59, 59, 999);
       console.log("Période normalisée:", startDate, "à", endDate);
 
       const users = await User.find().populate("role");
       if (!users || users.length === 0) {
           console.log("Aucun utilisateur trouvé dans la base de données");
           return res.status(200).json({
               bestUser: null,
               weekStart: startDate.toISOString().split("T")[0],
               weekEnd: endDate.toISOString().split("T")[0],
           });
       }
       console.log("Utilisateurs trouvés:", users.map(u => ({ id: u._id?.toString() || "N/A", name: `${u.firstname} ${u.lastname}`, role: u.role ? u.role.name : "Unknown" })));
 
       const userScores = await Promise.all(
           users.map(async (user) => {
               if (!user._id) {
                   console.log(`Utilisateur sans _id valide, ignoré: ${user.firstname} ${user.lastname}`);
                   return null;
               }
 
               let projects;
               try {
                   projects = await Project.find({
                       $or: [{ projectManager: user._id }, { teamMembers: user._id }],
                       startDate: { $lte: endDate },
                       endDate: { $gte: startDate },
                   });
               } catch (error) {
                   console.error(`Erreur lors de la recherche des projets pour ${user.firstname} ${user.lastname}:`, error.message);
                   return null;
               }
               console.log(`Projets pour ${user.firstname} ${user.lastname}:`, projects.length);
 
               const projectIds = projects.map(project => project._id);
               let tasks;
               try {
                   tasks = await Task.find({
                       assignedTo: user._id,
                       project: { $in: projectIds },
                       status: { $in: ["Done", "Tested", "Completed", "In Progress", "Review"] },
                   });
               } catch (error) {
                   console.error(`Erreur lors de la recherche des tâches pour ${user.firstname} ${user.lastname}:`, error.message);
                   return null;
               }
               console.log(`Tâches actives pour ${user.firstname} ${user.lastname} (${user._id}) dans les projets actifs:`, tasks.length);
 
               // Calculer le score de base à partir des tâches
               let score = tasks.reduce((total, task) => total + calculateTaskScore(task), 0);
               console.log(`Score de base pour ${user.firstname} ${user.lastname}: ${score}`);
 
               // Pénalité pour les tâches en retard
               let overdueTasks;
               try {
                   overdueTasks = await Task.find({
                       assignedTo: user._id,
                       project: { $in: projectIds },
                       dueDate: { $exists: true, $lte: new Date() }, // dueDate existe et est dépassée
                       status: { $nin: ["Done", "Tested", "Completed"] }, // Statut non terminé
                   });
               } catch (error) {
                   console.error(`Erreur lors de la recherche des tâches en retard pour ${user.firstname} ${user.lastname}:`, error.message);
                   overdueTasks = [];
               }
               const overduePenalty = overdueTasks.length * -2; // Pénalité de -2 par tâche en retard
               score += overduePenalty;
               console.log(`Pénalité pour ${overdueTasks.length} tâches en retard pour ${user.firstname} ${user.lastname}: ${overduePenalty}`);
 
               // Bonus pour les nouvelles assignations dans la semaine
               let newlyAssignedTasks;
               try {
                   newlyAssignedTasks = await Task.find({
                       assignedTo: user._id,
                       project: { $in: projectIds },
                       startDate: { $gte: startDate, $lte: endDate }, // Tâches assignées dans la semaine
                   });
               } catch (error) {
                   console.error(`Erreur lors de la recherche des nouvelles tâches assignées pour ${user.firstname} ${user.lastname}:`, error.message);
                   newlyAssignedTasks = [];
               }
               const newAssignmentBonus = newlyAssignedTasks.length * 1; // Bonus de +1 par nouvelle tâche
               score += newAssignmentBonus;
               console.log(`Bonus pour ${newlyAssignedTasks.length} nouvelles tâches assignées pour ${user.firstname} ${user.lastname}: ${newAssignmentBonus}`);
 
               // Bonus pour Project Manager si applicable
               if (user.role?.name === "Project Manager") {
                   const pmBonus = await calculateProjectManagerBonus(user._id, startDate, endDate);
                   score += pmBonus;
                   console.log(`Bonus de Project Manager pour ${user.firstname} ${user.lastname}: ${pmBonus}`);
               }
 
               // S'assurer que le score ne soit pas négatif
               score = Math.max(0, score);
               console.log(`Score final ajusté pour ${user.firstname} ${user.lastname}: ${score}`);
 
               return {
                   userId: user._id.toString(),
                   firstname: user.firstname || "Unknown",
                   lastname: user.lastname || "User",
                   role: user.role ? user.role.name : "Unknown",
                   profileImage: user.profileImage || "",
                   score: parseFloat(score.toFixed(2)),
                   taskCount: tasks.length,
                   overdueTasks: overdueTasks.length,
                   newlyAssignedTasks: newlyAssignedTasks.length,
               };
           })
       );
 
       const validUserScores = userScores.filter(userScore => userScore !== null);
       console.log("Scores des utilisateurs:", validUserScores);
 
       validUserScores.sort((a, b) => b.score - a.score);
       const bestUser = validUserScores.length > 0 && validUserScores[0].score > 0 ? validUserScores[0] : null;
       console.log("Meilleur utilisateur:", bestUser);
 
       // Attribuer les badges
       if (bestUser && role === "Admin") {
           bestUser.badges = ["Best Weekly Performer", "Star Collaborator"];
       } else if (bestUser) {
           bestUser.badges = ["Best Weekly Performer"];
       }
 
       res.status(200).json({
           bestUser,
           weekStart: startDate.toISOString().split("T")[0],
           weekEnd: endDate.toISOString().split("T")[0],
       });
   } catch (error) {
       console.error("Erreur lors du calcul du meilleur utilisateur:", error);
       res.status(500).json({ message: "Erreur serveur" });
   }
 };
 
 // Route : Meilleur utilisateur par projet
 exports.getBestWeeklyUserPerProject = async (req, res) => {
   try {
       console.log("Requête reçue pour getBestWeeklyUserPerProject avec weekStart:", req.query.weekStart);
       const { weekStart, userId, role } = req.query;
       if (!weekStart) {
           return res.status(400).json({ message: "Le paramètre weekStart est requis" });
       }
 
       const startDate = new Date(weekStart);
       if (isNaN(startDate.getTime())) {
           console.log("Invalid weekStart format:", weekStart);
           return res.status(400).json({ message: "Format de weekStart invalide" });
       }
       startDate.setUTCHours(0, 0, 0, 0);
       const endDate = new Date(startDate);
       endDate.setDate(startDate.getDate() + 6);
       endDate.setUTCHours(23, 59, 59, 999);
       console.log("Période normalisée:", startDate, "à", endDate);
 
       // Récupérer les projets en fonction du rôle
       let projects;
       if (role === "Admin") {
           projects = await Project.find({
               startDate: { $lte: endDate },
               endDate: { $gte: startDate },
           });
       } else {
           projects = await Project.find({
               $or: [{ projectManager: userId }, { teamMembers: userId }],
               startDate: { $lte: endDate },
               endDate: { $gte: startDate },
           });
       }
 
       if (!projects || projects.length === 0) {
           console.log("Aucun projet trouvé pour cette période");
           return res.status(200).json({
               bestUsersPerProject: [],
               weekStart: startDate.toISOString().split("T")[0],
               weekEnd: endDate.toISOString().split("T")[0],
           });
       }
 
       const bestUsersPerProject = await Promise.all(
           projects.map(async (project) => {
               const projectId = project._id;
               const teamMemberIds = [
                   project.projectManager?._id,
                   ...(project.teamMembers || []).map(member => member._id),
               ].filter(Boolean);
 
               if (!teamMemberIds.length) {
                   return { projectId: projectId.toString(), projectName: project.name, bestUser: null };
               }
 
               const users = await User.find({ _id: { $in: teamMemberIds } }).populate("role");
 
               const userScores = await Promise.all(
                   users.map(async (user) => {
                       if (!user._id) {
                           console.log(`Utilisateur sans _id valide, ignoré: ${user.firstname} ${user.lastname}`);
                           return null;
                       }
 
                       let tasks;
                       try {
                           tasks = await Task.find({
                               assignedTo: user._id,
                               project: projectId,
                               status: { $in: ["Done", "Tested", "Completed", "In Progress", "Review"] },
                           });
                       } catch (error) {
                           console.error(`Erreur lors de la recherche des tâches pour ${user.firstname} ${user.lastname}:`, error.message);
                           return null;
                       }
 
                       // Calculer le score de base
                       let score = tasks.reduce((total, task) => total + calculateTaskScore(task), 0);
                       console.log(`Score de base pour ${user.firstname} ${user.lastname} dans le projet ${project.name}: ${score}`);
 
                       // Pénalité pour les tâches en retard
                       let overdueTasks;
                       try {
                           overdueTasks = await Task.find({
                               assignedTo: user._id,
                               project: projectId,
                               dueDate: { $exists: true, $lte: new Date() },
                               status: { $nin: ["Done", "Tested", "Completed"] },
                           });
                       } catch (error) {
                           console.error(`Erreur lors de la recherche des tâches en retard pour ${user.firstname} ${user.lastname}:`, error.message);
                           overdueTasks = [];
                       }
                       const overduePenalty = overdueTasks.length * -2;
                       score += overduePenalty;
                       console.log(`Pénalité pour ${overdueTasks.length} tâches en retard pour ${user.firstname} ${user.lastname} dans le projet ${project.name}: ${overduePenalty}`);
 
                       // Bonus pour les nouvelles assignations dans la semaine
                       let newlyAssignedTasks;
                       try {
                           newlyAssignedTasks = await Task.find({
                               assignedTo: user._id,
                               project: projectId,
                               startDate: { $gte: startDate, $lte: endDate },
                           });
                       } catch (error) {
                           console.error(`Erreur lors de la recherche des nouvelles tâches assignées pour ${user.firstname} ${user.lastname}:`, error.message);
                           newlyAssignedTasks = [];
                       }
                       const newAssignmentBonus = newlyAssignedTasks.length * 1;
                       score += newAssignmentBonus;
                       console.log(`Bonus pour ${newlyAssignedTasks.length} nouvelles tâches assignées pour ${user.firstname} ${user.lastname} dans le projet ${project.name}: ${newAssignmentBonus}`);
 
                       // S'assurer que le score ne soit pas négatif
                       score = Math.max(0, score);
                       console.log(`Score final ajusté pour ${user.firstname} ${user.lastname} dans le projet ${project.name}: ${score}`);
 
                       return {
                           userId: user._id.toString(),
                           firstname: user.firstname || "Unknown",
                           lastname: user.lastname || "User",
                           role: user.role ? user.role.name : "Unknown",
                           profileImage: user.profileImage || "",
                           score: parseFloat(score.toFixed(2)),
                           taskCount: tasks.length,
                           overdueTasks: overdueTasks.length,
                           newlyAssignedTasks: newlyAssignedTasks.length,
                       };
                   })
               );
 
               const validUserScores = userScores.filter(userScore => userScore !== null);
               validUserScores.sort((a, b) => b.score - a.score);
               const bestUser = validUserScores.length > 0 && validUserScores[0].score > 0 ? validUserScores[0] : null;
 
               if (bestUser) {
                   bestUser.badges = ["Best Weekly Performer"];
               }
 
               return {
                   projectId: projectId.toString(),
                   projectName: project.name,
                   bestUser,
               };
           })
       );
 
       res.status(200).json({
           bestUsersPerProject,
           weekStart: startDate.toISOString().split("T")[0],
           weekEnd: endDate.toISOString().split("T")[0],
       });
   } catch (error) {
       console.error("Erreur lors du calcul du meilleur utilisateur par projet:", error);
       res.status(500).json({ message: "Erreur serveur" });
   }
 };
 
  // Helper roleHierarchy object
const roleHierarchy = {
  Admin: 5,
  'Project Manager': 4,
  'Team Leader': 3,
  'Team Member': 2,
  Guest: 1,
};
 exports.getUsersByRole = async (req, res) => {
  try {
    const { roleName } = req.query; 
    console.log('getUsersByRole called with:', { roleName });

    if (!roleName) {
      console.error('Missing roleName');
      return res.status(400).json({ message: 'Role name is required' });
    }

    const validRoles = ['Admin', 'Project Manager', 'Team Leader', 'Team Member', 'Guest'];
    if (!validRoles.includes(roleName)) {
      console.error('Invalid role name:', roleName);
      return res.status(400).json({ message: `Invalid role name. Must be one of: ${validRoles.join(', ')}` });
    }

    const role = await Role.findOne({ name: roleName });
    if (!role) {
      console.error('Role not found:', roleName);
      return res.status(404).json({ message: `Role ${roleName} not found `});
    }

    const lowerRoles = validRoles.filter(r => roleHierarchy[r] < roleHierarchy[roleName]);
    if (lowerRoles.length === 0) {
      return res.status(200).json({ message: 'No lower roles found', users: [] });
    }

    const roleIds = await Promise.all(lowerRoles.map(r => Role.findOne({ name: r }).then(r => r?._id)));
    const users = await User.find()
      .populate('role', 'name')
      .where('role')
      .in(roleIds.filter(id => id !== null));

    if (!users || users.length === 0) {
      return res.status(200).json({ message: 'No users found with lower roles', users: [] });
    }

    console.log(`Found ${users.length} users with roles below ${roleName}`);
    res.status(200).json({ message: 'Users retrieved successfully', users });
  } catch (error) {
    console.error('Error fetching users by role:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

