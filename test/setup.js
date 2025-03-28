const mongoose = require("mongoose");
const { createRoles } = require("../src/controllers/roleController");

async function connectWithRetry(uri, retries = 5, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 60000,
        socketTimeoutMS: 60000,
        connectTimeoutMS: 60000,
      });
      console.log("✅ MongoDB connecté avec succès");
      return;
    } catch (error) {
      console.error(`❌ Tentative ${i + 1}/${retries} échouée :`, error);
      if (i < retries - 1) await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error("Échec de connexion à MongoDB après plusieurs tentatives");
}

beforeAll(async () => {
  const mongoUri = process.env.MONGO_TEST_URI || "mongodb://testuser:testpass@mongo-test:27017/testdb?authSource=admin";
  console.log("📢 Connexion à MongoDB pour les tests :", mongoUri);
  await connectWithRetry(mongoUri);
  await createRoles();
}, 120000); // 120s timeout

beforeEach(async () => {
  try {
    await mongoose.connection.db.dropDatabase();
    await createRoles(); // Ré-init des rôles après chaque test
  } catch (error) {
    console.error("❌ Nettoyage échoué :", error);
  }
});

afterAll(async () => {
  await mongoose.disconnect();
});