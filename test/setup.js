const mongoose = require("mongoose");

// Mock de la connexion MongoDB pour les tests
jest.spyOn(mongoose, "connect").mockImplementation(() => {
    console.log("📢 Mocking mongoose.connect for tests");
    return Promise.resolve({
        connection: mongoose.connection // Retourne un objet avec la connexion mockée
    });
});

// Mock de la propriété readyState directement
Object.defineProperty(mongoose.connection, "readyState", {
    value: 1, // Simuler une connexion prête
    writable: true,
});

// Mock des méthodes de connexion supplémentaires
mongoose.connection.close = jest.fn().mockResolvedValue();
mongoose.connection.dropDatabase = jest.fn().mockResolvedValue();

// Mock de Schema.Types.ObjectId pour éviter l'erreur
mongoose.Schema.Types = {
    ObjectId: jest.fn().mockImplementation((id) => {
        return { toString: () => id || "mocked-object-id" };
    })
};

// Mock de Schema pour les modèles
mongoose.Schema = jest.fn().mockImplementation(() => ({}));

// Mock de model pour les appels à mongoose.model
mongoose.model = jest.fn().mockReturnValue({
    find: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn(),
    // Ajoutez d'autres méthodes selon vos besoins
});

// Nettoyer les mocks avant chaque test
beforeEach(() => {
    jest.clearAllMocks();
});

// Fermer la connexion MongoDB après tous les tests
afterAll(async () => {
    await mongoose.connection.close();
});

console.log("📢 Mongoose mocké pour les tests");