// Charger les variables d'environnement avant tout
require("dotenv").config();

// Définir les variables d'environnement pour les tests
process.env.EMAIL_USER = "test@example.com";
process.env.EMAIL_PASSWORD = "password";
process.env.JWT_SECRET = "secret";
process.env.JWT_EXPIRES_IN = "1h";

// Imports après la configuration des variables d'environnement
const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");

const jwt = require("jsonwebtoken");
const { spawn } = require("child_process");
const {
    register,
    login,
    getUsers: getUsers, // Renommer pour correspondre à l'export
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
        app.post("/api/auth/register", register);
        app.post("/api/auth/login", login);
        app.get("/api/auth/users", getUsers);
        app.put("/api/auth/users/:id", updateUser);
        app.delete("/api/auth/users/:id", deleteUser);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Test pour register
    it("should register a new user", async () => {
        User.findOne.mockResolvedValue(null); // Aucun utilisateur existant
        const mockRole = {
            _id: new mongoose.Types.ObjectId(),
            name: "Admin",
            save: jest.fn().mockResolvedValue(true),
        };
        Role.findOne.mockResolvedValue(mockRole); // Rôle Admin trouvé
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
        expect(res.body.message).toBe("User registered successfully"); // Message en anglais
        expect(mockUser.save).toHaveBeenCalled();
    });

    it("should fail to register if email exists", async () => {
        User.findOne.mockResolvedValue({ email: "john@example.com" }); // Utilisateur existant

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
        expect(res.body.message).toBe("Email already exists"); // Message en anglais
    });

    // Test pour login
    it("should login successfully", async () => {
        const mockRole = {
            _id: new mongoose.Types.ObjectId(),
            name: "Admin",
        };
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            password: "hashedPassword",
            role: mockRole,
            isTwoFactorEnabled: false,
            blocked: false,
            blocked_until: null,
            anomaly_count: 0,
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockUser),
        });
        User.updateOne.mockResolvedValue({ modifiedCount: 1 }); // Simuler une mise à jour réussie
        User.findById.mockResolvedValue(mockUser); // Pour le refreshedUser
        LoginAttempt.create.mockResolvedValue({});
        jest.spyOn(require("argon2"), "verify").mockResolvedValue(true); // Mot de passe correct
        spawn.mockReturnValue({
            stdout: {
                on: jest.fn((event, callback) => {
                    if (event === "data") callback("[]"); // Aucune tentative suspecte
                }),
            },
            stderr: { on: jest.fn() },
            on: jest.fn((event, callback) => {
                if (event === "close") callback(0); // Simuler la fin du processus Python
            }),
        });
        jwt.sign.mockReturnValue("mock-token");

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "test@example.com", password: "password" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Login successful");
        expect(res.body.token).toBe("mock-token");
    });

    it("should fail login with invalid credentials", async () => {
        const mockRole = {
            _id: new mongoose.Types.ObjectId(),
            name: "Admin",
        };
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            password: "hashedPassword",
            role: mockRole,
            isTwoFactorEnabled: false,
            blocked: false,
            blocked_until: null,
            anomaly_count: 0,
            save: jest.fn().mockResolvedValue(true),
        };
        User.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockUser),
        });
        User.updateOne.mockResolvedValue({ modifiedCount: 1 }); // Simuler une mise à jour réussie
        User.findById.mockResolvedValue(mockUser); // Pour le refreshedUser
        LoginAttempt.create.mockResolvedValue({});
        jest.spyOn(require("argon2"), "verify").mockResolvedValue(false); // Mot de passe incorrect
        spawn.mockReturnValue({
            stdout: {
                on: jest.fn((event, callback) => {
                    if (event === "data") callback("[]"); // Aucune tentative suspecte
                }),
            },
            stderr: { on: jest.fn() },
            on: jest.fn((event, callback) => {
                if (event === "close") callback(0); // Simuler la fin du processus Python
            }),
        });

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "test@example.com", password: "wrong" });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid credentials");
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
        };
        User.findByIdAndUpdate.mockResolvedValue({
            ...mockUser,
            firstname: "Jane",
        }); // Simuler la mise à jour

        const res = await request(app)
            .put(`/api/auth/users/${mockUser._id.toString()}`)
            .send({ firstname: "Jane" });

        expect(res.status).toBe(200);
        expect(res.body.firstname).toBe("Jane");
    });
    // Test pour deleteUser
    it("should delete user", async () => {
        const userId = new mongoose.Types.ObjectId();
        User.findById.mockResolvedValue({ _id: userId });
        User.findByIdAndDelete.mockResolvedValue({ _id: userId });

        const res = await request(app).delete(`/api/auth/users/${userId}`);
        expect(res.status).toBe(200);
        expect(res.body.message).toBe("User deleted successfully");
    });
});