require("dotenv").config();
process.env.JWT_SECRET = "secret";
process.env.JWT_EXPIRES_IN = "1h";

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const {
    createProject,
    getAllProjects,
    getProjectById,
    updateProject,
    deleteProject,
    predictDelay,
} = require("../src/controllers/projectController");
const Project = require("../src/models/Project");
const User = require("../src/models/User");
const Role = require("../src/models/Role");
const Task = require("../src/models/Task");
const { predictDelay: predictDelayUtil } = require("../src/utils/PrjctDelayPrediction");

jest.mock("../src/models/Project");
jest.mock("../src/models/User");
jest.mock("../src/models/Role");
jest.mock("../src/models/Task");
jest.mock("../src/utils/PrjctDelayPrediction");

describe("Project Controller Tests", () => {
    let app, server;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.post("/api/projects", createProject);
        app.get("/api/projects", getAllProjects);
        app.get("/api/projects/:id", getProjectById);
        app.put("/api/projects/:id", updateProject);
        app.delete("/api/projects/:id", deleteProject);
        app.get("/api/projects/:id/predict-delay", predictDelay);
        server = app.listen(0);
    });

    afterAll((done) => {
        server.close(done);
    });

    beforeEach(() => {
        jest.resetAllMocks();
    });

    // Test pour createProject
    it("should create a new project successfully", async () => {
        const mockManager = {
            _id: new mongoose.Types.ObjectId(),
            role: { name: "Project Manager" },
        };
        const mockTeamMember = {
            _id: new mongoose.Types.ObjectId(),
            role: { name: "Team Member" },
        };
        const mockRole = { _id: new mongoose.Types.ObjectId(), name: "Team Member" };
        const mockTask = {
            _id: new mongoose.Types.ObjectId(),
            title: "Task 1",
            status: "To Do",
            priority: "Medium",
        };
        const mockProject = {
            _id: new mongoose.Types.ObjectId(),
            name: "Test Project",
            description: "A test project",
            objectives: ["Objective 1"],
            status: "Pending",
            startDate: "2025-04-01",
            endDate: "2025-04-30",
            deliverables: ["Deliverable 1"],
            projectManager: mockManager._id,
            teamMembers: [mockTeamMember._id],
            tasks: [mockTask._id],
            save: jest.fn().mockResolvedValue(true),
        };
    
        User.findById.mockImplementation(() => ({
            populate: jest.fn().mockResolvedValue(mockManager),
        }));
        Role.find.mockResolvedValue([mockRole]);
        User.find.mockResolvedValue([mockTeamMember]);
        Task.insertMany.mockResolvedValue([mockTask]);
        Project.mockImplementation(() => mockProject);
    
        const res = await request(app)
            .post("/api/projects")
            .send({
                name: "Test Project",
                description: "A test project",
                objectives: ["Objective 1"],
                status: "Pending",
                startDate: "2025-04-01",
                endDate: "2025-04-30",
                deliverables: ["Deliverable 1"],
                projectManager: mockManager._id.toString(),
                teamMembers: [mockTeamMember._id.toString()],
                tasks: [{ title: "Task 1", status: "To Do", priority: "Medium" }],
            });
    
        expect(res.status).toBe(201);
        expect(res.body.name).toBe("Test Project");
        expect(mockProject.save).toHaveBeenCalledTimes(2); // Initial save + tasks update
    });

    it("should fail to create project if projectManager is invalid", async () => {
        User.findById.mockImplementation(() => ({
            populate: jest.fn().mockResolvedValue(null),
        }));
    
        const res = await request(app)
            .post("/api/projects")
            .send({
                name: "Test Project",
                projectManager: new mongoose.Types.ObjectId().toString(),
                startDate: "2025-04-01",
                endDate: "2025-04-30",
            });
    
        expect(res.status).toBe(422);
        expect(res.body.error).toBe("Le projectManager n'existe pas.");
    });

    // Test pour getAllProjects
    it("should get all projects with filters", async () => {
        const mockProject = {
            _id: new mongoose.Types.ObjectId(),
            name: "Test Project",
            status: "In Progress",
            projectManager: { firstname: "John", lastname: "Doe", email: "john@example.com" },
            teamMembers: [{ firstname: "Jane", lastname: "Doe", email: "jane@example.com", role: { name: "Team Member" } }],
            tasks: [],
        };

        Project.find.mockReturnValue({
            populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        sort: jest.fn().mockResolvedValue([mockProject]),
                    }),
                }),
            }),
        });

        const res = await request(app)
            .get("/api/projects")
            .query({ status: "In Progress", sortBy: "name", order: "asc" });

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].name).toBe("Test Project");
    });

    // Test pour getProjectById
    it("should get a project by ID", async () => {
        const mockProject = {
            _id: new mongoose.Types.ObjectId(),
            name: "Test Project",
            projectManager: { firstname: "John", lastname: "Doe", email: "john@example.com" },
            teamMembers: [{ firstname: "Jane", lastname: "Doe", email: "jane@example.com", role: { name: "Team Member" } }],
            tasks: [],
        };

        Project.findById.mockReturnValue({
            populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue(mockProject),
                }),
            }),
        });

        const res = await request(app).get(`/api/projects/${mockProject._id}`);

        expect(res.status).toBe(200);
        expect(res.body.name).toBe("Test Project");
    });

    it("should return 404 if project not found", async () => {
        Project.findById.mockReturnValue({
            populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue(null),
                }),
            }),
        });

        const res = await request(app).get(`/api/projects/${new mongoose.Types.ObjectId()}`);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Projet non trouvé");
    });

    // Test pour updateProject
    it("should update a project successfully", async () => {
        const mockProject = {
            _id: new mongoose.Types.ObjectId(),
            name: "Updated Project",
            description: "Updated description",
            projectManager: new mongoose.Types.ObjectId(),
            teamMembers: [new mongoose.Types.ObjectId()],
            tasks: [],
        };

        Project.findByIdAndUpdate.mockReturnValue({
            populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue(mockProject),
                }),
            }),
        });

        const res = await request(app)
            .put(`/api/projects/${mockProject._id}`)
            .send({ name: "Updated Project", description: "Updated description" });

        expect(res.status).toBe(200);
        expect(res.body.name).toBe("Updated Project");
    });

    it("should fail to update projectManager", async () => {
        const res = await request(app)
            .put(`/api/projects/${new mongoose.Types.ObjectId()}`)
            .send({ projectManager: new mongoose.Types.ObjectId().toString() });

        expect(res.status).toBe(403);
        expect(res.body.error).toBe("Le projectManager ne peut pas être modifié après la création.");
    });

    // Test pour deleteProject
    it("should delete a project and its tasks", async () => {
        const mockProject = { _id: new mongoose.Types.ObjectId() };
        Project.findByIdAndDelete.mockResolvedValue(mockProject);
        Task.deleteMany.mockResolvedValue({ deletedCount: 2 });
    
        const res = await request(app).delete(`/api/projects/${mockProject._id}`);
    
        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Projet et ses tâches supprimés avec succès");
        expect(Task.deleteMany).toHaveBeenCalledWith({ project: mockProject._id.toString() }); // Accepte la string
    });

    it("should return 404 if project to delete not found", async () => {
        Project.findByIdAndDelete.mockResolvedValue(null);

        const res = await request(app).delete(`/api/projects/${new mongoose.Types.ObjectId()}`);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Projet non trouvé");
    });

    // Test pour predictDelay
    it("should predict delay for a project", async () => {
        const mockProject = {
            _id: new mongoose.Types.ObjectId(),
            tasks: [{ status: "To Do" }],
            status: "In Progress",
            startDate: "2025-04-01",
            endDate: "2025-04-30",
        };
        const mockPrediction = {
            riskOfDelay: "Non",
            delayDays: 0,
            details: { progressExpected: "0%", tasksCompleted: "0%" },
        };

        Project.findById.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockProject),
        });
        predictDelayUtil.mockReturnValue(mockPrediction);

        const res = await request(app).get(`/api/projects/${mockProject._id}/predict-delay`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockPrediction);
        expect(predictDelayUtil).toHaveBeenCalledWith(mockProject);
    });

    it("should return 404 if project not found for predictDelay", async () => {
        Project.findById.mockReturnValue({
            populate: jest.fn().mockResolvedValue(null),
        });

        const res = await request(app).get(`/api/projects/${new mongoose.Types.ObjectId()}/predict-delay`);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Projet non trouvé");
    });
});