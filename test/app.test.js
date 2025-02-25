// backend/test/server.test.js
const request = require('supertest');
const app = require('../src/server');
let server;  // Assurez-vous que votre app Express est exportée correctement
beforeAll(() => {
  process.env.PORT = 4001;  // Utilise un autre port pour les tests
});
afterAll(async () => {
  // Ferme le serveur après les tests
  if (server) {
    server.close();
  }
});

describe('Basic Server Test', () => {
  it('should respond with status 200 on root path', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);  // Vérifie que la réponse est OK (200)
  });
});
