const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/server");
const Project = require("../src/models/Project");
const User = require("../src/models/User");
require("dotenv").config();

describe("Project Controller Tests", () => {
  //const mongoUri = "mongodb://testuser:testpass@mongo-test:27017/testdb?authSource=admin";
  const mongoUri = process.env.TEST_MONGO_URI || "mongodb://testuser:testpass@mongo-test:27017/testdb?authSource=admin";
  let userId;
  let projectId;

  const testUser = {
    firstname: "John",
    lastname: "Doe",
    email: "johndoe@test.com",
    phone: "+123456789",
    password: "Password123",
  };

  const testProject = {
    name: "Test Project",
    description: "A test project",
    startDate: new Date("2025-06-01"),
    endDate: new Date("2025-12-01"),
    deliverables: ["Report", "Presentation"],
    projectManager: null,
    teamMembers: [],
    tasks: [],
  };

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    if (mongoose.connection.readyState === 0) {
      console.log("🕐 Connexion à MongoDB...");
      await mongoose.connect(mongoUri);
    }

    let attempts = 0;
    while (mongoose.connection.readyState !== 1 && attempts < 5) {
      console.log(`🔄 Tentative ${attempts + 1} de connexion à MongoDB...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      attempts++;
    }

    if (mongoose.connection.readyState !== 1) {
      throw new Error("❌ Impossible de se connecter à MongoDB.");
    }

    console.log("✅ MongoDB connecté !");
    await User.deleteMany({});
    await Project.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
    console.log("🛑 Connexion MongoDB fermée.");
  });

  beforeEach(async () => {
    await User.deleteMany({ email: testUser.email });
    await Project.deleteMany({});

    const res = await request(app).post("/api/auth/register").send(testUser);
    console.log("Register Response in beforeEach:", res.status, res.body);
    userId = res.body.user.id;
    console.log("📢 User ID initialized:", userId);

    testProject.projectManager = userId;
  });

  /*** TEST 1: Création d'un nouveau projet ***/
  it("should create a new project", async () => {
    const res = await request(app).post("/api/projects").send(testProject);
    console.log("📢 Create Project Response:", res.status, res.body);

    expect(res.status).toBe(201);
    expect(res.body.project).toHaveProperty("name", testProject.name);
   // expect(res.body.project.projectManager.toString()).toBe(userId);
    expect(res.body.project.projectManager._id.toString()).toBe(userId);
    expect(res.body.project.status).toBe("Pending");
    projectId = res.body.project._id;
  });

  /*** TEST 2: Échec de création avec données manquantes ***/
  it("should fail to create a project with missing required fields", async () => {
    const invalidProject = { ...testProject };
    delete invalidProject.name;

    const res = await request(app).post("/api/projects").send(invalidProject);
    console.log("📢 Invalid Create Response:", res.status, res.body);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Les champs obligatoires sont manquants.");
  });

  /*** TEST 3: Échec de création avec date de fin antérieure ***/
 /* it("should fail to create a project with end date before start date", async () => {
    const invalidProject = {
      ...testProject,
      endDate: new Date("2025-01-01"),
    };

    const res = await request(app).post("/api/projects").send(invalidProject);
    console.log("📢 Invalid Date Response:", res.status, res.body);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("End date must be after start date.");
  });*/

  /*** TEST 4: Récupérer tous les projets ***/
  it("should fetch all projects", async () => {
    await request(app).post("/api/projects").send(testProject);

    const res = await request(app).get("/api/projects").query({ projectManager: userId });
    console.log("📢 Fetch Projects Response:", res.status, res.body);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].projectManager._id.toString()).toBe(userId);
  });

  /*** TEST 5: Récupérer un projet par ID ***/
  it("should fetch a project by ID", async () => {
    const createRes = await request(app).post("/api/projects").send(testProject);
    projectId = createRes.body.project._id;

    const res = await request(app).get(`/api/projects/${projectId}`);
    console.log("📢 Fetch Project by ID Response:", res.status, res.body);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(testProject.name);
    expect(res.body._id.toString()).toBe(projectId.toString());
  });

  /*** TEST 6: Mettre à jour un projet ***/
  it("should update a project", async () => {
    const createRes = await request(app).post("/api/projects").send(testProject);
    projectId = createRes.body.project._id;

    const updatedData = { description: "Updated description" };
    const res = await request(app).put(`/api/projects/${projectId}`).send(updatedData);
    console.log("📢 Update Project Response:", res.status, res.body);

    expect(res.status).toBe(200);
    expect(res.body.description).toBe(updatedData.description);
  });

  /*** TEST 7: Échec de mise à jour si projectManager modifié ***/
  it("should fail to update projectManager", async () => {
    const createRes = await request(app).post("/api/projects").send(testProject);
    projectId = createRes.body.project._id;

    const invalidUpdate = { projectManager: "newUserId" };
    const res = await request(app).put(`/api/projects/${projectId}`).send(invalidUpdate);
    console.log("📢 Invalid Update Response:", res.status, res.body);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Le projectManager ne peut pas être modifié après la création.");
  });

  /*** TEST 8: Supprimer un projet ***/
  it("should delete a project", async () => {
    const createRes = await request(app).post("/api/projects").send(testProject);
    projectId = createRes.body.project._id;

    const res = await request(app).delete(`/api/projects/${projectId}`);
    console.log("📢 Delete Project Response:", res.status, res.body);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Projet et ses tâches supprimés avec succès");

    const deletedProject = await Project.findById(projectId);
    expect(deletedProject).toBeNull();
  });

  /*** TEST 9: Échec de suppression si projet inexistant ***/
 /* it("should fail to delete a non-existent project", async () => {
    const res = await request(app).delete(`/api/projects/123456789012`);
    console.log("📢 Invalid Delete Response:", res.status, res.body);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Projet non trouvé");
  });*/
});