const User = require("../models/User");
const Role = require("../models/Role");
const argon2 = require('argon2');
const jwt = require("jsonwebtoken");
const axios = require('axios');
const { oauth2Client } = require('../utils/googleClient');
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const LoginAttempt = require('../models/LoginAttempt');
const { spawn } = require("child_process");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const path = require("path");

// Configuration de nodemailer
const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Vérifier que les variables d'environnement pour l'email sont définies
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.error("❌ EMAIL_USER ou EMAIL_PASSWORD non défini dans les variables d'environnement.");
}

// Fonction pour générer un mot de passe fort
exports.generateStrongPassword = (req, res) => {
    console.log("📢 Démarrage de la génération du mot de passe...");

    const scriptPath = path.join(__dirname, "..", "scripts", "generate_password.py");
    console.log("📢 Chemin vers le script Python:", scriptPath);

    const pythonProcess = spawn("python", [scriptPath, "16"]);
    let password = "";

    pythonProcess.stdout.on("data", (data) => {
        console.log("📢 Sortie du processus Python:", data.toString());
        password += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
        const errorMessage = data.toString();
        console.error("❌ Erreur dans le processus Python:", errorMessage);
        return res.status(500).json({ error: `Erreur lors de l'exécution du script Python: ${errorMessage}` });
    });

    pythonProcess.on("close", (code) => {
        if (code === 0) {
            const generatedPassword = password.trim();
            console.log("📢 Mot de passe généré:", generatedPassword);
            res.json({ password: generatedPassword });
        } else {
            console.error("❌ Le processus Python s'est terminé avec le code:", code);
            return res.status(500).json({ error: `Le processus Python s'est terminé avec le code ${code}` });
        }
    });
};

// Générer un code 2FA
exports.generate2FA = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "L'email est requis." });
        }

        console.log("📢 Génération 2FA pour l'email:", email);
        const user = await User.findOne({ email });
        if (!user) {
            console.log("❌ Utilisateur non trouvé pour l'email:", email);
            return res.status(404).json({ message: "Utilisateur non trouvé." });
        }

        const secret = speakeasy.generateSecret({ length: 20 });
        const otpAuthUrl = `otpauth://totp/MyApp:${email}?secret=${secret.base32}&issuer=MyApp`;

        user.twoFactorTempSecret = secret.base32;
        await user.save();
        console.log("📢 Secret 2FA temporaire sauvegardé:", secret.base32);

        QRCode.toDataURL(otpAuthUrl, (err, qrCodeDataUrl) => {
            if (err) {
                console.error("❌ Erreur lors de la génération du QR Code:", err);
                return res.status(500).json({ message: "Erreur lors de la génération du QR Code", error: err.message });
            }
            res.json({ qrCode: qrCodeDataUrl, secret: secret.base32 });
        });
    } catch (error) {
        console.error("❌ Erreur lors de la génération du 2FA:", error);
        res.status(500).json({ message: "Erreur serveur", error: error.message });
    }
};

// Activer le 2FA
exports.enable2FA = async (req, res) => {
    try {
        const { email, token } = req.body;
        if (!email || !token) {
            return res.status(400).json({ message: "L'email et le token sont requis." });
        }

        console.log("📢 Activation 2FA pour l'email:", email);
        const user = await User.findOne({ email });
        if (!user || !user.twoFactorTempSecret) {
            console.log("❌ Aucun 2FA temporaire trouvé pour l'email:", email);
            return res.status(400).json({ message: "Aucun 2FA temporaire trouvé." });
        }

        const isValid = speakeasy.totp.verify({
            secret: user.twoFactorTempSecret,
            encoding: "base32",
            token,
            window: 1,
        });

        if (!isValid) {
            console.log("❌ Code de vérification invalide pour l'email:", email);
            return res.status(400).json({ message: "Code de vérification invalide." });
        }

        user.twoFactorSecret = user.twoFactorTempSecret;
        user.isTwoFactorEnabled = true;
        user.twoFactorTempSecret = null;
        await user.save();
        console.log("📢 2FA activé pour l'email:", email);

        res.json({ message: "2FA activé avec succès !" });
    } catch (error) {
        console.error("❌ Erreur lors de l'activation du 2FA:", error);
        res.status(500).json({ message: "Erreur serveur", error: error.message });
    }
};

