const mongoose = require("mongoose");
const { initializeRoles } = require("../src/controllers/roleController");

async function connectWithRetry(uri, retries = 5, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 60000,
        socketTimeoutMS: 60000,
        connectTimeoutMS: 60000,
        heartbeatFrequencyMS: 10000, // Maintient la connexion active
      });
      console.log("✅ MongoDB connecté avec succès");
      return;
    } catch (error) {
      console.error(`❌ Tentative ${i + 1}/${retries} échouée :`, error);
      if (i < retries - 1) await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error("Échec de connexion à MongoDB");
}

beforeAll(async () => {
  const mongoUri = "mongodb://testuser:testpass@mongo-test:27017/testdb?authSource=admin";
  console.log("📢 Connexion à MongoDB pour les tests :", mongoUri);
  await connectWithRetry(mongoUri);
  await mongoose.connection.dropDatabase(); // Nettoyage initial
  await initializeRoles(); // Initialisation une seule fois
}, 120000);

afterAll(async () => {
  try {
    await mongoose.connection.dropDatabase(); // Nettoyage final
    console.log("Base de données nettoyée");
  } catch (error) {
    console.error("❌ Nettoyage final échoué :", error);
  } finally {
    await mongoose.disconnect(); // Déconnexion en dernier
    console.log("MongoDB déconnecté");
  }
}, 30000);