const mongoose = require("mongoose");
const { initializeRoles } = require("../src/controllers/roleController");

// Configuration optimisée pour MongoDB 4.4
mongoose.set('socketTimeoutMS', 30000);
mongoose.set('serverSelectionTimeoutMS', 10000);
mongoose.set('bufferCommands', false);

beforeAll(async () => {
    console.log("🔌 Connexion à MongoDB pour les tests...");
    try {
        await mongoose.connect(process.env.MONGO_TEST_URI, {
            useNewUrlParser: true,       // Option passée dans connect()
            useUnifiedTopology: true,    // Option passée dans connect()
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 30000
        });
        await mongoose.connection.dropDatabase();
        await initializeRoles();
        console.log("✅ MongoDB connecté et initialisé");
    } catch (err) {
        console.error("❌ Échec connexion MongoDB:", err);
        throw err;
    }
}, 30000);

afterEach(async () => {
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