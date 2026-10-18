import express from 'express';
import cors from 'cors';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailRouter } from './routes/emailRoutes.js';
import { emailQueue } from './queues/emailQueue.js';
import { env } from './config/env.js';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/authRoutes.js';
import { slackRouter } from './routes/slackRoutes.js';

export const app = express();

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Bull Board: live view of the BullMQ queue
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath(env.BULL_BOARD_PATH);
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter });
app.use(env.BULL_BOARD_PATH, serverAdapter.getRouter());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/slack', slackRouter);
app.use('/api', emailRouter);