// Vérifier le 2FA
exports.verify2FA = async (req, res) => {
    try {
        const { email, token } = req.body;
        if (!email || !token) {
            return res.status(400).json({ message: "L'email et le token sont requis." });
        }

        console.log("📢 Vérification 2FA pour l'email:", email);
        const user = await User.findOne({ email }).populate('role');
        if (!user || !user.isTwoFactorEnabled) {
            console.log("❌ 2FA non activé pour l'email:", email);
            return res.status(400).json({ message: "2FA non activé pour cet utilisateur." });
        }

        const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: "base32",
            token,
            window: 1,
        });

        if (!verified) {
            console.log("❌ Code de vérification invalide pour l'email:", email);
            return res.status(400).json({ message: "Code de vérification invalide." });
        }

        const authToken = jwt.sign(
            { id: user._id, role: user.role.name },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );
        console.log("📢 Token généré après vérification 2FA:", authToken);

        res.json({ message: "Authentification réussie", token: authToken });
    } catch (error) {
        console.error("❌ Erreur lors de la vérification du 2FA:", error);
        res.status(500).json({ message: "Erreur serveur", error: error.message });
    }
};

// Inscription d'un nouvel utilisateur
exports.register = async (req, res) => {
    try {
        const { firstname, lastname, phone, email, password } = req.body;
        console.log("📢 Register request received:", req.body);

        // Validation checks
        if (!firstname || !lastname || !phone || !email || !password) {
            console.log("❌ Validation failed: All fields are required");
            return res.status(400).json({ message: "All fields are required" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log("❌ Validation failed: Invalid email format");
            return res.status(400).json({ message: "Invalid email format" });
        }

        const phoneRegex = /^[+]?[\d\s-]{8,15}$/;
        if (!phoneRegex.test(phone)) {
            console.log("❌ Validation failed: Invalid phone number");
            return res.status(400).json({ message: "Invalid phone number" });
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(password)) {
            console.log("❌ Validation failed: Password does not meet requirements");
            return res.status(400).json({ message: "Password must be at least 8 characters long, and contain 1 uppercase letter, 1 lowercase letter, and 1 number" });
        }

        console.log("📢 Checking if user exists with email:", email);
        const userExists = await User.findOne({ email });
        if (userExists) {
            console.log("❌ User already exists with email:", email);
            return res.status(400).json({ message: "Email already exists" });
        }

        // Vérifier si le rôle "Admin" existe, sinon le créer
        console.log("📢 Checking if Admin role exists...");
        let adminRole = await Role.findOne({ name: 'Admin' });
        if (!adminRole) {
            console.log("📢 Admin role not found, creating...");
            adminRole = new Role({ name: 'Admin' });
            await adminRole.save();
            console.log("📢 Admin role created:", adminRole);
        } else {
            console.log("📢 Admin role found:", adminRole);
        }

        console.log("📢 Creating new user...");
        const user = new User({
            firstname,
            lastname,
            phone,
            email,
            password,
            role: adminRole._id,
        });
        await user.save();
        console.log("📢 User created:", user);

        res.status(201).json({ message: "User registered successfully", user });
    } catch (error) {
        console.error("❌ Register Error:", error);
        res.status(500).json({ message: "Erreur lors de l'inscription", error: error.message });
    }
};

// Connexion d'un utilisateur
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const ip = req.ip;
        if (!email || !password) {
            return res.status(400).json({ message: "L'email et le mot de passe sont requis." });
        }

        console.log("📢 Login Request:", { email, ip });

        const user = await User.findOne({ email }).populate('role');
        if (!user) {
            console.log("❌ User not found for email:", email);
            await LoginAttempt.create({ email, ip, success: false });
            return res.status(400).json({ message: "Invalid credentials" });
        }

        if (user.blocked && new Date() < user.blocked_until) {
            console.log(`❌ User ${email} is blocked until ${user.blocked_until}.`);
            return res.status(403).json({ message: `Votre compte est bloqué jusqu'à ${user.blocked_until}.` });
        }

        if (user.blocked && new Date() >= user.blocked_until) {
            await User.updateOne(
                { email },
                { $set: { blocked: false, blocked_until: null, anomaly_count: 0 } }
            );
            await LoginAttempt.deleteMany({ email, success: false });
            console.log(`📢 User ${email} débloqué.`);
        }

        if (!user.role || !user.role.name) {
            console.log("❌ Rôle non trouvé pour l'utilisateur:", email);
            return res.status(500).json({ message: "Rôle non trouvé pour cet utilisateur." });
        }

        const isMatch = await argon2.verify(user.password, password);
        await LoginAttempt.create({ email, ip, success: isMatch });
        console.log("📢 Password match:", isMatch);

        if (user.isTwoFactorEnabled) {
            console.log("📢 2FA required for user:", email);
            return res.status(200).json({ message: "2FA required" });
        }

        const pythonProcess = spawn("python3", ["src/scripts/detect_anomalies.py", email, ip, isMatch.toString()]);
        let pythonOutput = "";

        pythonProcess.stdout.on("data", (data) => {
            pythonOutput += data.toString();
            console.log(`📢 Python Output: ${data.toString().trim()}`);
        });

        pythonProcess.stderr.on("data", (data) => {
            console.error(`❌ Python Error: ${data.toString()}`);
        });

        pythonProcess.on("close", async (code) => {
            console.log(`📢 Python process exited with code ${code}`);
            const output = pythonOutput.trim();

            if (output.includes("blocked")) {
                console.log(`🚨 User ${email} is now blocked.`);
                return res.status(403).json({ message: "Votre compte est bloqué en raison de trop d'anomalies." });
            }

            const refreshedUser = await User.findOne({ email });
            if (refreshedUser.blocked) {
                console.log(`❌ User ${email} is now blocked until ${refreshedUser.blocked_until}.`);
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
                    console.log(`❌ User ${email} blocked until ${blockedUntil}.`);
                    return res.status(403).json({ message: `Votre compte est bloqué jusqu'à ${blockedUntil}.` });
                }
                return res.status(400).json({ message: "Invalid credentials" });
            }

            const authToken = jwt.sign(
                { id: user._id, role: user.role.name },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN }
            );
            console.log("📢 Token Generated:", authToken);
            return res.json({ message: "Login successful", token: authToken, user });
        });
    } catch (error) {
        console.error("❌ Error during login:", error);
        return res.status(500).json({ message: "Erreur serveur lors de la connexion", error: error.message });
    }
};

