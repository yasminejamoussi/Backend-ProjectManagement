const mongoose = require("mongoose");

// Mock de la connexion MongoDB pour les tests
jest.spyOn(mongoose, "connect").mockImplementation(() => {
    console.log("📢 Mocking mongoose.connect for tests");
    return Promise.resolve();
});

jest.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);

// Nettoyer les mocks avant chaque test
beforeEach(() => {
    jest.clearAllMocks();
});

// Fermer la connexion MongoDB après tous les tests
afterAll(async () => {
    await mongoose.connection.close();
});