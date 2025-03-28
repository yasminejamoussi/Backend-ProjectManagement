const mongoose = require("mongoose");

// Connexion à la base de données de test avant tous les tests
beforeAll(async () => {
    const mongoUri = process.env.MONGO_TEST_URI || "mongodb://testuser:testpass@mongo-test:27017/testdb?authSource=admin";
    console.log("📢 Connexion à MongoDB pour les tests :", mongoUri);
    await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
});

// Nettoyer la base de données avant chaque test
beforeEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

// Fermer la connexion et nettoyer après tous les tests
afterAll(async () => {
    await mongoose.connection.dropDatabase(); // Supprime la base de test
    await mongoose.connection.close();
    console.log("📢 Connexion MongoDB fermée après les tests");
});