// Connexion avec Face ID
exports.loginWithFace = async (req, res) => {
    try {
        const { faceLabel } = req.body;
        if (!faceLabel) {
            return res.status(400).json({ message: "Le label de visage est requis." });
        }

        console.log("📢 Face ID Login Request:", { faceLabel });

        const user = await User.findOne({ faceLabel }).populate('role');
        if (!user) {
            console.log("❌ User not found for face label:", faceLabel);
            return res.status(400).json({ message: "Face ID not recognized" });
        }

        if (!user.role || !user.role.name) {
            console.log("❌ Rôle non trouvé pour l'utilisateur avec faceLabel:", faceLabel);
            return res.status(500).json({ message: "Rôle non trouvé pour cet utilisateur." });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role.name },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );
        console.log("📢 Token Generated (Face ID Login):", token);

        res.json({ token, user });
    } catch (error) {
        console.error("❌ Error logging in with Face ID:", error);
        res.status(500).json({ message: "Erreur serveur lors de la connexion avec Face ID", error: error.message });
    }
};

// Authentification Google
exports.googleAuth = async (req, res) => {
    const code = req.query.code;
    console.log("📢 Received Authorization Code:", code);

    try {
        if (!code) {
            console.error("❌ Error: Authorization code is missing");
            return res.status(400).json({ message: "Authorization code is required" });
        }

        const googleRes = await oauth2Client.getToken(code);
        console.log("📢 Google Token Response:", googleRes.tokens);

        oauth2Client.setCredentials(googleRes.tokens);
        const userRes = await axios.get(
            `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${googleRes.tokens.access_token}`
        );
        console.log("📢 Google User Info:", userRes.data);

        const { email, name, id: googleId } = userRes.data;
        let user = await User.findOne({ email });

        if (!user) {
            console.log("📢 Checking if Guest role exists...");
            const guestRole = await Role.findOne({ name: 'Guest' });
            if (!guestRole) {
                console.error("❌ Error: 'Guest' role not found");
                return res.status(500).json({ message: "Internal Server Error: Guest role not found" });
            }

            user = await User.create({
                firstname: name.split(' ')[0],
                lastname: name.split(' ')[1] || '',
                email,
                phone: '00000000',
                googleId,
                role: guestRole._id,
            });
            console.log("📢 New user created:", user);
        } else {
            console.log("📢 Existing user found:", user);
        }

        const { _id } = user;
        const token = jwt.sign(
            { _id, email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_TIMEOUT || '1h' }
        );
        console.log("📢 Generated JWT Token:", token);

        res.status(200).json({ message: "success", token, user });
    } catch (err) {
        console.error("❌ Google Auth Error:", err);
        res.status(500).json({ message: "Erreur lors de l'authentification Google", error: err.message });
    }
};

