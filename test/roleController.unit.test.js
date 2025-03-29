const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { initializeRoles, getRoles, createRole, updateRole, deleteRole, assignRoleToUser } = require("../src/controllers/roleController");
const Role = require("../src/models/Role");
const User = require("../src/models/User");

// Mock des dépendances
jest.mock("../src/models/Role");
jest.mock("../src/models/User");
jest.mock("mongoose"); // Suffisant si le mock global est dans setup.js

describe("Role Controller Tests", () => {
    let app, server;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.get("/api/roles", getRoles);
        app.post("/api/roles", createRole);
        app.put("/api/roles/:roleId", updateRole);
        app.delete("/api/roles/:roleId", deleteRole);
        app.post("/api/roles/assign", assignRoleToUser);
        server = app.listen(0); // Port dynamique
    });

    afterAll((done) => {
        server.close(done); // Ferme le serveur après les tests
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Test pour initializeRoles
    it("should initialize roles", async () => {
        Role.findOneAndUpdate.mockResolvedValue({});
        await expect(initializeRoles()).resolves.toBeUndefined();
        expect(Role.findOneAndUpdate).toHaveBeenCalledTimes(5);
    });

    it("should throw error if MongoDB connection fails", async () => {
        jest.spyOn(mongoose, "connection", "get").mockReturnValue({ readyState: 0 });
        jest.spyOn(global, "setTimeout").mockImplementation((cb) => cb());
        await expect(initializeRoles()).rejects.toThrow("Impossible de se connecter à MongoDB");
        console.log("Connection fail test completed");
    }, 10000);

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
        console.log("Create role fail (exists):", res.status, res.body);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Un rôle avec ce nom existe déjà.");
    });

    it("should fail to create role with invalid permissions", async () => {
        Role.findOne.mockResolvedValue(null);
        const res = await request(app)
            .post("/api/roles")
            .send({ name: "TestRole", permissions: ["invalid"] });
        console.log("Create role fail (permissions):", res.status, res.body);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Permissions invalides");
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
        console.log("Update role fail:", res.status, res.body);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe("ID de rôle invalide");
    });

});