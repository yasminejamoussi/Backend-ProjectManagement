const express = require("express");
const router = express.Router();
const userController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const {register,registerFaceLabel, googleAuth,sendResetCode,verifyResetCode,resetPassword ,loginWithFace ,generate2FA,generateStrongPassword,login,getGoogleAuthUrl,googleAuthCallback} = require('../controllers/authController');

// Auth Routes
router.post("/register", register);
router.post("/login", login);
//router.get("/google", googleAuth);
router.get("/google", getGoogleAuthUrl); // Generate OAuth URL
router.get("/google/callback", googleAuthCallback); // Handle OAuth callback
router.post('/login-with-face',loginWithFace );
router.post("/register-face-label", registerFaceLabel);

// Password Reset Routes
router.post("/forgot-password", sendResetCode);
router.post("/verify-code", verifyResetCode);
router.post("/reset-password", resetPassword);
///crud
router.get("/users/best-weekly" , userController.getBestWeeklyUser);
router.get("/users/best-weekly-per-project" , userController.getBestWeeklyUserPerProject);
router.get("/users/by-role", userController.getUsersByRole);


router.get("/users", userController.getUsers); 
router.get("/users/:id", userController.getUserById); 
router.put("/users/:id", userController.updateUser); 
router.delete("/users/:id",userController.deleteUser);



//2FA
router.post("/generate-2fa",userController.generate2FA);  
router.post("/enable-2fa",userController.enable2FA);  
router.post("/verify-2fa", userController.verify2FA);  
router.post("/disable-2fa", userController.disable2FA);
// Password Generator
router.get("/generate-password", generateStrongPassword);

module.exports = router;