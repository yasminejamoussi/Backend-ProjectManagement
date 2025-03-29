jest.mock('mongoose', () => {
    const actualMongoose = jest.requireActual('mongoose');
    const Schema = actualMongoose.Schema;
  
    return {
      ...actualMongoose,
      connect: jest.fn().mockResolvedValue({}),
      Schema: Object.assign(function (definition) {
        return new Schema(definition);
      }, {
        ...Schema,
        Types: {
          ObjectId: actualMongoose.Schema.Types.ObjectId
        }
      }),
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