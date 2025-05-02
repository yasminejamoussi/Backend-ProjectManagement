const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/server");
const User = require("../src/models/User");
require("dotenv").config();

describe("Auth Controller Tests", () => {
  //const mongoUri = "mongodb://testuser:testpass@mongo-test:27017/testdb?authSource=admin";
  const mongoUri = "mongodb://testuser:testpass@192.168.1.16:27018/testdb?authSource=admin";
  let userId; // ✅ Correction : Ajout de userId
  let authToken;
  let twoFaToken;

  const testUser = {
    firstname: "John",
    lastname: "Doe",
    email: "johndoe@test.com",
    phone: "+123456789",
    password: "Password123"
  };

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    if (mongoose.connection.readyState === 0) {
      console.log("🕐 Connexion à MongoDB...");
  
      await mongoose.connect(mongoUri );
    }

    let attempts = 0;
    while (mongoose.connection.readyState !== 1 && attempts < 5) {
      console.log(`🔄 Tentative ${attempts + 1} de connexion à MongoDB...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      attempts++;
    }

    if (mongoose.connection.readyState !== 1) {
      throw new Error("❌ Impossible de se connecter à MongoDB.");
    }

    console.log("✅ MongoDB connecté !");
    
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
    console.log("🛑 Connexion MongoDB fermée.");
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
  it("should login with correct credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: testUser.email,
      password: testUser.password
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
  });

  /*** TEST 4: Vérification du 2FA si nécessaire ***/
  it("should verify 2FA if required", async () => {
    if (twoFaToken) {
      const res = await request(app).post("/api/auth/verify-2fa").send({
        email: testUser.email,
        token: "123456"
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

  /*** ✅ TEST 6: Mise à jour de l'utilisateur ***/
  it("should update user details", async () => {
    expect(userId).toBeDefined(); // ✅ Vérifie que userId existe

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

  /*** ✅ TEST 7: Suppression d'un utilisateur ***/
  it("should delete a user", async () => {
    expect(userId).toBeDefined(); // ✅ Vérifie que userId existe

    const res = await request(app)
        .delete(`/api/auth/users/${userId}`)
        .set("Authorization", `Bearer ${authToken}`);

    console.log("📢 Delete User Response:", res.status, res.body);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("User deleted successfully");
  });
});
