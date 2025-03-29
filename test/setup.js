const mongoose = require("mongoose");
const { initializeRoles } = require("../src/controllers/roleController");

async function connectWithRetry(uri, retries = 10, delay = 6000) {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 60000,
        socketTimeoutMS: 60000,
        connectTimeoutMS: 60000,
        heartbeatFrequencyMS: 10000,
      });
      console.log("✅ MongoDB connecté avec succès !");
      return;
    } catch (error) {
      console.error(`❌ Tentative ${i + 1}/${retries} échouée :`, error);
      if (i < retries - 1) await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error("❌ Échec de connexion à MongoDB après plusieurs tentatives !");
}

beforeAll(async () => {
  const mongoUri = "mongodb://testuser:testpass@mongo-test:27017/testdb?authSource=admin";
  console.log("📢 Connexion à MongoDB pour les tests :", mongoUri);
  
  await connectWithRetry(mongoUri);

  if (mongoose.connection.readyState === 1) {
    console.log("✅ Connexion MongoDB établie, suppression de la base...");
    await mongoose.connection.dropDatabase();
  } else {
    throw new Error("❌ Connexion à MongoDB non établie après plusieurs tentatives.");
  }

  await initializeRoles();
}, 120000);

afterAll(async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      console.log("🧹 Base de données nettoyée après les tests.");
    }
  } catch (error) {
    console.error("❌ Échec du nettoyage final :", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB déconnecté.");
    
    // Empêcher Jest de rester bloqué
    mongoose.connection.removeAllListeners();
  }
}, 30000);
