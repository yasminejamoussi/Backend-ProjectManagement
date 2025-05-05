const request = require("supertest");
const mongoose = require("mongoose");
const argon2 = require("argon2");
const app = require("../src/server");
const Project = require("../src/models/Project");
const User = require("../src/models/User");
const Role = require("../src/models/Role");
require("dotenv").config();

describe("Project Controller Tests", () => {
  const mongoUri = process.env.TEST_MONGO_URI || "mongodb://testuser:testpass@mongo-test:27017/testdb?authSource=admin";
  let userId;
  let projectId;
  let projectManagerRoleId;

  const testUser = {
    firstname: "John",
    lastname: "Doe",
    email: "johndoe@test.com",
    phone: "+123456789",
    password: "Password123",
    role: null, // Sera défini dans beforeAll
  };

  const testProject = {
    name: "Test Project",
    description: "A test project",
    startDate: new Date("2025-06-01T00:00:00Z"),
    endDate: new Date("2025-12-01T00:00:00Z"),
    deliverables: ["Report", "Presentation"],
    projectManager: null,
    teamMembers: [],
    tasks: [],
  };

  beforeAll(async () => {
    prprocess.env.NODE_ENV = "test";

    const connectWithRetry = async (uri, maxAttempts = 5, delay = 5000) => {
      let attempts = 0;
      while (attempts < maxAttempts) {
        try {
          console.log(`🔄 Tentative ${attempts + 1} de connexion à MongoDB : ${uri}`);
          await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
          console.log("✅ MongoDB connecté !");
          return;
        } catch (error) {
          attempts++;
          console.error(`❌ Échec de la tentative ${attempts} : ${error.message}`);
          if (attempts === maxAttempts) {
            throw new Error(`❌ Impossible de se connecter à MongoDB après ${maxAttempts} tentatives : ${error.message}`);
          }
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    };

    const mongoUri = process.env.TEST_MONGO_URI || "mongodb://testuser:testpass@mongo-test:27017/testdb?authSource=admin";
    console.log("📢 URI MongoDB :", mongoUri);
    if (mongoose.connection.readyState === 0) {
      console.log("🕐 Connexion à MongoDB...");
      await connectWithRetry(mongoUri);
    }

    // Nettoyer les collections
    await User.deleteMany({});
    await Project.deleteMany({});
    await Role.deleteMany({});

    // Créer un rôle "Project Manager"
    const projectManagerRole = new Role({
      name: "Project Manager",
      description: "Responsable de la gestion de projets",
    });
    await projectManagerRole.save();
    projectManagerRoleId = projectManagerRole._id;
    console.log("📢 Role Project Manager créé avec ID:", projectManagerRoleId);

    testUser.role = projectManagerRoleId;
  });

  afterAll(async () => {
    await mongoose.connection.close();
    console.log("🛑 Connexion MongoDB fermée.");
  });

  beforeEach(async () => {
    await User.deleteMany({ email: testUser.email });
    await Project.deleteMany({});

    // Créer l'utilisateur directement via le modèle User
    const hashedPassword = await argon2.hash(testUser.password);
    const user = new User({
      firstname: testUser.firstname,
      lastname: testUser.lastname,
      email: testUser.email,
      phone: testUser.phone,
      password: hashedPassword,
      role: testUser.role,
    });
    await user.save();
    userId = user._id.toString();
    console.log("📢 User créé avec ID:", userId, "et rôle:", testUser.role);

    testProject.projectManager = userId;
  });

  /*** TEST 1: Création d'un nouveau projet ***/
  it("should create a new project", async () => {
    const res = await request(app).post("/api/projects").send(testProject);
    console.log("📢 Create Project Response:", res.status, res.body);

    expect(res.status).toBe(201);
    expect(res.body.project).toHaveProperty("name", testProject.name);
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

  /*** TEST 3: Récupérer tous les projets ***/
  it("should fetch all projects", async () => {
    await request(app).post("/api/projects").send(testProject);

    const res = await request(app).get("/api/projects").query({ projectManager: userId });
    console.log("📢 Fetch Projects Response:", res.status, res.body);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].projectManager._id.toString()).toBe(userId);
  });

  /*** TEST 4: Récupérer un projet par ID ***/
  it("should fetch a project by ID", async () => {
    const createRes = await request(app).post("/api/projects").send(testProject);
    projectId = createRes.body.project._id;

    const res = await request(app).get(`/api/projects/${projectId}`);
    console.log("📢 Fetch Project by ID Response:", res.status, res.body);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(testProject.name);
    expect(res.body._id.toString()).toBe(projectId.toString());
  });

  /*** TEST 5: Mettre à jour un projet ***/
  it("should update a project", async () => {
    const createRes = await request(app).post("/api/projects").send(testProject);
    projectId = createRes.body.project._id;

    const updatedData = { description: "Updated description" };
    const res = await request(app).put(`/api/projects/${projectId}`).send(updatedData);
    console.log("📢 Update Project Response:", res.status, res.body);

    expect(res.status).toBe(200);
    expect(res.body.description).toBe(updatedData.description);
  });

  /*** TEST 6: Échec de mise à jour si projectManager modifié ***/
  it("should fail to update projectManager", async () => {
    const createRes = await request(app).post("/api/projects").send(testProject);
    projectId = createRes.body.project._id;

    const invalidUpdate = { projectManager: "newUserId" };
    const res = await request(app).put(`/api/projects/${projectId}`).send(invalidUpdate);
    console.log("📢 Invalid Update Response:", res.status, res.body);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Le projectManager ne peut pas être modifié après la création.");
  });

  /*** TEST 7: Supprimer un projet ***/
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
});