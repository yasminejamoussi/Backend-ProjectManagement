const mongoose = require("mongoose");

// Connexion à la base de données de test avant tous les tests
beforeAll(async () => {
    const mongoUri = process.env.MONGO_TEST_URI || "mongodb://testuser:testpass@mongo-test:27017/testdb?authSource=admin";
    console.log("📢 Connexion à MongoDB pour les tests :", mongoUri);
    
    try {
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 30000,  // Augmentez à 30 secondes
            socketTimeoutMS: 45000,           // Timeout de socket étendu
            connectTimeoutMS: 30000           // Timeout de connexion étendu
        });
        console.log("✅ MongoDB connecté avec succès");
    } catch (error) {
        console.error("❌ Échec de connexion MongoDB :", error);
        throw error; // Fait échouer les tests si la connexion échoue
    }
});

// Nettoyer la base de données avant chaque test
beforeEach(async () => {
    try {
        const collections = mongoose.connection.collections;
        for (const key in collections) {
            await collections[key].deleteMany({});
        }
    } catch (error) {
        console.error("⚠️ Erreur lors du nettoyage :", error);
    }
});

// Fermer la connexion et nettoyer après tous les tests
afterAll(async () => {
    try {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        console.log("📢 Connexion MongoDB fermée après les tests");
    } catch (error) {
        console.error("⚠️ Erreur lors de la fermeture :", error);
    }
});