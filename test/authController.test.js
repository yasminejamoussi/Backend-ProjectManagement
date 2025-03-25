const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { generateStrongPassword, generate2FA, enable2FA, verify2FA, register, login, loginWithFace, googleAuth, registerFaceLabel, sendResetCode, verifyResetCode, resetPassword, getUsers, updateUser, getUserById, deleteUser } = require("../src/controllers/authController");
const User = require("../src/models/User");
const Role = require("../src/models/Role");
const LoginAttempt = require("../src/models/LoginAttempt");
const { spawn } = require("child_process");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const nodemailer = require("nodemailer");

// Mock des dépendances
jest.mock("../src/models/User");
jest.mock("../src/models/Role");
jest.mock("../src/models/LoginAttempt");
jest.mock("child_process");
jest.mock("speakeasy");
jest.mock("qrcode");
jest.mock("jsonwebtoken");
jest.mock("axios");
jest.mock("nodemailer");
jest.mock("../src/utils/googleClient", () => ({
    oauth2Client: {
        getToken: jest.fn(),
        setCredentials: jest.fn(),
    }
}));

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
        app.post("/api/auth/login-face", loginWithFace);
        app.get("/api/auth/google", googleAuth);
        app.post("/api/auth/register-face", registerFaceLabel);
        app.post("/api/auth/send-reset-code", sendResetCode);
        app.post("/api/auth/verify-reset-code", verifyResetCode);
        app.post("/api/auth/reset-password", resetPassword);
        app.get("/api/auth/users", getUsers);
        app.put("/api/auth/users/:id", updateUser);
        app.get("/api/auth/users/:id", getUserById);
        app.delete("/api/auth/users/:id", deleteUser);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Test pour generateStrongPassword
    it("should generate a strong password", async () => {
        const mockPassword = "StrongPass123!";
        spawn.mockReturnValue({
            stdout: {
                on: jest.fn((event, callback) => {
                    if (event === "data") callback(mockPassword);
                }),
            },
            stderr: { on: jest.fn() },
            on: jest.fn((event, callback) => {
                if (event === "close") callback(0);
            }),
        });

        const res = await request(app).post("/api/auth/generate-password");
        expect(res.status).toBe(200);
        expect(res.body.password).toBe(mockPassword);
    });

    it("should handle Python script error in generateStrongPassword", async () => {
        spawn.mockReturnValue({
            stdout: { on: jest.fn() },
            stderr: {
                on: jest.fn((event, callback) => {
                    if (event === "data") callback("Python error");
                }),
            },
            on: jest.fn(),
        });

        const res = await request(app).post("/api/auth/generate-password");
        expect(res.status).toBe(500);
        expect(res.body.error).toContain("Python error");
    });

    // Test pour generate2FA
    it("should generate 2FA QR code", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockResolvedValue(mockUser);
        speakeasy.generateSecret.mockReturnValue({ base32: "SECRET" });
        QRCode.toDataURL.mockImplementation((url, callback) => callback(null, "qrcode-data"));

        const res = await request(app)
            .post("/api/auth/generate-2fa")
            .send({ email: "test@example.com" });

        expect(res.status).toBe(200);
        expect(res.body.qrCode).toBe("qrcode-data");
        expect(res.body.secret).toBe("SECRET");
        expect(mockUser.twoFactorTempSecret).toBe("SECRET");
        expect(mockUser.save).toHaveBeenCalled();
    });

    it("should fail to generate 2FA if user not found", async () => {
        User.findOne.mockResolvedValue(null);

        const res = await request(app)
            .post("/api/auth/generate-2fa")
            .send({ email: "test@example.com" });

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Utilisateur non trouvé.");
    });

    // Test pour enable2FA
    it("should enable 2FA", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            twoFactorTempSecret: "SECRET",
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockResolvedValue(mockUser);
        speakeasy.totp.verify.mockReturnValue(true);

        const res = await request(app)
            .post("/api/auth/enable-2fa")
            .send({ email: "test@example.com", token: "123456" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("2FA activé avec succès !");
        expect(mockUser.twoFactorSecret).toBe("SECRET");
        expect(mockUser.isTwoFactorEnabled).toBe(true);
        expect(mockUser.twoFactorTempSecret).toBe(null);
        expect(mockUser.save).toHaveBeenCalled();
    });

    it("should fail to enable 2FA with invalid token", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            twoFactorTempSecret: "SECRET",
        };
        User.findOne.mockResolvedValue(mockUser);
        speakeasy.totp.verify.mockReturnValue(false);

        const res = await request(app)
            .post("/api/auth/enable-2fa")
            .send({ email: "test@example.com", token: "123456" });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Code de vérification invalide.");
    });

    // Test pour verify2FA
    it("should verify 2FA and return token", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            isTwoFactorEnabled: true,
            twoFactorSecret: "SECRET",
            role: { name: "Admin" },
        };
        User.findOne.mockResolvedValue(mockUser);
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
            isTwoFactorEnabled: false,
        };
        User.findOne.mockResolvedValue(mockUser);

        const res = await request(app)
            .post("/api/auth/verify-2fa")
            .send({ email: "test@example.com", token: "123456" });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("2FA non activé pour cet utilisateur.");
    });

    // Test pour register
    it("should register a new user", async () => {
        const mockRole = {
            _id: new mongoose.Types.ObjectId(),
            name: "Admin",
            save: jest.fn().mockResolvedValue(true),
        };
        Role.findOne.mockResolvedValue(mockRole);
        User.findOne.mockResolvedValue(null);
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
        expect(res.body.message).toBe("User registered successfully");
        expect(res.body.user).toBeDefined();
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
        expect(res.body.message).toBe("Email already exists");
    });

    // Test pour login
    it("should login successfully", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            password: "hashed-password",
            role: { name: "Admin" },
            blocked: false,
            anomaly_count: 0,
        };
        User.findOne.mockResolvedValue(mockUser);
        User.updateOne.mockResolvedValue({});
        LoginAttempt.create.mockResolvedValue({});
        require("argon2").verify.mockResolvedValue(true);
        spawn.mockReturnValue({
            stdout: {
                on: jest.fn((event, callback) => {
                    if (event === "data") callback("success");
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
            .send({ email: "test@example.com", password: "Password123" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Login successful");
        expect(res.body.token).toBe("mock-token");
    });

    it("should fail login with invalid credentials", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            password: "hashed-password",
            role: { name: "Admin" },
            blocked: false,
            anomaly_count: 0,
        };
        User.findOne.mockResolvedValue(mockUser);
        User.updateOne.mockResolvedValue({});
        LoginAttempt.create.mockResolvedValue({});
        require("argon2").verify.mockResolvedValue(false);

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "test@example.com", password: "WrongPassword" });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid credentials");
    });

    // Test pour loginWithFace
    it("should login with face ID", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            faceLabel: "face123",
            role: { name: "Admin" },
        };
        User.findOne.mockResolvedValue(mockUser);
        jwt.sign.mockReturnValue("mock-token");

        const res = await request(app)
            .post("/api/auth/login-face")
            .send({ faceLabel: "face123" });

        expect(res.status).toBe(200);
        expect(res.body.token).toBe("mock-token");
    });

    // Test pour googleAuth
    it("should authenticate with Google", async () => {
        const mockRole = { _id: new mongoose.Types.ObjectId(), name: "Guest" };
        Role.findOne.mockResolvedValue(mockRole);
        User.findOne.mockResolvedValue(null);
        User.create.mockResolvedValue({ _id: new mongoose.Types.ObjectId(), email: "test@example.com" });
        require("../src/utils/googleClient").oauth2Client.getToken.mockResolvedValue({ tokens: { access_token: "mock-token" } });
        axios.get.mockResolvedValue({ data: { email: "test@example.com", name: "Test User", id: "google123" } });
        jwt.sign.mockReturnValue("mock-token");

        const res = await request(app)
            .get("/api/auth/google")
            .query({ code: "mock-code" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("success");
        expect(res.body.token).toBe("mock-token");
    });

    // Test pour registerFaceLabel
    it("should register face label", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne
            .mockResolvedValueOnce(mockUser) // Pour email
            .mockResolvedValueOnce(null);   // Pour faceLabel
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
        expect(mockUser.save).toHaveBeenCalled();
    });

    // Test pour verifyResetCode
    it("should verify reset code", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            resetCode: "12345",
            resetCodeExpires: new Date(Date.now() + 1000 * 60 * 10),
        };
        User.findOne.mockResolvedValue(mockUser);

        const res = await request(app)
            .post("/api/auth/verify-reset-code")
            .send({ email: "test@example.com", resetCode: "12345" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Reset code verified");
    });

    // Test pour resetPassword
    it("should reset password", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            resetCode: "12345",
            resetCodeExpires: new Date(Date.now() + 1000 * 60 * 10),
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockResolvedValue(mockUser);

        const res = await request(app)
            .post("/api/auth/reset-password")
            .send({ email: "test@example.com", resetCode: "12345", newPassword: "NewPassword123" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Password reset successfully");
        expect(mockUser.password).toBe("NewPassword123");
        expect(mockUser.resetCode).toBe(null);
        expect(mockUser.resetCodeExpires).toBe(null);
        expect(mockUser.save).toHaveBeenCalled();
    });

    // Test pour getUsers
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
        };
        User.findByIdAndUpdate.mockResolvedValue(mockUser);

        const res = await request(app)
            .put("/api/auth/users/123")
            .send({ firstname: "Johnny" });

        expect(res.status).toBe(200);
        expect(res.body.firstname).toBe("John");
    });

    // Test pour getUserById
    it("should get user by ID", async () => {
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
        };
        User.findById.mockReturnValue({
            select: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockUser),
            }),
        });

        const res = await request(app).get("/api/auth/users/123");
        expect(res.status).toBe(200);
        expect(res.body.email).toBe("test@example.com");
    });

    // Test pour deleteUser
    it("should delete user", async () => {
        User.findByIdAndDelete.mockResolvedValue({ _id: "123" });

        const res = await request(app).delete("/api/auth/users/123");
        expect(res.status).toBe(200);
        expect(res.body.message).toBe("User deleted successfully");
    });
});