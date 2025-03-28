const mongoose = require("mongoose");

// Mock global de mongoose
jest.mock("mongoose", () => {
    const mockConnection = {
        readyState: 1,
        close: jest.fn().mockResolvedValue(),
        dropDatabase: jest.fn().mockResolvedValue(),
        collections: {
            roles: { deleteMany: jest.fn().mockResolvedValue() },
            users: { deleteMany: jest.fn().mockResolvedValue() }
        }
    };
    const mockModel = jest.fn();
    return {
        connect: jest.fn().mockResolvedValue(mockConnection),
        connection: mockConnection,
        model: mockModel,
        Schema: jest.fn(() => ({})),
        Types: { ObjectId: jest.fn() }
    };
});

beforeEach(() => {
    jest.clearAllMocks();
});

afterAll(async () => {
    await mongoose.connection.close();
});

console.log("📢 Mongoose mocké pour les tests");