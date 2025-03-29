jest.mock('mongoose', () => {
    const actualMongoose = jest.requireActual('mongoose');
    const Schema = actualMongoose.Schema;
    const connection = {
        readyState: 1,
        dropDatabase: jest.fn().mockResolvedValue(true),
        close: jest.fn().mockResolvedValue(true),
        collections: { users: { deleteMany: jest.fn().mockResolvedValue({}) } }
    };

    const mongooseMock = {
        ...actualMongoose,
        connect: jest.fn().mockResolvedValue({}),
        Schema: Object.assign(function (definition) {
            return new Schema(definition);
        }, {
            ...Schema,
            Types: { ObjectId: actualMongoose.Schema.Types.ObjectId }
        }),
        connection
    };

    // Getter personnalisé pour permettre à jest.spyOn de fonctionner
    Object.defineProperty(mongooseMock, 'connection', {
        get: () => connection,
        configurable: true
    });

    return mongooseMock;
});

// Réinitialiser les mocks avant chaque test
beforeEach(() => jest.clearAllMocks());

// Restaurer les mocks après tous les tests
afterAll(() => jest.restoreAllMocks());