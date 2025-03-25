// Charger les variables d'environnement avant tout
require("dotenv").config();

// Définir les variables d'environnement pour les tests
process.env.EMAIL_USER = "test@example.com";
process.env.EMAIL_PASSWORD = "password";
process.env.JWT_SECRET = "secret";

// Imports après la configuration des variables d'environnement
const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const jwt = require("jsonwebtoken");
const { spawn } = require("child_process");
const {
    generateStrongPassword,
    generate2FA,
    enable2FA,
    verify2FA,
    register,
    login,
    loginWithFaceID,
    googleAuth,
    registerFaceLabel,
    sendResetCode,
    verifyResetCode,
    resetPassword,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser,
} = require("../src/controllers/authController");
const User = require("../src/models/User");
const Role = require("../src/models/Role");
const LoginAttempt = require("../src/models/LoginAttempt");

// Mock des dépendances
jest.mock("../src/models/User");
jest.mock("../src/models/Role");
jest.mock("../src/models/LoginAttempt");
jest.mock("child_process");
jest.mock("nodemailer");
jest.mock("speakeasy");
jest.mock("qrcode");
jest.mock("jsonwebtoken");
jest.mock("argon2");

describe("Auth Controller Tests", () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.post("/api/auth/generate-password", generateStrongPassword);
        app.post("/api/auth/generate-2fa", generate2FA);
        app.post("/api/auth/enable-2fa", enable2FA);
        app.post("/api/auth/verify-2fa", verify2FA);
        app.post("/api/auth/register", register);
        app.post("/api/auth/login", login);
        app.post("/api/auth/login-faceid", loginWithFaceID);
        app.post("/api/auth/google", googleAuth);
        app.post("/api/auth/register-face", registerFaceLabel);
        app.post("/api/auth/send-reset-code", sendResetCode);
        app.post("/api/auth/verify-reset-code", verifyResetCode);
        app.post("/api/auth/reset-password", resetPassword);
        app.get("/api/auth/users", getAllUsers);
        app.get("/api/auth/users/:id", getUserById);
        app.put("/api/auth/users/:id", updateUser);
        app.delete("/api/auth/users/:id", deleteUser);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Test pour generateStrongPassword
    it("should generate a strong password", async () => {
        spawn.mockReturnValue({
            stdout: {
                on: jest.fn((event, callback) => {
                    if (event === "data") callback("StrongPass123!");
                }),
            },
            stderr: { on: jest.fn() },
            on: jest.fn((event, callback) => {
                if (event === "close") callback(0);
            }),
        });

        const res = await request(app).post("/api/auth/generate-password");
        expect(res.status).toBe(200);
        expect(res.body.password).toBe("StrongPass123!");
    });

    it("should handle Python script error in generateStrongPassword", async () => {
        spawn.mockReturnValue({
            stdout: { on: jest.fn() },
            stderr: {
                on: jest.fn((event, callback) => {
                    if (event === "data") callback("Python error");
                }),
            },
            on: jest.fn((event, callback) => {
                if (event === "close") callback(1);
            }),
        });

        const res = await request(app).post("/api/auth/generate-password");
        expect(res.status).toBe(500);
        expect(res.body.error).toContain("Erreur lors de l'exécution du script Python");
    });

    // Test pour generate2FA
    it("should generate 2FA QR code", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            twoFactorSecret: null,
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockResolvedValue(mockUser);
        speakeasy.generateSecret.mockReturnValue({ base32: "SECRET" });
        qrcode.toDataURL.mockResolvedValue("mock-qr-code");

        const res = await request(app)
            .post("/api/auth/generate-2fa")
            .send({ email: "test@example.com" });

        expect(res.status).toBe(200);
        expect(res.body.qrCode).toBe("mock-qr-code");
        expect(mockUser.twoFactorSecret).toBe("SECRET");
        expect(mockUser.save).toHaveBeenCalled();
    });

    it("should fail to generate 2FA if user not found", async () => {
        User.findOne.mockResolvedValue(null);

        const res = await request(app)
            .post("/api/auth/generate-2fa")
            .send({ email: "test@example.com" });

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Utilisateur non trouvé");
    });

    // Test pour enable2FA
    it("should enable 2FA", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            twoFactorSecret: "SECRET",
            twoFactorEnabled: false,
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockResolvedValue(mockUser);
        speakeasy.totp.verify.mockReturnValue(true);

        const res = await request(app)
            .post("/api/auth/enable-2fa")
            .send({ email: "test@example.com", token: "123456" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("2FA activé avec succès");
        expect(mockUser.twoFactorEnabled).toBe(true);
        expect(mockUser.save).toHaveBeenCalled();
    });

    it("should fail to enable 2FA with invalid token", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            twoFactorSecret: "SECRET",
            twoFactorEnabled: false,
        };
        User.findOne.mockResolvedValue(mockUser);
        speakeasy.totp.verify.mockReturnValue(false);

        const res = await request(app)
            .post("/api/auth/enable-2fa")
            .send({ email: "test@example.com", token: "123456" });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Code de vérification invalide");
    });

    // Test pour verify2FA
    it("should verify 2FA and return token", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            twoFactorSecret: "SECRET",
            twoFactorEnabled: true,
            role: new mongoose.Types.ObjectId(),
        };
        User.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockUser),
        });
        speakeasy.totp.verify.mockReturnValue(true);
        jwt.sign.mockReturnValue("mock-token");

        const res = await request(app)
            .post("/api/auth/verify-2fa")
            .send({ email: "test@example.com", token: "123456" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Authentification réussie");
        expect(res.body.token).toBe("mock-token");
    });

    it("should fail to verify 2FA if not enabled", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            twoFactorSecret: "SECRET",
            twoFactorEnabled: false,
        };
        User.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockUser),
        });

        const res = await request(app)
            .post("/api/auth/verify-2fa")
            .send({ email: "test@example.com", token: "123456" });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("2FA non activé pour cet utilisateur.");
    });

    // Test pour register
    it("should register a new user", async () => {
        User.findOne.mockResolvedValue(null);
        const mockRole = {
            _id: new mongoose.Types.ObjectId(),
            name: "Admin",
            save: jest.fn().mockResolvedValue(true),
        };
        Role.findOne.mockResolvedValue(mockRole);
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            firstname: "John",
            lastname: "Doe",
            email: "john@example.com",
            phone: "+123456789",
            password: "Password123",
            role: mockRole._id,
            save: jest.fn().mockResolvedValue(true),
        };
        User.mockImplementation(() => mockUser);

        const res = await request(app)
            .post("/api/auth/register")
            .send({
                firstname: "John",
                lastname: "Doe",
                email: "john@example.com",
                phone: "+123456789",
                password: "Password123",
            });

        expect(res.status).toBe(201);
        expect(res.body.message).toBe("Utilisateur créé avec succès");
        expect(mockUser.save).toHaveBeenCalled();
    });

    it("should fail to register if email exists", async () => {
        User.findOne.mockResolvedValue({ email: "john@example.com" });

        const res = await request(app)
            .post("/api/auth/register")
            .send({
                firstname: "John",
                lastname: "Doe",
                email: "john@example.com",
                phone: "+123456789",
                password: "Password123",
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Un utilisateur avec cet email existe déjà");
    });

    // Test pour login
    it("should login successfully", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            password: "hashedPassword",
            role: new mongoose.Types.ObjectId(),
            loginAttempts: 0,
            lockUntil: null,
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockUser),
        });
        User.updateOne.mockResolvedValue({});
        LoginAttempt.create.mockResolvedValue({});
        jest.spyOn(require("argon2"), "verify").mockResolvedValue(true);
        spawn.mockReturnValue({
            stdout: {
                on: jest.fn((event, callback) => {
                    if (event === "data") callback("[]");
                }),
            },
            stderr: { on: jest.fn() },
            on: jest.fn((event, callback) => {
                if (event === "close") callback(0);
            }),
        });
        jwt.sign.mockReturnValue("mock-token");

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "test@example.com", password: "password" });

        expect(res.status).toBe(200);
        expect(res.body.token).toBe("mock-token");
    });

    it("should fail login with invalid credentials", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            password: "hashedPassword",
            loginAttempts: 0,
            lockUntil: null,
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockUser),
        });
        User.updateOne.mockResolvedValue({});
        LoginAttempt.create.mockResolvedValue({});
        jest.spyOn(require("argon2"), "verify").mockResolvedValue(false);

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "test@example.com", password: "wrong" });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe("Email ou mot de passe incorrect");
    });

    // Test pour loginWithFaceID
    it("should login with face ID", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            faceLabel: "face123",
            role: new mongoose.Types.ObjectId(),
        };
        User.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockUser),
        });
        jwt.sign.mockReturnValue("mock-token");

        const res = await request(app)
            .post("/api/auth/login-faceid")
            .send({ faceLabel: "face123" });

        expect(res.status).toBe(200);
        expect(res.body.token).toBe("mock-token");
    });

    // Test pour googleAuth
    it("should authenticate with Google", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
        };
        User.findOne.mockResolvedValue(null);
        User.mockImplementation(() => mockUser);
        const mockRole = { _id: new mongoose.Types.ObjectId(), name: "Guest" };
        Role.findOne.mockResolvedValue(mockRole);
        jwt.sign.mockReturnValue("mock-token");

        const res = await request(app)
            .post("/api/auth/google")
            .send({ code: "mock-code" });

        expect(res.status).toBe(200);
        expect(res.body.token).toBe("mock-token");
    });

    // Test pour registerFaceLabel
    it("should register face label", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            faceLabel: null,
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockResolvedValue(mockUser);

        const res = await request(app)
            .post("/api/auth/register-face")
            .send({ email: "test@example.com", faceLabel: "face123" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Face label registered successfully");
        expect(mockUser.faceLabel).toBe("face123");
        expect(mockUser.save).toHaveBeenCalled();
    });

    // Test pour sendResetCode
    it("should send reset code", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            resetCode: null,
            resetCodeExpires: null,
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockResolvedValue(mockUser);
        nodemailer.createTransport.mockReturnValue({
            sendMail: jest.fn().mockResolvedValue(true),
        });

        const res = await request(app)
            .post("/api/auth/send-reset-code")
            .send({ email: "test@example.com" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Reset code sent to email");
        expect(mockUser.resetCode).toBeDefined();
        expect(mockUser.resetCodeExpires).toBeDefined();
    });

    // Test pour verifyResetCode
    it("should verify reset code", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            resetCode: "12345",
            resetCodeExpires: Date.now() + 3600000,
        };
        User.findOne.mockResolvedValue(mockUser);

        const res = await request(app)
            .post("/api/auth/verify-reset-code")
            .send({ email: "test@example.com", code: "12345" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Code verified successfully");
    });

    // Test pour resetPassword
    it("should reset password", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            resetCode: "12345",
            resetCodeExpires: Date.now() + 3600000,
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockResolvedValue(mockUser);

        const res = await request(app)
            .post("/api/auth/reset-password")
            .send({ email: "test@example.com", code: "12345", newPassword: "NewPass123" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Password reset successfully");
        expect(mockUser.password).toBe("NewPass123");
        expect(mockUser.resetCode).toBeNull();
        expect(mockUser.resetCodeExpires).toBeNull();
    });

    // Test pour getAllUsers
    it("should get all users", async () => {
        const mockUsers = [
            { _id: new mongoose.Types.ObjectId(), email: "test1@example.com" },
            { _id: new mongoose.Types.ObjectId(), email: "test2@example.com" },
        ];
        User.find.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockUsers),
        });

        const res = await request(app).get("/api/auth/users");
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
    });

    // Test pour updateUser
    it("should update user", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            firstname: "John",
            save: jest.fn().mockResolvedValue(true),
        };
        User.findById.mockResolvedValue(mockUser);

        const res = await request(app)
            .put(`/api/auth/users/${mockUser._id}`)
            .send({ firstname: "Jane" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("User updated successfully");
        expect(mockUser.firstname).toBe("Jane");
    });

    // Test pour getUserById
    it("should get user by ID", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
        };
        User.findById.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockUser),
        });

        const res = await request(app).get(`/api/auth/users/${mockUser._id}`);
        expect(res.status).toBe(200);
        expect(res.body.email).toBe("test@example.com");
    });

    // Test pour deleteUser
    it("should delete user", async () => {
        const userId = new mongoose.Types.ObjectId();
        User.findById.mockResolvedValue({ _id: userId });
        User.findByIdAndDelete.mockResolvedValue({});

        const res = await request(app).delete(`/api/auth/users/${userId}`);
        expect(res.status).toBe(200);
        expect(res.body.message).toBe("User deleted successfully");
    });
});