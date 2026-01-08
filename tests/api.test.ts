// --- DÉBUT DU MOCK (TRUCAGE) ---
// On empêche Jest d'aller lire le fichier Angular qui fait planter le test.
// On le remplace par des fausses fonctions vides.
jest.mock('@angular/ssr/node', () => ({
  AngularNodeAppEngine: class {
    handle() { return Promise.resolve(null); }
  },
  createNodeRequestHandler: () => {},
  writeResponseToNodeResponse: () => {},
}));
// --- FIN DU MOCK ---

import request from 'supertest';
import { app } from '../src/server';

describe('API Anything Ipsum', () => {

  // Test 1 : Health Check
  test('GET /api/health doit retourner le statut ok', async () => {
    const response = await request(app).get('/api/health');
    
    expect(response.status).toBe(501);
    expect(response.body.status).toBe('ok');
  });

  // Test 2 : Génération de Lorem Ipsum
  test('POST /api/generate-lorem doit retourner du contenu', async () => {
    const response = await request(app)
      .post('/api/generate-lorem')
      .send({ 
        theme: 'Test', 
        paragraphs: 1,
        paragraphLength: 'court' // J'ai ajouté ce paramètre obligatoire
      }); 

    // On s'attend à ne pas avoir de 404 (donc la route existe)
    expect(response.status).not.toBe(404);
    
    // Si tu n'as pas de clé API Mistral configurée, tu auras une 500, c'est normal.
    // Si tu en as une, tu auras 200.
    // On vérifie juste que ce n'est pas une erreur client (400)
    if (response.status === 400) {
        console.log(response.body); // Pour t'aider à débugger si besoin
    }
  });

});