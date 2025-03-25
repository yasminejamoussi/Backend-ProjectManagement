const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { initializeRoles, getRoles, createRole, updateRole, deleteRole, assignRoleToUser } = require("../src/controllers/roleController");
const Role = require("../src/models/Role");
const User = require("../src/models/User");

// Mock des dépendances
jest.mock("../src/models/Role");
jest.mock("../src/models/User");
jest.mock("mongoose", () => {
    const actualMongoose = jest.requireActual("mongoose");
    return {
        ...actualMongoose,
        connection: {
            readyState: 1, // Simuler une connexion prête
        },
        Types: actualMongoose.Types,
    };
});

describe("Role Controller Tests", () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.get("/api/roles", getRoles);
        app.post("/api/roles", createRole);
        app.put("/api/roles/:roleId", updateRole);
        app.delete("/api/roles/:roleId", deleteRole);
        app.post("/api/roles/assign", assignRoleToUser);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Test pour initializeRoles
    it("should initialize roles", async () => {
        Role.findOneAndUpdate.mockResolvedValue({});

        await expect(initializeRoles()).resolves.toBeUndefined();
        expect(Role.findOneAndUpdate).toHaveBeenCalledTimes(5); // 5 rôles prédéfinis
    });

    it("should throw error if MongoDB connection fails", async () => {
        // Mocker directement la propriété readyState
        Object.defineProperty(mongoose.connection, "readyState", {
            value: 0,
            writable: true,
        });

        // Simuler un nombre réduit de tentatives pour éviter un long timeout
        const maxAttempts = 2; // Réduire à 2 tentatives (au lieu de 10)
        jest.spyOn(global, "setTimeout").mockImplementation((callback) => {
            callback(); // Exécuter immédiatement
        });

        await expect(initializeRoles()).rejects.toThrow("Impossible de se connecter à MongoDB pour initialiser les rôles.");
    }, 10000); // Augmenter le timeout à 10 secondes

    // Test pour getRoles
    it("should get all roles", async () => {
        const mockRoles = [
            { _id: new mongoose.Types.ObjectId(), name: "Admin" },
            { _id: new mongoose.Types.ObjectId(), name: "Guest" },
        ];
        Role.find.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockRoles),
        });

        const res = await request(app).get("/api/roles");
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
    });

    it("should return 404 if no roles found", async () => {
        Role.find.mockReturnValue({
            populate: jest.fn().mockResolvedValue([]),
        });

        const res = await request(app).get("/api/roles");
        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Aucun rôle trouvé");
    });

    // Test pour createRole
    it("should create a new role", async () => {
        Role.findOne.mockResolvedValue(null);
        const mockRole = {
            _id: new mongoose.Types.ObjectId(),
            name: "TestRole",
            permissions: ["read"],
            save: jest.fn().mockResolvedValue(true),
        };
        Role.mockImplementation(() => mockRole);

        const res = await request(app)
            .post("/api/roles")
            .send({ name: "TestRole", permissions: ["read"] });

        expect(res.status).toBe(201);
        expect(res.body.message).toBe("Rôle créé avec succès");
        expect(mockRole.save).toHaveBeenCalled();
    });

    it("should fail to create role if name exists", async () => {
        Role.findOne.mockResolvedValue({ name: "TestRole" });

        const res = await request(app)
            .post("/api/roles")
            .send({ name: "TestRole", permissions: ["read"] });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Un rôle avec ce nom existe déjà.");
    });

    it("should fail to create role with invalid permissions", async () => {
        Role.findOne.mockResolvedValue(null);

        const res = await request(app)
            .post("/api/roles")
            .send({ name: "TestRole", permissions: ["invalid"] });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain("Permissions invalides");
    });

    // Test pour updateRole
    it("should update a role", async () => {
        const mockRole = {
            _id: new mongoose.Types.ObjectId(),
            name: "TestRole",
            permissions: ["read"],
            save: jest.fn().mockResolvedValue(true),
        };
        Role.findById.mockResolvedValue(mockRole);
        Role.findOne.mockResolvedValue(null);

        const res = await request(app)
            .put(`/api/roles/${mockRole._id}`)
            .send({ name: "UpdatedRole", permissions: ["read", "update"] });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Rôle mis à jour avec succès");
        expect(mockRole.name).toBe("UpdatedRole");
        expect(mockRole.permissions).toEqual(["read", "update"]);
        expect(mockRole.save).toHaveBeenCalled();
    });

    it("should fail to update role with invalid ID", async () => {
        const res = await request(app)
            .put("/api/roles/invalid-id")
            .send({ name: "UpdatedRole" });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("ID de rôle invalide");
    });

    // Test pour deleteRole
    it("should delete a role and reassign users", async () => {
        const mockRole = {
            _id: new mongoose.Types.ObjectId(), // Utiliser un vrai ObjectId
            name: "TestRole",
        };
        const mockGuestRole = {
            _id: new mongoose.Types.ObjectId(), // Utiliser un vrai ObjectId
            name: "Guest",
        };
        Role.findById.mockResolvedValue(mockRole);
        Role.findOne.mockResolvedValue(mockGuestRole);
        User.updateMany.mockResolvedValue({});
        Role.findByIdAndDelete.mockResolvedValue(mockRole);

        const res = await request(app).delete(`/api/roles/${mockRole._id}`);
        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Rôle supprimé avec succès");
        expect(User.updateMany).toHaveBeenCalledWith(
            { role: mockRole._id }, // S'assurer que c'est un ObjectId
            { role: mockGuestRole._id } // S'assurer que c'est un ObjectId
        );
    });

    it("should fail to delete Guest role", async () => {
        const mockRole = {
            _id: new mongoose.Types.ObjectId(),
            name: "Guest",
        };
        Role.findById.mockResolvedValue(mockRole);

        const res = await request(app).delete(`/api/roles/${mockRole._id}`);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Le rôle Guest ne peut pas être supprimé.");
    });

    // Test pour assignRoleToUser
    it("should assign role to user", async () => {
        const mockRole = {
            _id: new mongoose.Types.ObjectId(),
            name: "TestRole",
            users: [],
            save: jest.fn().mockResolvedValue(true),
        };
        const mockUser = {
            _id: new mongoose.Types.ObjectId(),
            email: "test@example.com",
            role: null,
            save: jest.fn().mockResolvedValue(true),
        };
        Role.findById.mockResolvedValue(mockRole);
        User.findById.mockResolvedValue(mockUser);

        const res = await request(app)
            .post("/api/roles/assign")
            .send({ roleId: mockRole._id, userId: mockUser._id });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Rôle attribué avec succès");
        expect(mockUser.role).toEqual(mockRole._id);
        expect(mockRole.users).toContain(mockUser._id.toString());
        expect(mockUser.save).toHaveBeenCalled();
        expect(mockRole.save).toHaveBeenCalled();
    });

    it("should fail to assign role with invalid roleId", async () => {
        const res = await request(app)
            .post("/api/roles/assign")
            .send({ roleId: "invalid-id", userId: new mongoose.Types.ObjectId() });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("ID de rôle invalide");
    });
});