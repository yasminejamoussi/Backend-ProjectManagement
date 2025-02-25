const User = require("../models/User");
const argon2 = require('argon2'); 
const jwt = require("jsonwebtoken");
const axios = require('axios');
const { oauth2Client } = require('../utils/googleClient');  // Assuming oauth2Client is set up
const crypto = require("crypto");
const nodemailer = require("nodemailer");

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

// Login a user
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
};
//face
// Login a user with Face ID
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
//facebook 
exports.facebookAuth = async (req, res) => {
    const { access_token } = req.body;
    console.log("Received Facebook Access Token:", access_token);
  
    try {
      if (!access_token) {
        console.error("Error: Access token is missing");
        return res.status(400).json({ message: "Access token is required" });
      }
  
      // Récupérer les informations de l'utilisateur depuis Facebook
      const userRes = await axios.get(`https://graph.facebook.com/me?fields=id,name,email&access_token=${access_token}`);
      console.log("Facebook User Info:", userRes.data);
  
      const { email, name, id: facebookId } = userRes.data;
  
      if (!email) {
        return res.status(400).json({ message: "Email is required from Facebook" });
      }
  
      let user = await User.findOne({ email });
  
      if (!user) {
        user = await User.create({
          firstname: name.split(' ')[0],
          lastname: name.split(' ')[1] || '',
          email,
          phone: '00000000',
          facebookId,
          role: 'Guest',
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
      console.error("Facebook Auth Error:", err);
      res.status(500).json({ message: "Internal Server Error" });
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

// Get all users
exports.getUsers = async (req, res) => {
    try {
        const users = await User.find();

        if (!users || users.length === 0) {
            return res.status(404).json({ message: "No users found" });
        }

        res.status(200).json(users);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Update a user
exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

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

// Get a user by ID
exports.getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const user = await User.findById(id).select("-password");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json(user);
    } catch (error) {
        console.error("Error fetching user by ID:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Delete a user
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
