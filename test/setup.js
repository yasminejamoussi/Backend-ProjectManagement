const mongoose = require("mongoose");

// Mock complet de Mongoose avec Schema.Types
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    connect: jest.fn().mockResolvedValue({}),
    Schema: {
      Types: {
        ObjectId: actualMongoose.Schema.Types.ObjectId // <-- Correction clé
      }
    },
    connection: {
      readyState: 1,
      dropDatabase: jest.fn().mockResolvedValue(true),
      close: jest.fn().mockResolvedValue(true),
      collections: {
        users: { deleteMany: jest.fn().mockResolvedValue({}) }
      }
    },
    model: jest.fn().mockImplementation(() => ({
      find: jest.fn().mockReturnThis(),
      findOne: jest.fn().mockReturnThis(),
      save: jest.fn().mockResolvedValue({}),
      exec: jest.fn()
    }))
  };
});

beforeEach(() => jest.clearAllMocks());
afterAll(() => jest.restoreAllMocks());