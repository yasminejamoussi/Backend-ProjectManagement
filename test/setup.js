const mongoose = require("mongoose");
const { initializeRoles } = require("../src/controllers/roleController");

// Configuration spécifique pour MongoDB 4.4
mongoose.set('useNewUrlParser', true);
mongoose.set('useUnifiedTopology', true);
mongoose.set('serverSelectionTimeoutMS', 10000);  // 10 secondes
mongoose.set('socketTimeoutMS', 30000);          // 30 secondes
mongoose.set('bufferCommands', false);           // Désactive le buffering

beforeAll(async () => {
    console.log("🔌 Connexion à MongoDB pour les tests...");
    try {
        await mongoose.connect(process.env.MONGO_TEST_URI, {
            heartbeatFrequencyMS: 5000  // Ping toutes les 5s
        });
        await mongoose.connection.dropDatabase();
        await initializeRoles();
        console.log("✅ MongoDB connecté et initialisé");
    } catch (err) {
        console.error("❌ Échec connexion MongoDB:", err);
        throw err;
    }
}, 30000);  // Timeout étendu à 30s

afterEach(async () => {
    // Nettoyage plus robuste pour MongoDB 4.4
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
        console.log("📴 MongoDB déconnecté");
    }
});