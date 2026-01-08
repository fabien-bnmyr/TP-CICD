// Configuration des variables d'environnement
import {config} from 'dotenv';

config();

import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// CORRECTION 1 : On remplace import.meta.dirname par process.cwd() pour la compatibilité Jest
const browserDistFolder = join(process.cwd(), 'dist/anything-ipsum/browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// Middleware pour parser le JSON
app.use(express.json());

// Configuration CORS
app.use(cors({
  origin: process.env['APP_URL'],
  credentials: true
}));

// Rate limiting pour l'API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limite à 50 requêtes par fenêtre
  message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({status: 'ok', timestamp: new Date().toISOString()});
});


// API endpoint pour générer le lorem ipsum
app.post('/api/generate-lorem', apiLimiter, async (req, res): Promise<void> => {
  try {
    const {theme, paragraphs, paragraphLength, stream = true} = req.body;

    // Validation des paramètres
    if (!theme || !theme.trim()) {
      res.status(400).json({
        success: false,
        error: 'Le thème est requis'
      });
      return;
    }

    if (!paragraphs || paragraphs < 1) {
      res.status(400).json({
        success: false,
        error: 'Le nombre de paragraphes doit être supérieur à 0'
      });
      return;
    }

    // Validation stricte de la longueur de paragraphe
    type ParagraphLength = 'court' | 'moyen' | 'long' | 'variable';
    const validLengths: ParagraphLength[] = ['court', 'moyen', 'long', 'variable'];

    if (!paragraphLength || !validLengths.includes(paragraphLength)) {
      res.status(400).json({
        success: false,
        error: 'La taille de paragraphe doit être : court, moyen, long ou variable'
      });
      return;
    }

    // Vérification de la clé API
    const apiKey = process.env['MISTRAL_API_KEY'];
    if (!apiKey || apiKey === 'your_mistral_api_key_here') {
      res.status(500).json({
        success: false,
        error: 'Clé API Mistral non configurée'
      });
      return;
    }

    // Mapping des tailles vers instructions avec typage strict
    const lengthInstructions: Record<ParagraphLength, string> = {
      'court': 'environ 1-10 phrases par paragraphe',
      'moyen': 'environ 10-20 phrases par paragraphe',
      'long': 'environ 20-30 phrases par paragraphe',
      'variable': 'longueur variable par paragraphe allant de 1 à 30 phrases',
    };

    // Préparation du prompt pour Mistral
    const prompt = `Génère un faux texte de type "lorem ipsum" sur le thème "${theme}".
Le texte doit contenir ${paragraphs} paragraphe(s), avec ${lengthInstructions[paragraphLength as ParagraphLength]}.

Règles importantes :
- Utilise un vocabulaire et des références liés au thème "${theme}"
- Les phrases doivent avoir une structure similaire au lorem ipsum (un peu artificielle mais lisible)
- Mélange des mots du thème avec des mots de liaison classiques
- Commence chaque paragraphe par une majuscule
- Assure-toi que le texte soit cohérent avec le thème choisi
- Le résultat doit être du texte de remplissage, pas du contenu informatif réel
- Respecte bien la consigne de longueur : ${lengthInstructions[paragraphLength as ParagraphLength]}

Réponds uniquement avec le texte généré, sans commentaires ni explications.`;

    // Configuration pour le streaming ou non
    const mistralConfig = {
      model: 'mistral-large-latest',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.7,
      stream: stream
    };

    // Appel à l'API Mistral
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(mistralConfig)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Erreur API Mistral:', response.status, errorData);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la génération du texte'
      });
      return;
    }

    if (stream) {
      // Configuration des headers pour le streaming
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Stream la réponse
      if (!response.body) {
        res.status(500).end('Erreur: pas de corps de réponse');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                res.end();
                return;
              }
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  // Nettoyer le contenu et l'envoyer
                  const cleanedContent = content.replace(/\*/g, '');
                  res.write(cleanedContent);
                }
              } catch {
                // Ignorer les erreurs de parsing JSON
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
        res.end();
      }
    } else {
      // Mode non-streaming (legacy)
      const data = await response.json();
      const generatedText = data.choices[0]?.message?.content;

      if (!generatedText) {
        res.status(500).json({
          success: false,
          error: 'Aucun texte généré'
        });
        return;
      }

      // Post-traitement pour nettoyer le texte généré
      const cleanedText = generatedText
        .trim()
        .replace(/\*/g, ''); // Supprime tous les astérisques

      res.json({
        success: true,
        text: cleanedText
      });
    }

  } catch (error) {
    console.error('Erreur lors de la génération:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur interne du serveur'
    });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * CORRECTION 2 : Démarrage conditionnel du serveur
 * On utilise process.env.NODE_ENV au lieu de import.meta.url
 * Cela empêche le serveur de démarrer tout seul pendant les tests
 */
if (process.env['NODE_ENV'] !== 'test') {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
export { app };