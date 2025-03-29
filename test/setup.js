jest.mock('mongoose', () => {
    const actualMongoose = jest.requireActual('mongoose');
    const Schema = actualMongoose.Schema;

    // Objet connection modifiable pour permettre des tests dynamiques
    const connection = {
        readyState: 1, // Par défaut : connecté
        dropDatabase: jest.fn().mockResolvedValue(true),
        close: jest.fn().mockResolvedValue(true),
        collections: {
            users: { deleteMany: jest.fn().mockResolvedValue({}) }
        }
    };

    const mongooseMock = {
        ...actualMongoose,
        connect: jest.fn().mockResolvedValue({}),
        Schema: Object.assign(function (definition) {
            return new Schema(definition);
        }, {
            ...Schema,
            Types: {
                ObjectId: actualMongoose.Schema.Types.ObjectId // Pour générer des ObjectId
            }
        }),
        connection // Exporté comme objet modifiable
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