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

exports.generate2FA = async (req, res) => {
    try {
      const { email } = req.body;
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé." });
      }
  
      // Générer un secret TOTP pour Google Authenticator
      const secret = speakeasy.generateSecret({ length: 20 });
      const otpAuthUrl = `otpauth://totp/MyApp:${email}?secret=${secret.base32}&issuer=MyApp`;
  
      // Stocker temporairement le secret
      user.twoFactorTempSecret = secret.base32;
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
  
  // Vérifier le 2FA à la connexion
  exports.verify2FA = async (req, res) => {
    try {
      const { email, token } = req.body;
      const user = await User.findOne({ email });
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
        { id: user._id, role: user.role },
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
        // Create new user
        const user = new User({
            firstname,
            lastname,
            phone,
            email,
            password,
        });
        await user.save();

        res.status(201).json({ message: "User registered successfully", user });
    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ message: error.message });
    }
};

/* // Login a user
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log("Login Request:", { email, password });

        const user = await User.findOne({ email });
        if (!user) {
            console.log("User not found for email:", email);
            return res.status(400).json({ message: "Invalid credentials" });
        }

        if (user.googleId) {
            // User logged in through Google, no password needed
            const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
                expiresIn: process.env.JWT_EXPIRES_IN,
            });
            console.log("Token Generated (Google Login):", token);
            return res.json({ token, user });
        }

        const isMatch = await argon2.verify(user.password, password);
        if (!isMatch) {
            console.log("Invalid password for user:", user.email);
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN,
        });

        console.log("Token Generated:", token);

        res.json({ token, user });
    } catch (error) {
        console.error("Error logging in:", error.message);
        console.error("Stack Trace:", error.stack);
        res.status(500).json({ message: "Server error" });
    }
}; */
/*exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const ip = req.ip;

        console.log("Login Request:", { email });

        // Vérifier si l'utilisateur existe
        const user = await User.findOne({ email });
        if (!user) {
            console.log("User not found for email:", email);
            await LoginAttempt.create({ email, ip, success: false });
            return res.status(400).json({ message: "Invalid credentials" });
        }

        // Vérifier si l'utilisateur est bloqué avant toute tentative
        if (user.blocked && new Date() < user.blocked_until) {
            console.log(`User ${email} is blocked until ${user.blocked_until}.`);
            return res.status(403).json({ message:` Votre compte est bloqué jusqu'à ${user.blocked_until}. `});
        }

        // Débloquer si le temps de blocage est écoulé
        if (user.blocked && new Date() >= user.blocked_until) {
            await User.updateOne(
                { email },
                { $set: { blocked: false, blocked_until: null, anomaly_count: 0 } }
            );
            await LoginAttempt.deleteMany({ email, success: false });
            console.log(`User ${email} débloqué.`);
        }

        // Vérifier le mot de passe
        const isMatch = await argon2.verify(user.password, password);
        await LoginAttempt.create({ email, ip, success: isMatch });

        // Exécuter le script Python pour détecter les anomalies
        const pythonProcess = spawn("python3", ["src/scripts/detect_anomalies.py", email, ip, isMatch.toString()]);
        let pythonOutput = "";

        pythonProcess.stdout.on("data", (data) => {
            pythonOutput += data.toString();
            console.log(`Python Output: ${data.toString().trim()}`);
        });

        pythonProcess.stderr.on("data", (data) => {
            console.error(`Python Error: ${data}`);
        });

        pythonProcess.on("close", async (code) => {
            console.log(`Python process exited with code ${code}`);
            const output = pythonOutput.trim();

            // 🔥 Vérifier si Python a détecté un blocage
            if (output.includes("blocked")) {
                console.log(`🚨 User ${email} is now blocked. No token will be generated.`);
                return res.status(403).json({ message: "Votre compte est bloqué en raison de trop d'anomalies." });
            }

            // Vérifier après exécution du script si l'utilisateur est bloqué
            const refreshedUser = await User.findOne({ email });
            if (refreshedUser.blocked) {
                console.log(`User ${email} is now blocked. No token will be generated.`);
                return res.status(403).json({ message:` Votre compte est bloqué jusqu'à ${refreshedUser.blocked_until}.` });
            }

            // Si l'authentification échoue, incrémenter le compteur d'anomalies
            if (!isMatch) {
                await User.updateOne({ email }, { $inc: { anomaly_count: 1 } });

                // Vérifier si l'utilisateur doit être bloqué
                const updatedUser = await User.findOne({ email });
                if (updatedUser.anomaly_count >= 3) {
                    const blockedUntil = new Date(Date.now() + 60000); // Bloqué pour 1 minute
                    await User.updateOne(
                        { email },
                        { $set: { blocked: true, blocked_until: blockedUntil } }
                    );
                    console.log(`User ${email} blocked until ${blockedUntil}.`);
                    return res.status(403).json({ message: `Votre compte est bloqué jusqu'à ${blockedUntil}. `});
                }

                return res.status(400).json({ message: "Invalid credentials" });
            }

            // ✅ Générer un token JWT SEULEMENT si l'utilisateur n'est pas bloqué
            const authToken = jwt.sign(
                { id: user._id, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN }
            );

            console.log("Token Generated:", authToken);
            return res.json({ message: "Login successful", token: authToken });
        });

    } catch (error) {
        console.error("Error during login:", error);
        return res.status(500).json({ message: "Server error" });
    }
};*/
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const ip = req.ip;

        console.log("Login Request:", { email });

        // Vérifier si l'utilisateur existe
        const user = await User.findOne({ email });
        if (!user) {
            console.log("User not found for email:", email);
            await LoginAttempt.create({ email, ip, success: false });
            return res.status(400).json({ message: "Invalid credentials" });
        }

        // Vérifier si l'utilisateur est bloqué
        if (user.blocked && new Date() < user.blocked_until) {
            console.log(`User ${email} is blocked until ${user.blocked_until}.`);
            return res.status(403).json({ message: `Votre compte est bloqué jusqu'à ${user.blocked_until}.` });
        }

        // Débloquer si le temps de blocage est écoulé
        if (user.blocked && new Date() >= user.blocked_until) {
            await User.updateOne(
                { email },
                { $set: { blocked: false, blocked_until: null, anomaly_count: 0 } }
            );
            await LoginAttempt.deleteMany({ email, success: false });
            console.log(`User ${email} débloqué.`);
        }

        // Vérifier le mot de passe
        const isMatch = await argon2.verify(user.password, password);
        await LoginAttempt.create({ email, ip, success: isMatch });

        // Vérifier si la 2FA est activée
        if (user.isTwoFactorEnabled) {
            return res.status(200).json({ message: "2FA required" });
        }

        // Exécuter le script Python pour détecter les anomalies
        const pythonProcess = spawn("python3", ["src/scripts/detect_anomalies.py", email, ip, isMatch.toString()]);
        let pythonOutput = "";

        pythonProcess.stdout.on("data", (data) => {
            pythonOutput += data.toString();
            console.log(`Python Output: ${data.toString().trim()}`);
        });

        pythonProcess.stderr.on("data", (data) => {
            console.error(`Python Error: ${data}`);
        });

        pythonProcess.on("close", async (code) => {
            console.log(`Python process exited with code ${code}`);
            const output = pythonOutput.trim();

            if (output.includes("blocked")) {
                console.log(`🚨 User ${email} is now blocked. No token will be generated.`);
                return res.status(403).json({ message: "Votre compte est bloqué en raison de trop d'anomalies." });
            }

            const refreshedUser = await User.findOne({ email });
            if (refreshedUser.blocked) {
                console.log(`User ${email} is now blocked. No token will be generated.`);
                return res.status(403).json({ message: `Votre compte est bloqué jusqu'à ${refreshedUser.blocked_until}.` });
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
                    return res.status(403).json({ message: `Votre compte est bloqué jusqu'à ${blockedUntil}.` });
                }

                return res.status(400).json({ message: "Invalid credentials" });
            }

            // Générer un token JWT
            const authToken = jwt.sign(
                { id: user._id, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN }
            );

            console.log("Token Generated:", authToken);
            return res.json({ message: "Login successful", token: authToken });
        });

    } catch (error) {
        console.error("Error during login:", error);
        return res.status(500).json({ message: "Server error" });
    }
};
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
            `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${googleRes.tokens.access_token}`
        );
        console.log("Google User Info:", userRes.data);

        const { email, name, id: googleId } = userRes.data;
        let user = await User.findOne({ email });

        if (!user) {
            user = await User.create({
                firstname: name.split(' ')[0],
                lastname: name.split(' ')[1] || '',
                email,
                phone :'00000000',
                googleId,
                role: 'Guest', // You can assign roles based on your requirements
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

// Get user profile
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


exports.getUsers = async (req, res) => {
    try {
      // Récupérer tous les utilisateurs dans la base de données
      const users = await User.find();
  
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
            updates.password = await argon2.hash(updates.password);
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