// Enregistrement d'un label de visage
exports.registerFaceLabel = async (req, res) => {
    try {
        const { email, faceLabel } = req.body;
        if (!email || !faceLabel) {
            return res.status(400).json({ message: "L'email et le label de visage sont requis." });
        }

        console.log("📢 Registering face label for email:", email);
        const user = await User.findOne({ email });
        if (!user) {
            console.log("❌ User not found for email:", email);
            return res.status(404).json({ message: "User not found" });
        }

        const existingUser = await User.findOne({ faceLabel });
        if (existingUser) {
            console.log("❌ Face label already in use:", faceLabel);
            return res.status(400).json({ message: "Face label already in use" });
        }

        user.faceLabel = faceLabel;
        await user.save();
        console.log("📢 Face label registered for user:", email);

        res.status(200).json({ message: "Face label registered successfully", user });
    } catch (error) {
        console.error("❌ Error registering face label:", error);
        res.status(500).json({ message: "Erreur serveur lors de l'enregistrement du label de visage", error: error.message });
    }
};

// Envoyer le code de réinitialisation
exports.sendResetCode = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "L'email est requis." });
        }

        console.log("📢 Sending reset code to email:", email);
        const user = await User.findOne({ email });
        if (!user) {
            console.log("❌ Email not found:", email);
            return res.status(404).json({ message: "Email not found" });
        }

        const resetCode = Math.floor(10000 + Math.random() * 90000).toString();
        const resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
        user.resetCode = resetCode;
        user.resetCodeExpires = resetCodeExpires;
        await user.save();
        console.log("📢 Reset code generated:", resetCode);

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Password Reset Code",
            text: `Your password reset code is: ${resetCode}`
        };

        await transporter.sendMail(mailOptions);
        console.log("📢 Reset code sent to email:", email);

        res.status(200).json({ message: "Reset code sent to email" });
    } catch (error) {
        console.error("❌ Error sending reset code:", error);
        res.status(500).json({ message: "Erreur serveur lors de l'envoi du code de réinitialisation", error: error.message });
    }
};

// Vérifier le code de réinitialisation
exports.verifyResetCode = async (req, res) => {
    try {
        const { email, resetCode } = req.body;
        if (!email || !resetCode) {
            return res.status(400).json({ message: "L'email et le code de réinitialisation sont requis." });
        }

        console.log("📢 Verifying reset code for email:", email);
        const user = await User.findOne({ email, resetCode });
        if (!user || user.resetCodeExpires < new Date()) {
            console.log("❌ Invalid or expired reset code for email:", email);
            return res.status(400).json({ message: "Invalid or expired reset code" });
        }

        console.log("📢 Reset code verified for email:", email);
        res.status(200).json({ message: "Reset code verified" });
    } catch (error) {
        console.error("❌ Error verifying reset code:", error);
        res.status(500).json({ message: "Erreur serveur lors de la vérification du code", error: error.message });
    }
};

