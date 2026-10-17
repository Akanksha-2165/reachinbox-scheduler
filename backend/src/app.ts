import express from 'express';
import cors from 'cors';
import { emailRouter } from './routes/emailRoutes.js';

export const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Health check route
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Primary email scheduler API endpoints
app.use('/api', emailRouter);
