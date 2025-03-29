const mongoose = require("mongoose");

// 1. Mock complet de Mongoose
jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue({}),
  connection: {
    readyState: 1,
    dropDatabase: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(true),
    collections: {
      users: { deleteMany: jest.fn().mockResolvedValue({}) },
      projects: { deleteMany: jest.fn().mockResolvedValue({}) }
    }
  },
  Schema: jest.fn(),
  model: jest.fn().mockReturnValue({
    find: jest.fn().mockReturnThis(),
    findOne: jest.fn().mockReturnThis(),
    save: jest.fn().mockResolvedValue({}),
    exec: jest.fn()
  }),
  set: jest.fn() // Pour les options comme socketTimeoutMS
}));

// 2. Réinitialisation des mocks avant chaque test
beforeEach(() => {
  jest.clearAllMocks();
});

// 3. Nettoyage final
afterAll(() => {
  jest.restoreAllMocks();
});