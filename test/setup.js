const mongoose = require("mongoose");
const { createRoles } = require("../src/controllers/roleController");

beforeAll(async () => {
  const mongoUri = process.env.MONGO_TEST_URI || "mongodb://testuser:testpass@mongo-test:27017/testdb?authSource=admin";
  
  console.log("📢 Connexion à MongoDB pour les tests :", mongoUri);

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 60000,
      socketTimeoutMS: 60000,
    });
    
    console.log("✅ MongoDB connecté");
    await createRoles(); // Initialisation CRUCIALE des rôles
  } catch (error) {
    console.error("❌ Erreur de connexion :", error);
    process.exit(1);
}
}, 60000);

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