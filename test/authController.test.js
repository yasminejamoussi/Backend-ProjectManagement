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
    register,
    login,
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
        app.post("/api/auth/register", register);
        app.post("/api/auth/login", login);
        app.get("/api/auth/users", getAllUsers);
        app.get("/api/auth/users/:id", getUserById);
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
        expect(res.body.message).toBe("Utilisateur créé avec succès");
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
        jest.spyOn(require("argon2"), "verify").mockResolvedValue(true); // Mot de passe correct
        spawn.mockReturnValue({
            stdout: {
                on: jest.fn((event, callback) => {
                    if (event === "data") callback("[]"); // Aucune tentative suspecte
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
        jest.spyOn(require("argon2"), "verify").mockResolvedValue(false); // Mot de passe incorrect

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "test@example.com", password: "wrong" });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe("Email ou mot de passe incorrect");
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
        User.findById.mockResolvedValue(mockUser); // Retourner directement l'utilisateur

        const res = await request(app)
            .put(`/api/auth/users/${mockUser._id}`)
            .send({ firstname: "Jane" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("User updated successfully");
        expect(mockUser.firstname).toBe("Jane");
        expect(mockUser.save).toHaveBeenCalled();
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