// Réinitialiser le mot de passe
exports.resetPassword = async (req, res) => {
    try {
        const { email, resetCode, newPassword } = req.body;
        if (!email || !resetCode || !newPassword) {
            return res.status(400).json({ message: "L'email, le code de réinitialisation et le nouveau mot de passe sont requis." });
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            console.log("❌ Validation failed: New password does not meet requirements");
            return res.status(400).json({ message: "Password must be at least 8 characters long, and contain 1 uppercase letter, 1 lowercase letter, and 1 number" });
        }

        console.log("📢 Resetting password for email:", email);
        const user = await User.findOne({ email, resetCode });
        if (!user || user.resetCodeExpires < new Date()) {
            console.log("❌ Invalid or expired reset code for email:", email);
            return res.status(400).json({ message: "Invalid or expired reset code" });
        }

        user.password = newPassword;
        user.resetCode = null;
        user.resetCodeExpires = null;
        await user.save();
        console.log("📢 Password reset for email:", email);

        res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
        console.error("❌ Error resetting password:", error);
        res.status(500).json({ message: "Erreur serveur lors de la réinitialisation du mot de passe", error: error.message });
    }
};

// Récupérer tous les utilisateurs
exports.getUsers = async (req, res) => {
    try {
        console.log("📢 Fetching all users...");
        const users = await User.find().populate('role', 'name');
        if (!users || users.length === 0) {
            console.log("❌ No users found.");
            return res.status(404).json({ message: "No users found" });
        }

        console.log("📢 Users fetched:", users.length);
        res.status(200).json(users);
    } catch (error) {
        console.error("❌ Error fetching users:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des utilisateurs", error: error.message });
    }
};

// Mettre à jour un utilisateur
exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^[+]?[\d\s-]{8,15}$/;

        if (updates.email && !emailRegex.test(updates.email)) {
            console.log("❌ Validation failed: Invalid email format");
            return res.status(400).json({ message: "Invalid email format" });
        }

        if (updates.phone && !phoneRegex.test(updates.phone)) {
            console.log("❌ Validation failed: Invalid phone number format");
            return res.status(400).json({ message: "Invalid phone number format" });
        }

        if (updates.password) {
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
            if (!passwordRegex.test(updates.password)) {
                console.log("❌ Validation failed: Password does not meet requirements");
                return res.status(400).json({ message: "Password must be at least 8 characters long, and contain 1 uppercase letter, 1 lowercase letter, and 1 number" });
            }
            updates.password = await argon2.hash(updates.password);
        }

        console.log("📢 Updating user with ID:", id);
        const updatedUser = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
        if (!updatedUser) {
            console.log("❌ User not found with ID:", id);
            return res.status(404).json({ message: "User not found" });
        }

        console.log("📢 User updated:", updatedUser);
        res.status(200).json(updatedUser);
    } catch (error) {
        console.error("❌ Update error:", error);
        res.status(500).json({ message: "Erreur lors de la mise à jour de l'utilisateur", error: error.message });
    }
};

// Récupérer un utilisateur par ID
exports.getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            console.log("❌ Invalid user ID:", id);
            return res.status(400).json({ message: "Invalid user ID" });
        }

        console.log("📢 Fetching user with ID:", id);
        const user = await User.findById(id).select("-password").populate('role', 'name');
        if (!user) {
            console.log("❌ User not found with ID:", id);
            return res.status(404).json({ message: "User not found" });
        }

        console.log("📢 User fetched:", user);
        res.status(200).json(user);
    } catch (error) {
        console.error("❌ Error fetching user by ID:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération de l'utilisateur", error: error.message });
    }
};

// Supprimer un utilisateur
exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            console.log("❌ Invalid user ID:", id);
            return res.status(400).json({ message: "Invalid user ID" });
        }

        console.log("📢 Deleting user with ID:", id);
        const deletedUser = await User.findByIdAndDelete(id);
        if (!deletedUser) {
            console.log("❌ User not found with ID:", id);
            return res.status(404).json({ message: "User not found" });
        }

        console.log("📢 User deleted:", id);
        res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
        console.error("❌ Delete error:", error);
        res.status(500).json({ message: "Erreur lors de la suppression de l'utilisateur", error: error.message });
    }
};