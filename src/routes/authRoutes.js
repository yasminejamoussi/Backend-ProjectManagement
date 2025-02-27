const express = require("express");
const router = express.Router();
const userController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const { googleAuth,sendResetCode,verifyResetCode,resetPassword ,loginWithFace ,generate2FA,} = require('../controllers/authController');

// Auth Routes
router.post("/register", userController.register);
router.post("/login", userController.login);
router.get("/profile", authMiddleware, userController.getProfile);
router.get("/google", googleAuth);
router.post('/login-with-face',loginWithFace );
router.post("/register-face-label", userController.registerFaceLabel);

// Password Reset Routes
router.post("/forgot-password", sendResetCode);
router.post("/verify-code", verifyResetCode);
router.post("/reset-password", resetPassword);
///crud
router.get("/users", userController.getUsers); 
router.get("/users/:id", userController.getUserById); 
router.put("/users/:id", userController.updateUser); 
router.delete("/users/:id",userController.deleteUser);

//2FA
router.post("/generate-2fa", generate2FA);  
router.post("/enable-2fa",userController.enable2FA);  
router.post("/verify-2fa", userController.verify2FA);  


module.exports = router;
