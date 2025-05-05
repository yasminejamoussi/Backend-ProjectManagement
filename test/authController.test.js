const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/server");
const User = require("../src/models/User");
require("dotenv").config();

describe("Auth Controller Tests", () => {
  //const mongoUri = "mongodb://testuser:testpass@mongo-test:27017/testdb?authSource=admin";
  const mongoUri = process.env.TEST_MONGO_URI || "mongodb://testuser:testpass@mongo-test:27017/testdb?authSource=admin";
  let userId; // ✅ Correction : Ajout de userId
  let authToken;
  let twoFaToken;

  const testUser = {
    firstname: "John",
    lastname: "Doe",
    email: "johndoe@test.com",
    phone: "+123456789",
    password: "Password123",
  };

  beforeAll(async () => {
    process.env.NODE_ENV = "test";

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
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
    console.log("🛑 Connexion MongoDB fermée.");
  });

  beforeEach(async () => {
    await User.deleteMany({ email: testUser.email });
    const res = await request(app).post("/api/auth/register").send(testUser);
    userId = res.body.user.id;
    console.log("📢 User ID initialized:", userId); // Log pour vérifier
  });

  /*** TEST 1: Inscription d'un nouvel utilisateur ***/
  it("should register a new user", async () => {
    await User.deleteMany({ email: testUser.email });

    const res = await request(app).post("/api/auth/register").send(testUser);
    console.log("📢 Register Response:", res.status, res.body);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.email).toBe(testUser.email);

    userId = res.body.user._id; // ✅ Stocke l'ID de l'utilisateur
  });

  /*** TEST 2: Tentative d'inscription avec un email existant ***/
  it("should fail to register a duplicate email", async () => {
    const res = await request(app).post("/api/auth/register").send(testUser);
    console.log("📢 Duplicate Register Response:", res.status, res.body);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email already exists");
  });

  /*** TEST 3: Connexion avec les bonnes informations ***/
 /* it("should login with correct credentials", async () => {
    // Mock de spawn pour simuler une réponse sans exécuter Python
    const spawnMock = jest.spyOn(require("child_process"), "spawn").mockReturnValue({
      stdout: {
        on: jest.fn((event, callback) => {
          if (event === "data") callback(Buffer.from(JSON.stringify({ status: "no_anomaly" })));
        }),
      },
      stderr: {
        on: jest.fn(),
      },
      on: jest.fn((event, callback) => {
        if (event === "close") callback(0); // Simule une exécution réussie
      }),
    });

    const res = await request(app).post("/api/auth/login").send({
      email: testUser.email,
      password: testUser.password,
    });
    console.log("📢 Login Response:", res.status, res.body);

    if (res.body.message === "2FA required") {
      twoFaToken = res.body.token;
      expect(res.status).toBe(200);
    } else {
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("token");
      authToken = res.body.token;
    }

    // Nettoyer le mock après le test
    spawnMock.mockRestore();
  }, 60000); */// Timeout de 60 secondes

  /*** TEST 4: Vérification du 2FA si nécessaire ***/
  it("should verify 2FA if required", async () => {
    if (twoFaToken) {
      const res = await request(app).post("/api/auth/verify-2fa").send({
        email: testUser.email,
        token: "123456",
      });
      console.log("📢 Verify 2FA Response:", res.status, res.body);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("token");
      authToken = res.body.token;
    } else {
      console.log("ℹ️ 2FA non activé, test ignoré.");
    }
  });

  /*** TEST 5: Récupérer les utilisateurs ***/
  it("should fetch all users", async () => {
    const res = await request(app)
      .get("/api/auth/users")
      .set("Authorization", `Bearer ${authToken}`);
    console.log("📢 Fetch Users Response:", res.status, res.body);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  /*** TEST 6: Mise à jour de l'utilisateur ***/
  it("should update user details", async () => {
    expect(userId).toBeDefined();
    const updatedData = { firstname: "Johnny", phone: "+987654321" };
    const res = await request(app)
      .put(`/api/auth/users/${userId}`)
      .send(updatedData)
      .set("Authorization", `Bearer ${authToken}`);
    console.log("📢 Update User Response:", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.firstname).toBe(updatedData.firstname);
    expect(res.body.phone).toBe(updatedData.phone);
  });

  /*** TEST 7: Suppression d'un utilisateur ***/
  it("should delete a user", async () => {
    expect(userId).toBeDefined();
    const res = await request(app)
      .delete(`/api/auth/users/${userId}`)
      .set("Authorization", `Bearer ${authToken}`);
    console.log("📢 Delete User Response:", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("User deleted successfully");
  });
});