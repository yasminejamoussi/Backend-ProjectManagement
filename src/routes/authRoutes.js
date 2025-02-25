const express = require("express");
const router = express.Router();
const userController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const { googleAuth,sendResetCode,verifyResetCode,resetPassword,facebookAuth ,loginWithFace } = require('../controllers/authController');

// Auth Routes
router.post("/register", userController.register);
router.post("/login", userController.login);
router.get("/profile", authMiddleware, userController.getProfile);
router.get("/google", googleAuth);
router.post('/facebook',facebookAuth);
router.post('/login-with-face',loginWithFace );
router.post("/register-face-label", userController.registerFaceLabel);
// Password Reset Routes
router.post("/forgot-password", sendResetCode);
router.post("/verify-code", verifyResetCode);
router.post("/reset-password", resetPassword);

module.exports = router;
