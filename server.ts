import express from 'express';
import { createServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function createServerApp() {
  const app = express();
  app.use(express.json());

  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  app.use(vite.middlewares);

  // Catch-all route to serve index.html for SPA routing
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  app.post('/api/chat', async (req, res) => {
    const { prompt, previousInteractionId, systemInstruction } = req.body;

    try {
      const interaction = await ai.interactions.create({
        model: 'gemini-3.8-flash',
        input: prompt,
        previous_interaction_id: previousInteractionId,
        system_instruction: systemInstruction,
      });

      res.json({
        interactionId: interaction.id,
        text: interaction.output_text,
      });
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ error: 'Failed to chat with AI coach' });
    }
  });

  app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
  });
}

createServerApp();
